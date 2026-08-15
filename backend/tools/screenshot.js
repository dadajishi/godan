// tools/screenshot.js — 屏幕截图工具（P2）+ 视觉分析（P3）
// macOS: screencapture（全屏/区域）；Windows/Linux 降级提示
// 注意: macOS 10.15+ 需要「屏幕录制」权限，否则报 "could not create image from display"
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { DATA_ROOT } = require("../paths");
const llm = require("../llm");

const SHOT_DIR = path.join(DATA_ROOT, "screenshots");

// M2: 截图存储上限（防长期运行无限增长）
//   数量上限: MAX_SCREENSHOTS=200 张；磁盘上限: MAX_SCREENSHOT_MB=500MB
//   超过任一上限 → 删除最旧截图（按 mtime），保留最新
const MAX_SCREENSHOTS = 200;
const MAX_SCREENSHOT_MB = 500;

// 自动清理（capture 后调用；dir 参数便于测试注入临时目录，默认 SHOT_DIR）
function enforceLimit(dir = SHOT_DIR) {
    try {
        if (!fs.existsSync(dir)) return { removed: 0, count: 0 };
        let files = fs.readdirSync(dir)
            .filter(f => /\.(png|jpe?g)$/i.test(f))
            .map(f => {
                const p = path.join(dir, f);
                let st;
                try { st = fs.statSync(p); } catch (e) { return null; }
                return { f, p, mtime: st.mtimeMs, size: st.size };
            })
            .filter(Boolean)
            .sort((a, b) => a.mtime - b.mtime); // 最旧在前
        let removed = 0;

        // 1. 磁盘上限（删除最旧直到达标；至少保留 1 张）
        let total = files.reduce((s, x) => s + x.size, 0);
        while (total > MAX_SCREENSHOT_MB * 1024 * 1024 && files.length > 1) {
            const oldest = files.shift();
            try { fs.unlinkSync(oldest.p); total -= oldest.size; removed++; } catch (e) { /* 忽略 */ }
        }
        // 2. 数量上限
        while (files.length > MAX_SCREENSHOTS) {
            const oldest = files.shift();
            try { fs.unlinkSync(oldest.p); removed++; } catch (e) { /* 忽略 */ }
        }
        if (removed > 0) {
            console.log(`🧹 截图自动清理: 删除 ${removed} 张旧截图（目录 ${dir}）`);
        }
        return { removed, count: files.length };
    } catch (e) {
        return { removed: 0, count: 0, error: e.message };
    }
}

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
        // M2: 每次截图后自动清理（数量/磁盘上限）
        enforceLimit();
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

// ============ P3: 视觉分析 ============

// 获取逻辑屏幕尺寸（Retina 换算: screencapture 输出物理像素，cliclick 需要逻辑像素）
function getLogicalScreenSize() {
    return new Promise((resolve) => {
        execFile("osascript", ["-e", 'tell application "Finder" to get bounds of window of desktop'], { timeout: 10000 }, (err, stdout) => {
            if (!err && stdout) {
                const m = stdout.trim().match(/(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+)/);
                if (m) return resolve({ w: parseInt(m[3], 10) - parseInt(m[1], 10), h: parseInt(m[4], 10) - parseInt(m[2], 10) });
            }
            resolve(null);
        });
    });
}

// 获取图片物理尺寸（sips）
function getImageSize(src) {
    return new Promise((resolve) => {
        execFile("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { timeout: 15000 }, (err, stdout) => {
            if (err) return resolve(null);
            const w = (stdout.match(/pixelWidth:\s*(\d+)/) || [])[1];
            const h = (stdout.match(/pixelHeight:\s*(\d+)/) || [])[1];
            if (w && h) resolve({ w: parseInt(w, 10), h: parseInt(h, 10) });
            else resolve(null);
        });
    });
}

// 解析简化格式的视觉输出（小模型对复杂 JSON 不稳定，用简单格式 + 正则）
function parseSimpleAnalysis(text) {
    const t = String(text || "");
    // 描述行
    const descMatch = t.match(/描述[:：]\s*([^\n]+)/);
    const description = descMatch ? descMatch[1].trim() : t.split("\n")[0].slice(0, 120);
    // 元素行: "7 | x=428 | y=639" 或 "7, x:428, y:639" 或 "7（x=428,y=639）"
    const elements = [];
    const re = /([^\s|,，;；()（）]+)\s*(?:[|,，;；]\s*)?x\s*[=＝:：]\s*(\d+)\s*(?:[|,，;；]\s*)?y\s*[=＝:：]\s*(\d+)/gi;
    let m;
    while ((m = re.exec(t)) !== null) {
        elements.push({
            label: m[1].trim().slice(0, 30),
            type: "元素",
            x: parseInt(m[2], 10),
            y: parseInt(m[3], 10),
            w: null,
            h: null
        });
    }
    return { description, elements };
}

