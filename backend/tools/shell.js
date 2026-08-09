// tools/shell.js — Shell 命令执行工具
// 动作: exec
// 安全: 命令黑名单在 permissions.classifyShell 判定（DANGEROUS 拒绝）
// 返回统一结构 { success, output, error, exitCode }
const { execFile } = require("child_process");

function exec(params) {
    const command = String(params.command || params.cmd || "").trim();
    if (!command) {
        return { success: false, output: null, error: "缺少命令 (command)", exitCode: 1 };
    }
    const cwd = params.cwd || params.dir || undefined;
    const timeout = Math.min(parseInt(params.timeout || 60000, 10), 300000); // 上限 5 分钟

    return new Promise((resolve) => {
        // 用 /bin/sh -c 执行（macOS/Linux），Windows 用 cmd /c
        const shell = process.platform === "win32" ? "cmd" : "/bin/sh";
        const args = process.platform === "win32" ? ["/c", command] : ["-c", command];
        execFile(shell, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: process.env }, (err, stdout, stderr) => {
            if (err) {
                // 超时/被杀也返回结构化信息
                resolve({
                    success: false,
                    output: stdout ? stdout.slice(-4000) : null,
                    error: (stderr || err.message || "").slice(-4000),
                    exitCode: typeof err.code === "number" ? err.code : 1,
                    timedOut: err.killed || /ETIMEDOUT|signal/i.test(err.message || "")
                });
            } else {
                resolve({
                    success: true,
                    output: (stdout || "").slice(-8000),
                    error: stderr ? stderr.slice(-4000) : null,
                    exitCode: 0
                });
            }
        });
    });
}

module.exports = {
    name: "shell",
    description: "执行 shell 命令（terminal 操作），可指定 cwd 工作目录；返回 stdout/stderr/退出码",
    actions: { exec }
};
