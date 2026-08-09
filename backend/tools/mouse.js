// tools/mouse.js — 鼠标控制工具（P2）
// 依赖: cliclick（brew install cliclick），需要「辅助功能」权限
// 坐标: 屏幕像素坐标（左上角 0,0），P3 视觉闭环后由截图分析得出
const { execFile } = require("child_process");

function run(args, timeout = 15000) {
    return new Promise((resolve) => {
        execFile("cliclick", args, { timeout }, (err, stdout, stderr) => {
            if (err) {
                const msg = (stderr || err.message || "").trim();
                if (/not authorized|assistive|accessibility|osascript is not allowed/i.test(msg)) {
                    resolve({ ok: false, error: "缺少「辅助功能」权限：请在 系统设置 → 隐私与安全性 → 辅助功能 中勾选（终端/Electron），然后重试。", needPermission: true });
                } else {
                    resolve({ ok: false, error: msg || "cliclick 执行失败" });
                }
            } else {
                resolve({ ok: true, error: "" });
            }
        });
    });
}

function checkCliclick() {
    return new Promise((resolve) => {
        execFile("which", ["cliclick"], (err) => resolve(!err));
    });
}

function parseXY(x, y) {
    const nx = parseInt(x, 10);
    const ny = parseInt(y, 10);
    if (isNaN(nx) || isNaN(ny)) return null;
    return { x: nx, y: ny };
}

// 移动鼠标
async function move(params) {
    const p = parseXY(params.x, params.y);
    if (!p) return { success: false, output: null, error: "需要屏幕坐标 x/y", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const r = await run(["m:" + p.x + "," + p.y]);
    return r.ok
        ? { success: true, output: `鼠标移动到 (${p.x}, ${p.y})`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 点击（左/右/中）
async function click(params) {
    const p = parseXY(params.x, params.y);
    if (!p) return { success: false, output: null, error: "需要屏幕坐标 x/y", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const button = String(params.button || "left").toLowerCase();
    const prefix = button === "right" ? "rc" : button === "middle" ? "mc" : "c";
    const r = await run([prefix + ":" + p.x + "," + p.y]);
    return r.ok
        ? { success: true, output: `已${button === "right" ? "右键" : button === "middle" ? "中键" : "左键"}点击 (${p.x}, ${p.y})`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 双击
async function doubleClick(params) {
    const p = parseXY(params.x, params.y);
    if (!p) return { success: false, output: null, error: "需要屏幕坐标 x/y", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const r = await run(["dc:" + p.x + "," + p.y]);
    return r.ok
        ? { success: true, output: `已双击 (${p.x}, ${p.y})`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 拖拽: {from:{x,y}, to:{x,y}}
async function drag(params) {
    const from = parseXY(params.from && params.from.x, params.from && params.from.y);
    const to = parseXY(params.to && params.to.x, params.to && params.to.y);
    if (!from || !to) return { success: false, output: null, error: "需要 from{x,y} 和 to{x,y}", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const r = await run([`dd:${from.x},${from.y}`, `dm:${to.x},${to.y}`, "du:"]);
    return r.ok
        ? { success: true, output: `已拖拽 (${from.x},${from.y}) → (${to.x},${to.y})`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 滚动: {amount: 5, direction: "down"|"up"}
async function scroll(params) {
    const amount = Math.max(1, Math.min(50, parseInt(params.amount || 5, 10)));
    const dir = String(params.direction || "down").toLowerCase() === "up" ? "-" : "";
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const r = await run([`w:${dir}${amount}`]);
    return r.ok
        ? { success: true, output: `已${dir === "-" ? "向上" : "向下"}滚动 ${amount} 格`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

module.exports = {
    name: "mouse",
    description: "鼠标控制：移动/点击/双击/拖拽/滚动（需要屏幕坐标，辅助功能权限）",
    actions: { move, click, doubleClick, drag, scroll }
};