// 视觉分析当前屏幕（或指定截图）
// 策略: 分析原始分辨率图（细节多、定位准），返回坐标按 Retina 比例换算为逻辑坐标（cliclick 可直接用）
async function analyze(params = {}) {
    // 1. 截图（或复用指定文件；支持 bounds 区域截图：窗口级定位）
    let file = params.file || null;
    let regionOffset = { x: 0, y: 0 }; // 区域截图时，图片坐标 → 全局逻辑坐标的偏移
    let logicalW = 0, logicalH = 0;
    if (!file) {
        if (params.bounds && typeof params.bounds.x === "number") {
            // 窗口区域截图（bounds 是逻辑像素；screencapture -R 也接受逻辑像素）
            const shot = await capture({ region: params.bounds, name: params.name || "region" });
            if (!shot.success) return shot;
            file = shot.file;
            regionOffset = { x: params.bounds.x, y: params.bounds.y };
            logicalW = params.bounds.w;
            logicalH = params.bounds.h;
        } else {
            const shot = await capture(params);
            if (!shot.success) return shot;
            file = shot.file;
        }
    }

    // 2. 计算物理→逻辑比例
    let scaleX = 1, scaleY = 1;
    const phys = await getImageSize(file);
    if (phys) {
        if (logicalW > 0) {
            scaleX = phys.w / logicalW;
            scaleY = phys.h / logicalH || 1;
        } else {
            const logical = await getLogicalScreenSize();
            if (logical) {
                scaleX = phys.w / logical.w;
                scaleY = phys.h / logical.h;
            }
        }
        console.log(`🖥️ analyze: 物理 ${phys.w}x${phys.h} → 逻辑 (scale ${scaleX.toFixed(2)}x${scaleY.toFixed(2)})`);
    }

    // 简化 prompt：3B 小模型对复杂 JSON 不稳定，用「描述 + 元素列表」简单格式
    // 有 focus 时用针对性 prompt（小模型对点名目标定位更准）
    const focus = params.focus ? String(params.focus).slice(0, 20) : "";
    const ANALYZE_PROMPT = focus
        ? `分析这张屏幕截图。屏幕上有「${focus}」吗？
1. 用一两句话描述屏幕内容
2. 找出「${focus}」里的按钮位置，每个按钮输出：名称、中心x坐标、中心y坐标

输出格式（严格遵守，模仿示例的写法）:
描述: <描述>
按钮列表:
7 | x=428 | y=639
8 | x=530 | y=639
（每行一个按钮：名称 | x=坐标 | y=坐标；坐标是图片像素，左上角为原点）`
        : `分析这张屏幕截图。请完成两个任务：
1. 用一两句话描述屏幕内容（当前前台应用是什么，界面长什么样）
2. 列出屏幕上可交互的元素（按钮、输入框、图标），每个元素给出：名称、中心x坐标、中心y坐标

输出格式（严格遵守，模仿示例的写法）:
描述: <你的描述>
元素列表:
按钮 | x=123 | y=456
输入框 | x=789 | y=321
（每行一个元素：名称 | x=坐标 | y=坐标；坐标是图片像素，左上角为原点）`;

    // 视觉模型小模型不稳定：结果异常时重试（重新截图），最多 2 次
    let lastRaw = "";
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`🖥️ analyze 重试 ${attempt}/2（视觉结果异常）`);
                const shot = await capture(params);
                if (shot.success) file = shot.file;
            }
            const raw = await llm.vision({ imagePath: file, prompt: ANALYZE_PROMPT, json: false, temperature: 0.1, maxTokens: 1200 });
            lastRaw = raw;
            const parsed = parseSimpleAnalysis(raw);
            const hasDesc = parsed.description && !/^\s*描述\s*[:：]?\s*$/.test(parsed.description);
            if (!hasDesc && parsed.elements.length === 0) {
                lastErr = "视觉模型返回内容无法解析";
                continue; // 重试
            }
            // 3. 坐标换算: 物理像素 → 逻辑像素（cliclick 用），区域截图需加区域偏移
            const elements = parsed.elements.slice(0, 20).map(e => ({
                label: e.label,
                type: e.type,
                x: typeof e.x === "number" ? Math.round(e.x / scaleX) + regionOffset.x : null,
                y: typeof e.y === "number" ? Math.round(e.y / scaleY) + regionOffset.y : null,
                w: null,
                h: null
            }));
            const out = JSON.stringify({ description: parsed.description, elements }, null, 2);
            return { success: true, output: out, error: null, exitCode: 0, file, analysis: { description: parsed.description, elements } };
        } catch (e) {
            lastErr = e.message;
        }
    }
    return { success: false, output: null, error: "视觉分析失败: " + (lastErr || "多次重试均失败") + " | 原始返回: " + String(lastRaw).slice(0, 150), exitCode: 1, file };
}

module.exports = {
    name: "screenshot",
    description: "屏幕截图与视觉分析：capture 截图保存；analyze 截图+AI看懂屏幕（返回描述和可交互元素坐标，坐标可直接用于 mouse/keyboard）",
    actions: { capture, list: listShots, analyze },
    // M2: 存储上限与清理（测试/运维用）
    MAX_SCREENSHOTS, MAX_SCREENSHOT_MB, enforceLimit
};
