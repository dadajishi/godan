// tools/screenshot.js — 屏幕截图工具（P2）
// macOS: screencapture（全屏/区域）；Windows/Linux 降级提示
// 注意: macOS 10.15+ 需要「屏幕录制」权限，否则报 "could not create image from display"
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { DATA_ROOT } = require("../paths");

const SHOT_DIR = path.join(DATA_ROOT, "screenshots");

function run(cmd, args, timeout = 20000) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stdout || "", error: (stderr || err.message || "").trim() });
            else resolve({ ok: true, output: stdout || "", error: "" });
        });
    });
}

// 截图
// params: {region?: "full"|{x,y,w,h}, name?: string}
async function capture(params = {}) {
    const platform = process.platform;
    if (platform !== "darwin") {
        return { success: false, output: null, error: `截图暂不支持 ${platform}，需要安装对应工具（Windows: PowerShell + System.Drawing）`, exitCode: 1 };
    }

    try {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const name = params.name
            ? String(params.name).replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40)
            : new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = path.join(SHOT_DIR, `${name}.png`);

        const args = ["-x"];
        if (params.region && typeof params.region === "object") {
            const { x, y, w, h } = params.region;
            if ([x, y, w, h].every(n => typeof n === "number")) {
                args.push("-R", `${x},${y},${w},${h}`);
            }
        }
        args.push(file);

        const r = await run("screencapture", args);
        if (!r.ok) {
            // 权限不足的特征报错
            if (/could not create image from display/i.test(r.error)) {
                return {
                    success: false, output: null, error:
                        "截屏失败：缺少「屏幕录制」权限。请在 系统设置 → 隐私与安全性 → 屏幕录制 中勾选允许（终端/Electron/Godan），然后重试。",
                    exitCode: 1, needPermission: "screen-recording"
                };
            }
            return { success: false, output: null, error: r.error || "截图失败", exitCode: 1 };
        }
        if (!fs.existsSync(file)) {
            return { success: false, output: null, error: "截图未生成文件", exitCode: 1 };
        }
        return { success: true, output: `截图已保存: ${file}`, error: null, exitCode: 0, file };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// 截图目录列表（供前端浏览）
function listShots() {
    try {
        if (!fs.existsSync(SHOT_DIR)) return { success: true, output: "还没有截图", error: null, exitCode: 0 };
        const files = fs.readdirSync(SHOT_DIR)
            .filter(f => f.endsWith(".png"))
            .map(f => ({ file: f, path: path.join(SHOT_DIR, f), size: fs.statSync(path.join(SHOT_DIR, f)).size, time: fs.statSync(path.join(SHOT_DIR, f)).mtime.toISOString() }))
            .sort((a, b) => b.time.localeCompare(a.time));
        return { success: true, output: JSON.stringify(files, null, 2), error: null, exitCode: 0 };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

module.exports = {
    name: "screenshot",
    description: "屏幕截图：全屏或指定区域，保存到本地供分析/查看（macOS 需屏幕录制权限）",
    actions: { capture, list: listShots }
};
