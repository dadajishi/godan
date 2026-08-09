// tools/window.js — 窗口/应用管理工具（P2）
// list: 列出前台应用窗口（osascript System Events，需辅助功能权限）
// focus: 激活指定应用（macOS tell application to activate；win/linux 降级）
const { execFile } = require("child_process");

function run(cmd, args, timeout = 15000) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stdout || "", error: (stderr || err.message || "").trim() });
            else resolve({ ok: true, output: stdout || "", error: "" });
        });
    });
}

// 列出前台应用及其窗口标题（macOS）
async function list() {
    if (process.platform !== "darwin") {
        return { success: false, output: null, error: `窗口列表暂不支持 ${process.platform}`, exitCode: 1 };
    }
    const script = `
set output to ""
tell application "System Events"
    repeat with p in (every process whose background only is false)
        set pname to name of p
        try
            set wtitles to ""
            repeat with w in (every window of p)
                set wtitles to wtitles & "[" & (name of w) & "] "
            end repeat
            if wtitles is not "" then set output to output & pname & ": " & wtitles & linefeed
        end try
    end repeat
end tell
return output
`;
    const r = await run("osascript", ["-e", script]);
    if (!r.ok) {
        if (/not allowed|assistive|-25211|1002/i.test(r.error)) {
            return { success: false, output: null, error: "缺少「辅助功能」权限：请在 系统设置 → 隐私与安全性 → 辅助功能 中勾选（终端/Electron），然后重试。", exitCode: 1, needPermission: true };
        }
        return { success: false, output: null, error: r.error || "窗口列表获取失败", exitCode: 1 };
    }
    const lines = r.output.split("\n").filter(l => l.includes(": "));
    return lines.length
        ? { success: true, output: lines.join("\n"), error: null, exitCode: 0 }
        : { success: true, output: "没有检测到前台应用窗口", error: null, exitCode: 0 };
}

// 激活/聚焦指定应用
async function focus(params) {
    const name = String(params.name || params.app || params.target || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    try {
        if (process.platform === "darwin") {
            const r = await run("osascript", ["-e", `tell application "${name.replace(/"/g, "")}" to activate`]);
            if (!r.ok && /not allowed|assistive|-25211/i.test(r.error)) {
                return { success: false, output: null, error: "缺少「辅助功能」权限（激活窗口需要）", exitCode: 1, needPermission: true };
            }
            return r.ok
                ? { success: true, output: `已激活 ${name}`, error: null, exitCode: 0 }
                : { success: false, output: null, error: r.error || "激活失败", exitCode: 1 };
        }
        return { success: false, output: null, error: `窗口聚焦暂不支持 ${process.platform}`, exitCode: 1 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// 获取窗口精确位置与大小（逻辑像素，System Events 需辅助功能权限）
async function getBounds(params) {
    const name = String(params.name || params.app || params.target || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    if (process.platform !== "darwin") {
        return { success: false, output: null, error: `窗口定位暂不支持 ${process.platform}`, exitCode: 1 };
    }
    const script = `tell application "System Events" to tell process "${name.replace(/"/g, "")}" to get {position, size} of window 1`;
    const r = await run("osascript", ["-e", script]);
    if (!r.ok) {
        if (/not allowed|assistive|-25211|1002|not running/i.test(r.error)) {
            return { success: false, output: null, error: `获取窗口位置失败（应用可能未运行或无辅助功能权限）: ${r.error}`, exitCode: 1, needPermission: /not allowed|assistive|-25211|1002/i.test(r.error) };
        }
        return { success: false, output: null, error: r.error || "获取窗口位置失败", exitCode: 1 };
    }
    const m = r.output.trim().match(/(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return { success: false, output: null, error: "窗口位置解析失败: " + r.output, exitCode: 1 };
    const bounds = { x: parseInt(m[1], 10), y: parseInt(m[2], 10), w: parseInt(m[3], 10), h: parseInt(m[4], 10) };
    return { success: true, output: JSON.stringify(bounds), error: null, exitCode: 0, bounds };
}

module.exports = {
    name: "window",
    description: "窗口管理：列出前台应用窗口标题、激活指定应用、获取窗口精确位置大小（供视觉点击）",
    actions: { list, focus, getBounds }
};
