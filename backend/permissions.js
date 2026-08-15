// permissions.js — Godan 权限系统（P3-6 强化版）
// ============================================================
// 模型: 工具级 → 工具 + 动作 + 参数 + 目标资源 + 上下文
//   classify(tool, action, params, context)
//   context: {taskId?, goal?, secure?} （goal=LLM 决策意图，secure=目标疑似密码框）
//
// 决策顺序（fail closed，未知绝不静默 SAFE）:
//   1. 明确 DANGEROUS（黑名单/系统关键路径/不可逆）
//   2. 明确敏感资源（凭证/密码框/网络写操作）
//   3. 明确需要确认（删除/覆盖/写/网络/进程/未知命令）
//   4. 明确 SAFE（只读白名单/低风险本机操作）
//   5. 未知 → CONFIRM
//
// 每次判定返回: {level, reason, rule?, resource?}
//   rule: 规则标识（审计/前端展示用）
//
// 安全红线:
//   - DANGEROUS 永不放行（autoApprove/retry/replanner/watch 均不可绕过）
//   - AXSecureTextField 输入 → CONFIRM，且敏感内容绝不允许进入日志/WM/Context
//   - 确认操作绑定 taskId（防并发任务串台）
// ============================================================
const path = require("path");
const os = require("os");

// ============ DANGEROUS：系统关键路径（写入/删除时）============
const SYSTEM_PATHS = [
    "/System", "/etc", "/usr", "/bin", "/sbin", "/private/etc", "/cores", "/dev",
    "/var/db", "/Library/Preferences", "/Library/LaunchDaemons", "/Library/LaunchAgents",
    "/Applications" // 删除/写入应用目录本身
];

// 用户目录下的敏感 dotfiles（任何写操作都拒绝）
const SENSITIVE_USER_PATHS = [".ssh", ".gnupg", ".aws", ".docker", ".kube", ".netrc", ".gradle", ".m2", ".config/gcloud"];

