// tools/keyboard.js — 键盘输入工具（P2）
// 依赖: cliclick（brew install cliclick），需要「辅助功能」权限
// type: 向当前焦点窗口输入文字（支持 {enter} {tab} {esc} {cmd} {shift} 等特殊键）
// hotkey: 发送快捷键组合，如 cmd+s
const { execFile } = require("child_process");

function run(args, timeout = 15000) {
    return new Promise((resolve) => {
        execFile("cliclick", args, { timeout }, (err, stdout, stderr) => {
            if (err) {
                const msg = (stderr || err.message || "").trim();
                // cliclick 无辅助功能权限的特征报错
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

// 输入文字（特殊键用 {enter} {tab} {esc} {up} {down} {left} {right} {space} 等）
async function type(params) {
    const text = params.text || params.content || "";
    if (!text) return { success: false, output: null, error: "缺少要输入的文字 (text)", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    // cliclick t: 语法，换行处理为 {enter}
    const escaped = String(text).replace(/\n/g, "{enter}");
    const r = await run(["t:" + escaped]);
    return r.ok
        ? { success: true, output: `已输入 ${escaped.length} 字符`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 快捷键: {keys: "cmd+s"} 或 {keys: "cmd,shift,p"}
async function hotkey(params) {
    const keys = params.keys || params.key || params.combo || "";
    if (!keys) return { success: false, output: null, error: "缺少快捷键 (keys)，如 cmd+s", exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    // cliclick kp: 语法：cmd+s / cmd+shift+p（逗号分隔序列）
    const combo = String(keys).replace(/[+]/g, "-").replace(/,\s*/g, " ");
    const r = await run(["kp:" + combo]);
    return r.ok
        ? { success: true, output: `已发送快捷键: ${keys}`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

// 按特殊键: {key: "enter"|"tab"|"esc"|"return"|"space"|"up"|"down"|"left"|"right"}
async function press(params) {
    const key = String(params.key || params.keys || "").toLowerCase();
    const map = { enter: "return", return: "return", tab: "tab", esc: "esc", escape: "esc", space: "space", up: "up", down: "down", left: "left", right: "right", delete: "delete", backspace: "delete" };
    const cliclickKey = map[key];
    if (!cliclickKey) return { success: false, output: null, error: `不支持的按键: ${key}`, exitCode: 1 };
    if (!(await checkCliclick())) {
        return { success: false, output: null, error: "需要安装 cliclick: brew install cliclick", exitCode: 1 };
    }
    const r = await run(["k:" + cliclickKey]);
    return r.ok
        ? { success: true, output: `已按键: ${key}`, error: null, exitCode: 0 }
        : { success: false, output: null, error: r.error, exitCode: 1 };
}

module.exports = {
    name: "keyboard",
    description: "键盘输入与快捷键：向当前焦点窗口输入文字、发送快捷键（cmd+s 等）、按特殊键",
    actions: { type, hotkey, press }
};
