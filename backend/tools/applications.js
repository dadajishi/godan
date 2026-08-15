// tools/applications.js — 应用启动/检测/关闭/重启工具
// macOS: open / osascript；Windows: start / tasklist / taskkill；Linux: xdg-open / pgrep
// 返回统一结构 { success, output, error, exitCode }
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

function run(cmd, args, timeout = 15000) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stdout || "", error: (stderr || err.message || "").trim() });
            else resolve({ ok: true, output: stdout || "", error: "" });
        });
    });
}

// 解析应用名：兼容 "Blender" / "Blender.app" / "/Applications/Blender.app" / "com.blender.app"
function resolveApp(name) {
    const n = String(name || "").trim();
    if (!n) return null;
    if (n.endsWith(".app") && fs.existsSync(n)) return n;
    if (n.includes("/")) {
        // 路径 → 尝试直接找 .app
        for (const cand of [n, n + ".app"]) {
            if (fs.existsSync(cand)) return cand;
        }
        return n;
    }
    // 裸名 → 在 /Applications 和 ~/Applications 下查找
    const candidates = [
        path.join("/Applications", n + ".app"),
        path.join("/Applications", n.replace(/\.app$/, "") + ".app"),
        path.join(process.env.HOME || "", "Applications", n + ".app"),
        path.join(process.env.HOME || "", "Applications", n.replace(/\.app$/, "") + ".app")
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return n; // 找不到就交给 open -a 处理（按系统注册名）
}

// P4-1 M2: 系统注册查询（macOS，标准路径未命中时兜底）——mdfind → lsregister
// 不硬编码任何应用，对任意应用通用
function queryRegisteredApp(name) {
    const base = String(name).replace(/\.app$/, "");
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new Promise((resolve) => {
        // 1. Spotlight 索引查询（快，~100ms）
        execFile("mdfind", ["kMDItemContentType == 'com.apple.application-bundle' && kMDItemFSName == '" + base + ".app'"], { timeout: 8000 }, (err, stdout) => {
            const line = String(stdout || "").split("\n").map(s => s.trim()).find(Boolean);
            if (!err && line && line.endsWith(".app")) return resolve(line);
            // 2. LaunchServices 注册表 dump（慢但全量，~1-3s）
            const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
            execFile(lsregister, ["-dump"], { timeout: 15000, maxBuffer: 64 * 1024 * 1024 }, (err2, out2) => {
                if (err2 || !out2) return resolve(null);
                const re = new RegExp("^\\s*path:\\s*(.+?" + escaped + "\\.app)", "m");
                const m = String(out2).match(re);
                resolve(m ? m[1] : null);
            });
        });
    });
}

// P4-1 M2: 增强解析（标准路径 → 系统注册 → 裸名兜底）
async function resolveAppAsync(name) {
    const fast = resolveApp(name);
    if (fast && fast !== name) return { path: fast, resolved: true }; // 标准路径命中
    if (process.platform === "darwin") {
        const reg = await queryRegisteredApp(name);
        if (reg) return { path: reg, resolved: true };
    }
    return { path: fast, resolved: false }; // 未找到真实路径
}

async function openApp(params) {
    const name = params.name || params.app || params.target;
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };

    // 可选：同时打开文件（如 Blender + .blend）
    const file = params.file || params.openFile || null;
    const platform = process.platform;

    try {
        if (platform === "darwin") {
            const { path: appPath, resolved } = await resolveAppAsync(name);
            // 关键修复（260 根因）: open -a 只能传注册名，不能传去掉 .app 的路径。
            // 解析到真实 .app 路径 → open <路径> [file]（直接打开，可附带文件）；
            // 未解析 → open -a <注册名> [file]（按 LaunchServices 注册名查找）
            const args = resolved
                ? [appPath]
                : ["-a", appPath.replace(/\.app$/, "")];
            if (file) args.push(String(file));
            const r = await run("open", args);
            if (r.ok) {
                return { success: true, output: `已启动 ${name}${file ? " 并打开 " + file : ""}${resolved ? "" : "（按系统注册名）"}`, error: null, exitCode: 0, appPath: resolved ? appPath : null };
            }
            if (!resolved) {
                // 标准路径 + 系统注册都未找到 → 明确错误（避免 Agent 反复尝试同一裸名）
                return {
                    success: false, output: null,
                    error: `应用「${name}」无法打开：已检查 /Applications/` + (name.replace(/\.app$/, "") + ".app") + `、~/Applications 及系统应用注册(mdfind/lsregister)，均未找到。请确认应用已安装，或提供完整 .app 路径（如 /Applications/` + name.replace(/\.app$/, "") + `.app）。原始错误: ${r.error}`,
                    exitCode: 1, appNotFound: true
                };
            }
            return { success: false, output: null, error: r.error || null, exitCode: 1, appPath };
        }
        if (platform === "win32") {
            const args = ["", name];
            if (file) args.push(String(file));
            const r = await run("start", args);
            return { success: r.ok, output: r.ok ? `已启动 ${name}` : null, error: r.error || null, exitCode: r.ok ? 0 : 1 };
        }
        // linux
        const appPath = resolveApp(name);
        const args = [appPath];
        if (file) args.push(String(file));
        const r = await run("xdg-open", args);
        return { success: r.ok, output: r.ok ? `已启动 ${name}` : null, error: r.error || null, exitCode: r.ok ? 0 : 1 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

async function isRunning(params) {
    const name = String(params.name || params.app || params.target || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    const processName = name.replace(/\.app$/, "");

    try {
        if (process.platform === "darwin") {
            const script = `application "${processName}" is running`;
            const r = await run("osascript", ["-e", script]);
            const running = r.ok && /true/i.test(r.output);
            return { success: true, output: running ? `运行中: ${name}` : `未运行: ${name}`, error: null, exitCode: 0, running };
        }
        if (process.platform === "win32") {
            const r = await run("tasklist", ["/FI", `IMAGENAME eq ${processName}.exe`]);
            const running = r.ok && r.output.toLowerCase().includes(processName.toLowerCase() + ".exe");
            return { success: true, output: running ? `运行中: ${name}` : `未运行: ${name}`, error: null, exitCode: 0, running };
        }
        const r = await run("pgrep", ["-x", processName]);
        const running = r.ok && r.output.trim().length > 0;
        return { success: true, output: running ? `运行中: ${name}` : `未运行: ${name}`, error: null, exitCode: 0, running };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

async function closeApp(params) {
    const name = String(params.name || params.app || params.target || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    const processName = name.replace(/\.app$/, "");

    try {
        if (process.platform === "darwin") {
            const r = await run("osascript", ["-e", `tell application "${processName}" to quit`]);
            if (r.ok) return { success: true, output: `已关闭 ${name}`, error: null, exitCode: 0 };
            // 优雅退出失败 → 提示（可能需要自动化权限）
            return { success: false, output: null, error: "关闭失败（可能缺少自动化权限，或应用未运行）: " + r.error, exitCode: 1 };
        }
        if (process.platform === "win32") {
            const r = await run("taskkill", ["/IM", `${processName}.exe`, "/F"]);
            return { success: r.ok, output: r.ok ? `已关闭 ${name}` : null, error: r.error || null, exitCode: r.ok ? 0 : 1 };
        }
        const r = await run("pkill", ["-x", processName]);
        return { success: r.ok, output: r.ok ? `已关闭 ${name}` : null, error: r.error || null, exitCode: r.ok ? 0 : 1 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

async function restart(params) {
    const name = String(params.name || params.app || params.target || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    const closed = await closeApp({ name });
    // 等待退出
    await new Promise(r => setTimeout(r, 800));
    const opened = await openApp({ name, file: params.file });
    if (opened.success) return { success: true, output: `已重启 ${name}`, error: null, exitCode: 0 };
    return { success: false, output: null, error: `重启失败: ${opened.error || ""}${closed.error ? " (关闭: " + closed.error + ")" : ""}`, exitCode: 1 };
}

module.exports = {
    name: "applications",
    description: "启动/检测/关闭/重启桌面应用（Blender、浏览器、VS Code 等），可附带打开文件",
    actions: { open: openApp, isRunning, close: closeApp, restart }
};