// ============ DANGEROUS：shell 命令黑名单（正则，不可逆/系统级）============
const SHELL_BLACKLIST = [
    /\bsudo\b/, /\bsu\s+-/, /\bshutdown\b/, /\breboot\b/, /\bhalt\b/, /\bpoweroff\b/,
    /\bmkfs(\.|\b)/, /\bdd\b/, /\bfdisk\b/, /\bparted\b/, /\bcryptsetup\b/,
    /\bdiskutil\b/, /\bumount\b/, /\brm\s+-rf\s+\//, /\brm\s+-rf\s+~(\\s|$)/,
    /\brm\s+-rf\s+\*\s*$/, /\bchmod\s+-R\s+777\s+\//, /\bchown\s+-R\b.*\s+\//,
    /\bkill\s+-9\s+1\b/, /\bpkill\s+-9\s+-f\s+"/, /\binit\s+[06]\b/,
    /\:\(\)\{\s*\|/, /\b>\s*\/\s*dev\/(sda|sdb|disk)/, /\bcurl\b.*\|\s*sh\b/,
    /\bwget\b.*\|\s*sh\b/, /\bchflags\s+-R/, /\brm\s+-rf\s+--no-preserve-root/,
    /\brm\s+-rf\s+\.\s*$/, /\brm\s+-rf\s+\.\s+\//, /\bpasswd\b/, /\bdscacheutil\b/,
    /\bsecurity\b.*\b(add-generic-password|set-keychain|delete)/, /\bscutil\b.*\b(remove|set)/
];

// ============ shell 命令分类 ============
// 只读命令白名单（首词精确匹配；子命令如 git status 单独判断）
const READONLY_COMMANDS = new Set([
    "ls", "pwd", "cat", "head", "tail", "find", "grep", "which", "whoami", "date", "uname",
    "echo", "df", "du", "free", "ps", "env", "printenv", "wc", "sort", "uniq", "stat", "file",
    "type", "hash", "history", "jobs", "alias", "pgrep", "lsof", "netstat", "command", "basename",
    "dirname", "realpath", "readlink", "xargs", "tr", "cut", "awk", "sed", "locale", "getconf",
    "sysctl", "open", "say", "sleep", "true", "false", "test", "[", "time",
    "cd", // shell builtin，无副作用（目录切换）
    "sh", "bash", "zsh" // shell 包装，按内容递归判断（见 classifyShell 2.5）
]);

// 明确写/修改/进程类命令 → CONFIRM（按参数进一步分级）
const WRITE_COMMANDS = new Set([
    "rm", "mv", "cp", "chmod", "chown", "chflags", "mkdir", "touch", "ln", "printf", "tee",
    "kill", "pkill", "killall", "launchctl", "defaults", // defaults write 写
    "install", "unlink", "truncate", "patch", "make", "cargo", "go", "pip", "pip3"
]);

// 网络/外部通信命令 → CONFIRM（或只读模式 SAFE）
const NETWORK_COMMANDS = new Set([
    "ssh", "scp", "rsync", "sftp", "telnet", "nc", "ncat", "ftp", "wget", "aria2c",
    "git", // push/pull/fetch/clone 网络
    "npm", // publish/install 网络+写
    "curl", // 写参数才 CONFIRM
    "pip", "pip3", // install 网络+写
    "osascript", // 可控制应用（保守 CONFIRM）
    "sendmail", "mail"
]);

// git 只读子命令
const GIT_READONLY_SUB = new Set(["status", "diff", "log", "branch", "show", "remote", "config", "ls-files", "rev-parse", "describe", "tag", "stash", "check-ignore"]);
// git 写/网络子命令
const GIT_WRITE_SUB = new Set(["add", "commit", "push", "pull", "fetch", "clone", "merge", "rebase", "reset", "checkout", "rm", "mv", "restore", "clean", "init", "switch", "cherry-pick", "revert", "tag", "apply", "am"]);

// npm 只读子命令
const NPM_READONLY_SUB = new Set(["view", "ls", "search", "info", "config", "root", "bin", "prefix", "whoami", "version", "get"]);
// npm 写/网络子命令
const NPM_WRITE_SUB = new Set(["install", "i", "add", "remove", "uninstall", "update", "publish", "run", "start", "test", "exec", "init", "link", "pack"]);

// curl 写/发送参数（带这些 → CONFIRM）
const CURL_WRITE_FLAGS = /-(o|O|d|F|T|X|U|u|e|E|b|c|H|A)\b|--output|--data|--form|--upload|--request|--user|--header|--cookie|--proxy|--referer|--cert|--key\b/;

// GUI 危险语义词（mouse/keyboard 的 goal 检查，保守规则）
// 注意: 词必须精确——裸"清空"曾误伤"清空计算器输入"(按C键)这类无害操作，已收敛为破坏性场景；
//      "确认/confirm"同样误伤"点击确认按钮"的普通对话框交互，已移除（危险语义由删除/购买/支付等词覆盖）
const GUI_CONFIRM_WORDS = /删除|移除|购买|支付|付款|下单|发送|发布|提交|卸载|格式化|退出登录|注销|清空(?:回收站|垃圾|缓存|浏览器数据|历史记录)|delete|remove|purchase|buy|pay|send|publish|submit|uninstall|format|logout|sign\s*out|empty\s+trash/i;
const GUI_DANGEROUS_WORDS = /rm\s+-rf|格式化|format|清空回收站|empty\s+trash|wipe|shred/i;

// 敏感字段名（redact 用）
const SENSITIVE_KEYS = /password|passwd|token|secret|api[_-]?key|private[_-]?key|credential|cookie|authorization|bearer|密码|口令/i;
// 敏感内容模式（keyboard.type 文本 / 字符串值）
const SENSITIVE_VALUE_RE = /(password|passwd|token|secret|api[_-]?key|credential)[=:\s]+[^\s,;|]+/gi;

// ============ 路径规范化 ============
function normalize(p) {
    if (!p) return "";
    return path.resolve(p.replace(/^~(?=\/|$)/, os.homedir()));
}

// ============ 路径分级 ============
function classifyPath(target, write) {
    if (!target) return { level: "SAFE", reason: "", rule: "" };
    const p = normalize(target);
    const home = os.homedir();

    if (write) {
        for (const sp of SYSTEM_PATHS) {
            if (p === sp || p.startsWith(sp + path.sep)) {
                return { level: "DANGEROUS", reason: `系统关键路径不允许修改: ${sp}`, rule: "SYSTEM_PATH_WRITE" };
            }
        }
        for (const s of SENSITIVE_USER_PATHS) {
            const sp = path.join(home, s);
            if (p === sp || p.startsWith(sp + path.sep)) {
                return { level: "DANGEROUS", reason: `敏感配置目录不允许修改: ~/${s}`, rule: "SENSITIVE_PATH_WRITE" };
            }
        }
        if (p === home || p === "/") {
            return { level: "DANGEROUS", reason: "不允许对目录根执行破坏性操作", rule: "ROOT_PATH_WRITE" };
        }
        // home 根目录 shell/配置文件 dotfile（写入可注入持久命令 → 至少 CONFIRM，审计发现）
        const HOME_DOTFILES = [".bashrc", ".zshrc", ".profile", ".bash_profile", ".zprofile",
            ".bash_aliases", ".zshenv", ".zshrc.local", ".gitconfig", ".vimrc", ".inputrc",
            ".config/fish/config.fish", ".cshrc", ".tcshrc"];
        for (const d of HOME_DOTFILES) {
            if (p === path.join(home, d)) {
                return { level: "CONFIRM", reason: `home 配置文件不允许直接写入: ~/${d}（可注入持久命令）`, rule: "HOME_DOTFILE_WRITE" };
            }
        }
        // 凭证类文件（写/删）
        if (/(\.ssh|\.gnupg|\.aws|\.netrc|\.kube|\.env$|credential|secret|token|\.pem$|\.key$|id_rsa|id_ed25519)/.test(p)) {
            return { level: "DANGEROUS", reason: `敏感文件不允许修改/删除: ${path.basename(p)}`, rule: "SENSITIVE_FILE_WRITE" };
        }
    }
    return { level: "SAFE", reason: "", rule: "" };
}

// ============ shell 命令解析 ============
// 引号感知的命令链分割（| ; && || & 分段，正确处理 ' " 引号与转义）
// 安全原则: 每一段（pipeline 任一段、顺序执行任一段）都必须独立经过权限分类，
//           任意一段出现危险/需确认命令 → 整个命令提升到对应等级。
function splitChains(cmd) {
    const parts = [];
    let cur = "", inS = null, esc = false;
    for (let i = 0; i < cmd.length; i++) {
        const ch = cmd[i];
        if (esc) { cur += ch; esc = false; continue; }
        if (ch === "\\" && inS) { cur += ch; esc = true; continue; }
        if (inS) {
            cur += ch;
            if (ch === inS) inS = null;
            continue;
        }
        if (ch === "'" || ch === '"') { inS = ch; cur += ch; continue; }
        if (ch === "|" || ch === ";" || ch === "&") {
            if (cur.trim()) parts.push(cur.trim());
            cur = "";
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

// 取单段命令的首词与参数
function parseCommand(command) {
    const cmd = String(command || "").trim().replace(/^env\s+/, "");
    const m = cmd.match(/^([^\s]+)(.*)$/s);
    return m ? { bin: m[1], args: (m[2] || "").trim() } : { bin: cmd, args: "" };
}

// 提取 sh/bash/zsh 的 -c/--command/-e 后代码（引号包裹或裸代码）
function extractShellCode(args) {
    const m = args.match(/(?:-c|--command|-e)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(\S+))$/);
    if (!m) return null;
    let code = m[1];
    if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
        code = code.slice(1, -1);
    }
    return code || null;
}

// 提取解释器 -e/-c 后的内联代码
function extractInterpCode(args) {
    const m = args.match(/(?:-c|-e|--eval)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(\S+))$/);
    if (!m) return null;
    let code = m[1];
    if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
        code = code.slice(1, -1);
    }
    return code || null;
}

