// permissions.js — Godan 电脑操作权限系统（后端强制，不信任前端/LLM）
// 三级权限：
//   SAFE      → 直接执行（查看/读取/创建/打开应用/只读 shell）
//   CONFIRM   → 不自动执行，进入待确认队列，用户批准后执行（删除/覆盖/kill 等）
//   DANGEROUS → 直接拒绝（sudo/系统关键目录/磁盘操作/不可逆命令）
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

// ============ DANGEROUS：shell 命令黑名单（正则）============
const SHELL_BLACKLIST = [
    /\bsudo\b/, /\bsu\s+-/, /\bshutdown\b/, /\breboot\b/, /\bhalt\b/, /\bpoweroff\b/,
    /\bmkfs(\.|\b)/, /\bdd\b/, /\bfdisk\b/, /\bparted\b/, /\bcryptsetup\b/,
    /\bdiskutil\b/, /\bumount\b/, /\brm\s+-rf\s+\//, /\brm\s+-rf\s+~(\s|$)/,
    /\brm\s+-rf\s+\*\s*$/, /\bchmod\s+-R\s+777\s+\//, /\bchown\s+-R\b.*\s+\//,
    /\bkill\s+-9\s+1\b/, /\bpkill\s+-9\s+-f\s+"/, /\binit\s+[06]\b/,
    /\:\(\)\{\s*\|/, /\b>\/\s*dev\/(sda|sdb|disk)/, /\bcurl\b.*\|\s*sh\b/,
    /\bwget\b.*\|\s*sh\b/, /\bchflags\s+-R/, /\brm\s+-rf\s+--no-preserve-root/
];

// ============ 路径规范化工具 ============
function normalize(p) {
    if (!p) return "";
    return path.resolve(p.replace(/^~(?=\/|$)/, os.homedir()));
}

// ============ 核心分类 ============

// 路径级别：write=true 表示写入/删除/移动等破坏性操作
function classifyPath(target, write) {
    if (!target) return { level: "SAFE", reason: "" };
    const p = normalize(target);
    const home = os.homedir();

    if (write) {
        // 系统关键路径 → DANGEROUS
        for (const sp of SYSTEM_PATHS) {
            if (p === sp || p.startsWith(sp + path.sep)) {
                return { level: "DANGEROUS", reason: `系统关键路径不允许修改: ${sp}` };
            }
        }
        // 敏感 dotfiles → DANGEROUS
        for (const s of SENSITIVE_USER_PATHS) {
            const sp = path.join(home, s);
            if (p === sp || p.startsWith(sp + path.sep)) {
                return { level: "DANGEROUS", reason: `敏感配置目录不允许修改: ~/${s}` };
            }
        }
        // 家目录根/根目录本身 → DANGEROUS（防 rm -rf ~ 误伤）
        if (p === home || p === "/") {
            return { level: "DANGEROUS", reason: "不允许对目录根执行破坏性操作" };
        }
    }
    return { level: "SAFE", reason: "" };
}

// shell 命令级别
function classifyShell(command) {
    const cmd = String(command || "");
    if (!cmd.trim()) return { level: "DANGEROUS", reason: "空命令" };
    for (const re of SHELL_BLACKLIST) {
        if (re.test(cmd)) {
            return { level: "DANGEROUS", reason: `命令被列入危险黑名单: ${re}` };
        }
    }
    return { level: "SAFE", reason: "" };
}

// 统一分类入口：tool + action + params → {level, reason}
function classify(tool, action, params = {}) {
    const target = params.target || params.path || params.file || params.src || params.command || "";

    switch (tool) {
        case "filesystem": {
            const writeOps = ["delete", "write", "move", "copy", "rename", "mkdir", "batch"];
            if (action === "delete") {
                const p = classifyPath(target, true);
                if (p.level === "DANGEROUS") return p;
                return { level: "CONFIRM", reason: "删除操作需要确认" };
            }
            if (action === "write") {
                // 新文件 SAFE；覆盖已存在文件 → CONFIRM
                const p = classifyPath(target, true);
                if (p.level === "DANGEROUS") return p;
                try {
                    if (require("fs").existsSync(normalize(target))) {
                        return { level: "CONFIRM", reason: "覆盖已存在文件需要确认" };
                    }
                } catch (e) { /* ignore */ }
                return { level: "SAFE", reason: "" };
            }
            if (action === "move" || action === "copy" || action === "rename") {
                const p = classifyPath(target, true);
                if (p.level === "DANGEROUS") return p;
                const dest = classifyPath(params.dest || params.to, true);
                if (dest.level === "DANGEROUS") return dest;
                return { level: "CONFIRM", reason: `${action} 操作需要确认` };
            }
            if (writeOps.includes(action)) {
                const p = classifyPath(target, true);
                return p; // mkdir/batch 等按路径判定
            }
            return { level: "SAFE", reason: "" }; // list/read/search 只读
        }
        case "shell": {
            return classifyShell(target);
        }
        case "applications": {
            if (action === "close" || action === "restart") {
                return { level: "CONFIRM", reason: `${action} 应用需要确认` };
            }
            return { level: "SAFE", reason: "" }; // open/isRunning
        }
        case "process": {
            if (action === "stop" || action === "kill") {
                return { level: "CONFIRM", reason: "停止进程需要确认" };
            }
            return { level: "SAFE", reason: "" }; // start/status/list
        }
        default:
            return { level: "SAFE", reason: "" };
    }
}

module.exports = { classify, classifyPath, classifyShell, normalize, SYSTEM_PATHS };
