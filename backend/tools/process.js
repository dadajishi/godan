// tools/process.js — 进程/本地服务管理工具
// start: 后台启动命令（npm run dev 等），stdout/stderr 重定向到日志文件，可随时读取
// stop: 停止（按 pid 或 name）  status: 查询  list: 列出狗蛋管理的后台进程
// 返回统一结构 { success, output, error, exitCode }
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DATA_ROOT } = require("../paths");

const PROC_DIR = path.join(DATA_ROOT, "processes");
const PROC_DB = path.join(PROC_DIR, "processes.json");

// ============ 持久化 ============
function loadDB() {
    try {
        if (fs.existsSync(PROC_DB)) return JSON.parse(fs.readFileSync(PROC_DB, "utf8"));
    } catch (e) { /* ignore */ }
    return {};
}
function saveDB(db) {
    try {
        fs.mkdirSync(PROC_DIR, { recursive: true });
        fs.writeFileSync(PROC_DB, JSON.stringify(db, null, 2), "utf8");
    } catch (e) { /* ignore */ }
}

const db = loadDB(); // { [pid]: {pid, name, command, cwd, logFile, startedAt} }

function logFileFor(name) {
    const safe = String(name).replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40);
    return path.join(PROC_DIR, `${safe}-${Date.now()}.log`);
}

// ============ start ============
function start(params) {
    const command = String(params.command || params.cmd || "").trim();
    const name = String(params.name || (command.split(/\s+/)[0] || "process"));
    const cwd = params.cwd || os.homedir();
    if (!command) return { success: false, output: null, error: "缺少命令 (command)", exitCode: 1 };
    if (!fs.existsSync(cwd)) return { success: false, output: null, error: `工作目录不存在: ${cwd}`, exitCode: 1 };

    try {
        const logFile = logFileFor(name);
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        const out = fs.openSync(logFile, "a");

        // 用 shell 执行完整命令（如 "npm run dev"），detached 使其独立于后端生命周期
        const child = spawn(command, {
            cwd,
            shell: true,
            detached: true,
            stdio: ["ignore", out, out],
            env: { ...process.env }
        });

        const record = {
            pid: child.pid,
            name,
            command,
            cwd,
            logFile,
            startedAt: new Date().toISOString()
        };
        db[child.pid] = record;
        saveDB(db);

        // 父进程不等待子进程（detached + unref）
        child.unref();

        return {
            success: true,
            output: `已后台启动: ${name} (pid ${child.pid})\n命令: ${command}\n工作目录: ${cwd}\n日志: ${logFile}`,
            error: null,
            exitCode: 0,
            pid: child.pid,
            logFile
        };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// ============ stop ============
function stop(params) {
    try {
        const pid = parseInt(params.pid, 10);
        const name = params.name;

        let target = null;
        if (!isNaN(pid) && db[pid]) {
            target = db[pid];
        } else if (name) {
            target = Object.values(db).find(p => p.name === name);
        }
        if (!target) {
            return { success: false, output: null, error: `未找到正在管理的进程 (pid=${pid || "?"}, name=${name || "?"})`, exitCode: 1 };
        }

        // 先优雅 SIGTERM，2 秒后未退出再 SIGKILL
        process.kill(target.pid, "SIGTERM");
        const alive = () => { try { process.kill(target.pid, 0); return true; } catch (e) { return false; } };
        setTimeout(() => {
            try {
                if (alive()) process.kill(target.pid, "SIGKILL");
            } catch (e) { /* ignore */ }
        }, 2000);

        delete db[target.pid];
        saveDB(db);
        return { success: true, output: `已停止: ${target.name} (pid ${target.pid})`, error: null, exitCode: 0 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// ============ status ============
function status(params) {
    try {
        const pid = parseInt(params.pid, 10);
        const name = params.name;
        let targets = Object.values(db);
        if (!isNaN(pid)) targets = targets.filter(p => p.pid === pid);
        if (name) targets = targets.filter(p => p.name === name);
        if (targets.length === 0) return { success: true, output: "没有匹配的后台进程", error: null, exitCode: 0 };

        const lines = targets.map(p => {
            const alive = (() => { try { process.kill(p.pid, 0); return true; } catch (e) { return false; } })();
            return `${p.name} | pid ${p.pid} | ${alive ? "运行中" : "已退出"} | 命令: ${p.command} | 日志: ${p.logFile}`;
        });
        return { success: true, output: lines.join("\n"), error: null, exitCode: 0 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// ============ list ============
function list() {
    try {
        const entries = Object.values(db);
        if (entries.length === 0) return { success: true, output: "没有正在管理的后台进程", error: null, exitCode: 0 };
        const lines = entries.map(p => {
            const alive = (() => { try { process.kill(p.pid, 0); return true; } catch (e) { return false; } })();
            return `${p.name} | pid ${p.pid} | ${alive ? "运行中" : "已退出"} | ${p.command}`;
        });
        return { success: true, output: lines.join("\n"), error: null, exitCode: 0 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// ============ readLog（读取进程日志尾部）============
function readLog(params) {
    try {
        const pid = parseInt(params.pid, 10);
        const name = params.name;
        let target = null;
        if (!isNaN(pid) && db[pid]) target = db[pid];
        else if (name) target = Object.values(db).find(p => p.name === name);
        if (!target || !fs.existsSync(target.logFile)) {
            return { success: false, output: null, error: "未找到进程日志", exitCode: 1 };
        }
        const lines = fs.readFileSync(target.logFile, "utf8").split("\n").filter(Boolean);
        const tail = lines.slice(-50).join("\n");
        return { success: true, output: tail || "(日志为空)", error: null, exitCode: 0 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

module.exports = {
    name: "process",
    description: "后台启动/停止/查询本地服务进程（npm run dev 等），支持读取进程日志",
    actions: { start, stop, status, list, readLog }
};