// 解释器内联代码静态扫描（含绕过路径关键字 → 至少 CONFIRM）
const INTERP_DANGEROUS_RE = /os\.system|os\.popen|os\.remove|os\.unlink|os\.rmdir|shutil\.rmtree|shutil\.move|subprocess|child_process|execSync|execFile|spawn|exec\(|eval\(|require\(|\bimport\s|\bfrom\s+\S+\s+import|open\([^)]*['"]w|writeFileSync|writeFile|appendFile|unlinkSync|rmSync|rmdir\b|rm\s+-rf|curl|wget|sudo|chmod|chown|killall|pkill|mkfs|\bdd\b|\/etc\/|\.ssh|password|token|secret/i;

// 等级合并：DANGEROUS > CONFIRM > SAFE
function mergeLevels(levels) {
    let worst = "SAFE";
    for (const l of levels) {
        if (l === "DANGEROUS") return "DANGEROUS";
        if (l === "CONFIRM") worst = "CONFIRM";
    }
    return worst;
}

// shell 分级（fail closed）
// 注意: 内部递归 depth 限制（防 sh -c "sh -c "sh -c ..."" 无限嵌套）；超过 3 层 → CONFIRM
function classifyShell(command, depth = 0) {
    const cmd = String(command || "").trim();
    if (!cmd) return { level: "DANGEROUS", reason: "空命令", rule: "EMPTY_COMMAND" };
    if (depth > 3) return { level: "CONFIRM", reason: `命令嵌套过深(${depth}层)，无法可靠静态分析，需要确认`, rule: "NESTED_TOO_DEEP" };

    // 1. 黑名单 → DANGEROUS（整体文本检查，先于分段）
    for (const re of SHELL_BLACKLIST) {
        if (re.test(cmd)) {
            return { level: "DANGEROUS", reason: `命令被列入危险黑名单: ${re}`, rule: "SHELL_BLACKLIST" };
        }
    }

    // 2. 分段（| ; && || &），每段独立分类，取最高等级（S1-b）
    const segments = splitChains(cmd);
    if (segments.length > 1) {
        const levels = segments.map(seg => classifyShell(seg, depth + 1));
        const worst = mergeLevels(levels.map(l => l.level));
        if (worst !== "SAFE") {
            const bad = levels.find(l => l.level === worst);
            return { level: worst, reason: `命令链中存在${worst === "DANGEROUS" ? "危险" : "需确认"}操作: ${(bad && bad.reason) || ""}`, rule: "CHAIN_" + worst };
        }
        // 全 SAFE → 落到单段逻辑（冗余但无害）
    }

    const { bin, args } = parseCommand(cmd);
    const binName = bin.replace(/^\.\//, "");

    // 2.5. sh/bash/zsh 包装: 必须递归分析 -c/--command 内层代码（S1-a）
    if (["sh", "bash", "zsh", "dash", "ksh"].includes(binName)) {
        if (/(^|\s)-c\s|(^|\s)--command\s|(^|\s)-e\s/.test(args)) {
            const code = extractShellCode(args);
            if (!code) {
                return { level: "CONFIRM", reason: `${binName} 内联代码无法可靠解析，需要确认`, rule: "SHELL_CODE_UNPARSEABLE" };
            }
            const inner = classifyShell(code, depth + 1);
            if (inner.level !== "SAFE") {
                return { level: inner.level, reason: `${binName} -c 内层命令${inner.level === "DANGEROUS" ? "危险" : "需确认"}: ${inner.reason}`, rule: "SHELL_WRAPPER_" + inner.level };
            }
            return { level: "SAFE", reason: "", rule: "SHELL_WRAPPER_SAFE" };
        }
        // 无 -c（运行脚本文件）: 脚本内容不可知 → CONFIRM（fail closed）
        return { level: "CONFIRM", reason: `${binName} 运行脚本文件，内容不可静态分析，需要确认`, rule: "SHELL_SCRIPT_FILE" };
    }

    // 2.55. 命令执行包装器（command/time/xargs/builtin/exec/nohup 等前缀）:
    //       真正的命令是剩余参数 → 递归分析（审计发现的 S1 残余绕过面:
    //       `command rm x`、`ls | xargs rm` 此前被当 SAFE）
    const CMD_WRAPPERS = new Set(["command", "time", "xargs", "builtin", "exec", "nohup", "setsid", "nice", "ionice"]);
    if (CMD_WRAPPERS.has(binName)) {
        // 去掉包装器自身的选项参数（如 xargs -n 1、time -p），取剩余命令
        const rest = args.replace(/^\s*(?:-[a-zA-Z0-9]|--[a-z-]+)(?:\s+\S+)*\s+/, "").trim();
        if (!rest) {
            return { level: "CONFIRM", reason: `${binName} 后无命令，需要确认`, rule: "WRAPPER_EMPTY" };
        }
        const inner = classifyShell(rest, depth + 1);
        if (inner.level !== "SAFE") {
            return { level: inner.level, reason: `${binName} 包装的命令${inner.level === "DANGEROUS" ? "危险" : "需确认"}: ${inner.reason}`, rule: "CMD_WRAPPER_" + inner.level };
        }
        return { level: "SAFE", reason: "", rule: "CMD_WRAPPER_SAFE" };
    }

    // 2.6. 解释器（node/python 等）: 内联代码静态扫描，脚本文件内容不可知 → CONFIRM（S1-c）
    if (["node", "python3", "python", "ruby", "perl", "deno", "bun"].includes(binName)) {
        if (/^(\s|$)|-{0,2}(V|version|h|help|e)$/.test(args.trim()) || !args) {
            return { level: "SAFE", reason: "", rule: "INTERP_QUERY" };
        }
        if (/(^|\s)-c\s|(^|\s)-e\s|(^|\s)--eval\s/.test(args)) {
            const code = extractInterpCode(args);
            if (!code) {
                return { level: "CONFIRM", reason: `${binName} 内联代码无法可靠解析，需要确认`, rule: "INTERP_CODE_UNPARSEABLE" };
            }
            if (INTERP_DANGEROUS_RE.test(code)) {
                return { level: "CONFIRM", reason: `${binName} 内联代码含敏感操作（文件/进程/网络/系统调用），需要确认`, rule: "INTERP_CODE_DANGEROUS" };
            }
            return { level: "SAFE", reason: "", rule: "INTERP_CODE_SAFE" };
        }
        // 运行脚本文件 / -m 模块: 内容不可知 → CONFIRM
        return { level: "CONFIRM", reason: `${binName} 运行脚本文件/模块，内容不可静态分析，需要确认`, rule: "INTERP_SCRIPT_FILE" };
    }

    // 3. 明确只读命令 → SAFE
    if (READONLY_COMMANDS.has(binName) && !WRITE_COMMANDS.has(binName) && !NETWORK_COMMANDS.has(binName)) {
        // 特例: 只读命令带重定向/原地修改 → CONFIRM
        if (/>|>>/.test(args) && /(cat|echo|printf|tee|sed|awk|sort|head|tail)/.test(binName)) {
            return { level: "CONFIRM", reason: `只读命令带重定向写入文件: ${binName}`, rule: "REDIRECT_WRITE" };
        }
        if ((binName === "sed" || binName === "awk") && /-i/.test(args)) {
            return { level: "CONFIRM", reason: `sed/awk -i 会原地修改文件，需要确认`, rule: "INPLACE_WRITE" };
        }
        return { level: "SAFE", reason: "", rule: "READONLY_COMMAND" };
    }

    // 4. git 子命令分级
    if (binName === "git") {
        const sub = (args.match(/^\s*([a-z-]+)/) || [])[1] || "";
        if (GIT_READONLY_SUB.has(sub)) return { level: "SAFE", reason: "", rule: "GIT_READONLY" };
        if (GIT_WRITE_SUB.has(sub)) return { level: "CONFIRM", reason: `git ${sub} 会修改仓库/网络，需要确认`, rule: "GIT_WRITE" };
        return { level: "CONFIRM", reason: `git 未知子命令(${sub || "?"})，需要确认`, rule: "GIT_UNKNOWN" };
    }

    // 5. npm 子命令分级
    if (binName === "npm") {
        const sub = (args.match(/^\s*([a-z-]+)/) || [])[1] || "";
        if (NPM_READONLY_SUB.has(sub)) return { level: "SAFE", reason: "", rule: "NPM_READONLY" };
        if (NPM_WRITE_SUB.has(sub)) return { level: "CONFIRM", reason: `npm ${sub} 会修改依赖/网络，需要确认`, rule: "NPM_WRITE" };
        return { level: "CONFIRM", reason: `npm 未知子命令(${sub || "?"})，需要确认`, rule: "NPM_UNKNOWN" };
    }

    // 6. curl: 只读 GET → SAFE；带写/发送参数 → CONFIRM
    if (binName === "curl") {
        if (CURL_WRITE_FLAGS.test(args)) {
            return { level: "CONFIRM", reason: "curl 带写/发送参数（上传/提交数据/凭证），需要确认", rule: "NETWORK_WRITE" };
        }
        return { level: "SAFE", reason: "", rule: "CURL_GET" };
    }

    // 7. 明确写/修改/进程类命令 → CONFIRM（黑名单已排除最危险；带系统路径参数 → DANGEROUS）
    if (WRITE_COMMANDS.has(binName)) {
        // 提取路径参数（rm /etc/hosts、mv a /usr/bin/x 等）→ 系统关键路径直接 DANGEROUS
        const pathArgs = args.split(/\s+/).filter(a => /^[~/]|^\.{1,2}\//.test(a));
        for (const pa of pathArgs) {
            const cp = classifyPath(pa, true);
            if (cp.level === "DANGEROUS") return cp;
        }
        return { level: "CONFIRM", reason: `写/修改类命令 ${binName} 需要确认`, rule: "WRITE_COMMAND" };
    }

    // 8. 网络命令 → CONFIRM
    if (NETWORK_COMMANDS.has(binName)) {
        return { level: "CONFIRM", reason: `网络/外部通信命令 ${binName} 需要确认`, rule: "NETWORK_COMMAND" };
    }

    // 9. brew 子命令分级
    if (["brew"].includes(binName)) {
        const sub = (args.match(/^\s*([a-z-]+)/) || [])[1] || "";
        if (["info", "list", "search", "outdated"].includes(sub)) return { level: "SAFE", reason: "", rule: "BREW_READONLY" };
        return { level: "CONFIRM", reason: `brew ${sub || "?"} 会安装/修改软件，需要确认`, rule: "BREW_WRITE" };
    }

    // 10. 未知命令 → CONFIRM（fail closed！Unknown must never silently become SAFE）
    return { level: "CONFIRM", reason: `未知命令「${binName}」默认需要确认（fail closed）`, rule: "UNKNOWN_COMMAND" };
}

// ============ GUI 语义分级（goal 检查） ============
function classifyGoal(goal) {
    const g = String(goal || "");
    if (!g) return { level: "SAFE", reason: "", rule: "" };
    if (GUI_DANGEROUS_WORDS.test(g)) {
        return { level: "DANGEROUS", reason: `操作语义涉及破坏性行为: ${g.slice(0, 50)}`, rule: "GUI_DANGEROUS_SEMANTIC" };
    }
    if (GUI_CONFIRM_WORDS.test(g)) {
        return { level: "CONFIRM", reason: `操作语义涉及敏感行为（删除/购买/发送/发布等）: ${g.slice(0, 50)}`, rule: "GUI_SENSITIVE_SEMANTIC" };
    }
    return { level: "SAFE", reason: "", rule: "" };
}

// ============ 敏感内容 redact（日志/WM/Context 层） ============
function redactSensitive(obj) {
    if (Array.isArray(obj)) return obj.map(redactSensitive);
    if (obj && typeof obj === "object") {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (SENSITIVE_KEYS.test(k)) out[k] = "[REDACTED]";
            else out[k] = redactSensitive(v);
        }
        return out;
    }
    if (typeof obj === "string" && SENSITIVE_KEYS.test(obj)) {
        // 含敏感字段名的字符串 → 整体打码（无法安全切片，如 "hunter2password" 无分隔符；
        // 宁可多打码，绝不泄露）
        return "[REDACTED]";
    }
    return obj;
}

// ============ 统一分类入口 ============
// classify(tool, action, params, context) — context 可选（兼容旧调用）
// context: {taskId?, goal?, secure?}
function classify(tool, action, params = {}, context) {
    const ctx = context || {};
    const goal = String(ctx.goal || "");
    const target = params.target || params.path || params.file || params.src || params.command || params.cmd || "";

    switch (tool) {
        case "shell": {
            return classifyShell(params.command || params.cmd || "");
        }

        case "filesystem": {
            const writeOps = ["delete", "write", "move", "copy", "rename", "mkdir", "batch"];
            if (action === "delete") {
                const p = classifyPath(target, true);
                if (p.level !== "SAFE") return { ...p, resource: String(target).slice(0, 120) };
                return { level: "CONFIRM", reason: "删除操作需要确认", rule: "FILE_DELETE", resource: String(target).slice(0, 120) };
            }
            if (action === "write") {
                const p = classifyPath(target, true);
                if (p.level !== "SAFE") return { ...p, resource: String(target).slice(0, 120) };
                try {
                    if (require("fs").existsSync(normalize(target))) {
                        return { level: "CONFIRM", reason: "覆盖已存在文件需要确认", rule: "FILE_OVERWRITE", resource: String(target).slice(0, 120) };
                    }
                } catch (e) { /* ignore */ }
                return { level: "SAFE", reason: "", rule: "FILE_CREATE", resource: String(target).slice(0, 120) };
            }
            if (action === "move" || action === "copy" || action === "rename") {
                const p = classifyPath(target, true);
                if (p.level !== "SAFE") return { ...p, resource: String(target).slice(0, 120) };
                const dest = classifyPath(params.dest || params.to, true);
                if (dest.level !== "SAFE") return { ...dest, resource: String(params.dest || params.to).slice(0, 120) };
                return { level: "CONFIRM", reason: `${action} 操作需要确认`, rule: "FILE_MOVE", resource: String(target).slice(0, 120) };
            }
            if (writeOps.includes(action)) {
                const p = classifyPath(target, true);
                return { ...p, resource: p.level === "DANGEROUS" ? String(target).slice(0, 120) : undefined };
            }
            // 只读: list/read/search
            return { level: "SAFE", reason: "", rule: "FILE_READ" };
        }

        case "applications": {
            if (action === "close" || action === "restart") {
                return { level: "CONFIRM", reason: `${action} 应用需要确认`, rule: "APP_CLOSE" };
            }
            return { level: "SAFE", reason: "", rule: "APP_READ" };
        }

        case "process": {
            if (action === "stop" || action === "kill") {
                return { level: "CONFIRM", reason: "停止进程需要确认", rule: "PROCESS_STOP" };
            }
            return { level: "SAFE", reason: "", rule: "PROCESS_READ" };
        }

        case "keyboard": {
            if (action === "type") {
                const text = String(params.text || "");
                // 1. 输入内容本身含敏感字段 → CONFIRM
                if (SENSITIVE_KEYS.test(text)) {
                    return { level: "CONFIRM", reason: "检测到敏感字段内容输入（密码/token/secret 等），需确认", rule: "SENSITIVE_INPUT", resource: "[REDACTED]" };
                }
                // 2. 目标疑似密码框（context.secure 由环境上下文提供）
                if (ctx.secure && /密码|password|passwd|登录|login|credential/i.test(goal)) {
                    return { level: "CONFIRM", reason: "输入目标疑似密码框（AXSecureTextField），需确认", rule: "SECURE_FIELD_INPUT" };
                }
                // 3. GUI 危险语义
                const g = classifyGoal(goal);
                if (g.level !== "SAFE") return g;
                return { level: "SAFE", reason: "", rule: "KEYBOARD_TYPE" };
            }
            // hotkey/press
            const g2 = classifyGoal(goal);
            if (g2.level !== "SAFE") return g2;
            return { level: "SAFE", reason: "", rule: "KEYBOARD_SHORTCUT" };
        }

        case "mouse": {
            const g = classifyGoal(goal);
            if (g.level !== "SAFE") return g;
            return { level: "SAFE", reason: "", rule: "MOUSE_ACTION" };
        }

        case "ui": {
            if (action === "click" || action === "clickElement") {
                const g = classifyGoal(goal);
                if (g.level !== "SAFE") return g;
            }
            return { level: "SAFE", reason: "", rule: "UI_READ" };
        }

        // 截图/窗口/watch: 只读观察（watch 触发后的动作仍走本函数判定）
        case "screenshot":
        case "window":
        case "watch":
            return { level: "SAFE", reason: "", rule: "OBSERVE" };

        default:
            // fail closed：未知工具 → CONFIRM（绝不静默 SAFE）
            return { level: "CONFIRM", reason: `未知工具「${tool}」默认需要确认（fail closed）`, rule: "UNKNOWN_TOOL" };
    }
}

module.exports = { classify, classifyPath, classifyShell, classifyGoal, normalize, redactSensitive, SYSTEM_PATHS, SENSITIVE_KEYS };
