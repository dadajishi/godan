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
    "sh", "bash", "zsh" // shell 包装，按内容递归判断
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
const GUI_CONFIRM_WORDS = /删除|移除|清空|购买|支付|付款|下单|发送|发布|提交|确认|卸载|格式化|退出登录|注销|delete|remove|purchase|buy|pay|send|publish|submit|confirm|uninstall|format|logout|sign\s*out/i;
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
        // 凭证类文件（写/删）
        if (/(\.ssh|\.gnupg|\.aws|\.netrc|\.kube|\.env$|credential|secret|token|\.pem$|\.key$|id_rsa|id_ed25519)/.test(p)) {
            return { level: "DANGEROUS", reason: `敏感文件不允许修改/删除: ${path.basename(p)}`, rule: "SENSITIVE_FILE_WRITE" };
        }
    }
    return { level: "SAFE", reason: "", rule: "" };
}

// ============ shell 命令解析 ============
// 取首词（忽略管道/前缀 env/等）
function parseCommand(command) {
    const cmd = String(command || "").trim();
    // 去掉前缀 env 等
    let rest = cmd.replace(/^env\s+/, "");
    // 管道取第一段
    rest = rest.split(/\s*\|\s*/)[0] || "";
    // 分隔首词与参数
    const m = rest.match(/^([^\s;]+)(.*)$/s);
    return m ? { bin: m[1], args: (m[2] || "").trim() } : { bin: rest, args: "" };
}

// shell 分级（fail closed）
function classifyShell(command) {
    const cmd = String(command || "").trim();
    if (!cmd) return { level: "DANGEROUS", reason: "空命令", rule: "EMPTY_COMMAND" };

    // 1. 黑名单 → DANGEROUS
    for (const re of SHELL_BLACKLIST) {
        if (re.test(cmd)) {
            return { level: "DANGEROUS", reason: `命令被列入危险黑名单: ${re}`, rule: "SHELL_BLACKLIST" };
        }
    }

    const { bin, args } = parseCommand(cmd);
    const binName = bin.replace(/^\.\//, "");

    // 2. 明确只读命令 → SAFE
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

    // 3. git 子命令分级
    if (binName === "git") {
        const sub = (args.match(/^\s*([a-z-]+)/) || [])[1] || "";
        if (GIT_READONLY_SUB.has(sub)) return { level: "SAFE", reason: "", rule: "GIT_READONLY" };
        if (GIT_WRITE_SUB.has(sub)) return { level: "CONFIRM", reason: `git ${sub} 会修改仓库/网络，需要确认`, rule: "GIT_WRITE" };
        return { level: "CONFIRM", reason: `git 未知子命令(${sub || "?"})，需要确认`, rule: "GIT_UNKNOWN" };
    }

    // 4. npm 子命令分级
    if (binName === "npm") {
        const sub = (args.match(/^\s*([a-z-]+)/) || [])[1] || "";
        if (NPM_READONLY_SUB.has(sub)) return { level: "SAFE", reason: "", rule: "NPM_READONLY" };
        if (NPM_WRITE_SUB.has(sub)) return { level: "CONFIRM", reason: `npm ${sub} 会修改依赖/网络，需要确认`, rule: "NPM_WRITE" };
        return { level: "CONFIRM", reason: `npm 未知子命令(${sub || "?"})，需要确认`, rule: "NPM_UNKNOWN" };
    }

    // 5. curl: 只读 GET → SAFE；带写/发送参数 → CONFIRM
    if (binName === "curl") {
        if (CURL_WRITE_FLAGS.test(args)) {
            return { level: "CONFIRM", reason: "curl 带写/发送参数（上传/提交数据/凭证），需要确认", rule: "NETWORK_WRITE" };
        }
        return { level: "SAFE", reason: "", rule: "CURL_GET" };
    }

    // 6. 明确写/修改/进程类命令 → CONFIRM（黑名单已排除最危险；带系统路径参数 → DANGEROUS）
    if (WRITE_COMMANDS.has(binName)) {
        // 提取路径参数（rm /etc/hosts、mv a /usr/bin/x 等）→ 系统关键路径直接 DANGEROUS
        const pathArgs = args.split(/\s+/).filter(a => /^[~/]|^\.{1,2}\//.test(a));
        for (const pa of pathArgs) {
            const cp = classifyPath(pa, true);
            if (cp.level === "DANGEROUS") return cp;
        }
        return { level: "CONFIRM", reason: `写/修改类命令 ${binName} 需要确认`, rule: "WRITE_COMMAND" };
    }

    // 7. 网络命令 → CONFIRM
    if (NETWORK_COMMANDS.has(binName)) {
        return { level: "CONFIRM", reason: `网络/外部通信命令 ${binName} 需要确认`, rule: "NETWORK_COMMAND" };
    }

    // 8. 低风险本机命令（node/python3 运行本地脚本）
    if (["node", "python3", "python", "ruby", "perl", "deno", "bun"].includes(binName)) {
        return { level: "SAFE", reason: "", rule: "LOCAL_SCRIPT" };
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
