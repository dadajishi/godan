// tools/ui.js — Accessibility UI 树工具（替代视觉定位，快/准/零门槛）
// 依赖: macOS System Events（辅助功能权限已授予）
// 坐标: AX position 是屏幕绝对逻辑像素，与 cliclick 直接兼容（无需 Retina 换算）
// 动作:
//   getTree    枚举窗口控件树（按钮带 row/col 行列标注，LLM 可直接定位）
//   findElement 按名称/关键词/角色找控件 → 精确坐标
//   readValue  读显示屏/输入框当前值（操作后验证用）
const { execFile } = require("child_process");

function runOsascript(script, timeout = 25000) {
    return new Promise((resolve) => {
        execFile("osascript", ["-e", script], { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) resolve({ ok: false, output: stdout || "", error: (stderr || err.message || "").trim() });
            else resolve({ ok: true, output: stdout || "" });
        });
    });
}

// 解析 getTree 输出: role|name|value|x,y|w x h 每行
function parseTreeLines(output) {
    const lines = output.split("\n").filter(Boolean);
    return lines.map(l => {
        const parts = l.split("|");
        const [x, y] = (parts[3] || "").split(",").map(Number);
        return {
            role: parts[0] || "",
            name: parts[1] || "",
            value: parts[2] || "",
            x: isNaN(x) ? null : x,
            y: isNaN(y) ? null : y,
            size: parts[4] || ""
        };
    }).filter(e => e.role || e.x !== null);
}

// 给按钮加行列标注（只标注标准网格行：行内按钮数 == 最大行数，自动排除标题栏/工具栏的零散按钮）
function annotateRows(elements) {
    const buttons = elements.filter(e => e.role === "AXButton" && typeof e.x === "number" && typeof e.y === "number");
    const rows = {};
    buttons.forEach(b => {
        (rows[b.y] = rows[b.y] || []).push(b);
    });
    const counts = Object.values(rows).map(r => r.length);
    if (counts.length === 0) return elements;
    const maxCount = Math.max(...counts);
    const gridRows = Object.entries(rows)
        .filter(([, list]) => list.length === maxCount) // 标准网格行（按钮数一致）
        .sort((a, b) => Number(a[0]) - Number(b[0]));
    gridRows.forEach(([, list], ri) => {
        list.sort((a, b) => a.x - b.x);
        list.forEach((b, ci) => {
            b.row = ri + 1;
            b.col = ci + 1;
        });
    });
    return elements;
}

// 获取窗口控件树
// params: {app: 应用名, max?: 最大元素数(默认150)}
async function getTree(params) {
    const app = String(params.app || params.name || "").trim();
    if (!app) return { success: false, output: null, error: "缺少应用名 (app)", exitCode: 1 };
    if (process.platform !== "darwin") {
        return { success: false, output: null, error: `UI 树暂不支持 ${process.platform}`, exitCode: 1 };
    }
    const max = Math.min(parseInt(params.max || 150, 10), 400);

    const script = `
tell application "System Events" to tell process "${app.replace(/"/g, "")}"
    set out to ""
    set els to entire contents of window 1
    set cnt to 0
    repeat with e in els
        if cnt >= ${max} then exit repeat
        set r to ""
        set n to ""
        set v to ""
        try
            set r to role of e
        end try
        try
            set n to name of e
        end try
        try
            set v to (value of e) as text
        end try
        set p to ""
        set s to ""
        try
            set pp to position of e
            set p to (item 1 of pp as text) & "," & (item 2 of pp as text)
        end try
        try
            set ss to size of e
            set s to (item 1 of ss as text) & "x" & (item 2 of ss as text)
        end try
        set out to out & r & "|" & n & "|" & v & "|" & p & "|" & s & linefeed
        set cnt to cnt + 1
    end repeat
    return out
end tell
`;
    try {
        const r = await runOsascript(script);
        if (!r.ok) {
            if (/not allowed|assistive|-25211|1002|not running|not found/i.test(r.error)) {
                return { success: false, output: null, error: `获取 UI 树失败（应用未运行或缺少辅助功能权限）: ${r.error}`, exitCode: 1, needPermission: /not allowed|assistive|-25211|1002/i.test(r.error) };
            }
            return { success: false, output: null, error: r.error || "获取 UI 树失败", exitCode: 1 };
        }
        const elements = annotateRows(parseTreeLines(r.output));
        // 只返回有意义的元素（按钮/文本/输入框/菜单等）
        const meaningful = elements.filter(e =>
            ["AXButton", "AXStaticText", "AXTextField", "AXCheckBox", "AXRadioButton", "AXMenuBarItem", "AXMenuItem", "AXSlider", "AXPopUpButton", "AXComboBox", "AXTabGroup", "AXScrollBar"].includes(e.role)
        );
        if (meaningful.length === 0) {
            return { success: true, output: "窗口内没有可交互控件（可能是自绘界面，无法用 UI 树操作）", error: null, exitCode: 0, tree: [] };
        }
        const out = JSON.stringify(meaningful, null, 2);
        return { success: true, output: out, error: null, exitCode: 0, tree: meaningful };
    } catch (e) {
        return { success: false, output: null, error: e.message, exitCode: 1 };
    }
}

// 按名称/关键词/角色查找控件 → 精确坐标
// params: {app, label?|keyword?|role?, index?} 返回第一个匹配（可指定第几个）
async function findElement(params) {
    const app = String(params.app || "").trim();
    if (!app) return { success: false, output: null, error: "缺少应用名 (app)", exitCode: 1 };
    const label = String(params.label || "").trim();
    const keyword = String(params.keyword || "").trim();
    const role = String(params.role || "").trim();

    const tree = await getTree({ app });
    if (!tree.success) return tree;
    const els = tree.tree || [];

    let matched = els;
    if (label) matched = matched.filter(e => e.name === label || e.value === label);
    if (keyword) matched = matched.filter(e => (e.name + e.value).includes(keyword));
    if (role) matched = matched.filter(e => e.role === role);

    if (matched.length === 0) {
        return { success: false, output: null, error: `在「${app}」中未找到匹配控件 (label=${label || "-"}, keyword=${keyword || "-"}, role=${role || "-"})`, exitCode: 1 };
    }
    const idx = Math.max(0, parseInt(params.index || 0, 10));
    const target = matched[Math.min(idx, matched.length - 1)];
    if (typeof target.x !== "number") {
        return { success: false, output: null, error: "匹配到控件但无坐标", exitCode: 1 };
    }
    const info = {
        label: target.name || target.value || `${target.role}${target.row ? ` row${target.row}col${target.col}` : ""}`,
        role: target.role,
        x: target.x,
        y: target.y,
        row: target.row || null,
        col: target.col || null
    };
    return { success: true, output: JSON.stringify(info), error: null, exitCode: 0, element: info };
}

// 读取显示屏/输入框当前值（操作后验证）
// 注意: 计算器类应用有「历史表达式标签」和「主显示区」两个文本，主显示区在下方(y更大)
// params: {app, label?: 可选匹配文本元素}
async function readValue(params) {
    const app = String(params.app || "").trim();
    if (!app) return { success: false, output: null, error: "缺少应用名 (app)", exitCode: 1 };

    const tree = await getTree({ app });
    if (!tree.success) return tree;
    const els = tree.tree || [];

    let texts = els.filter(e => e.role === "AXStaticText" || e.role === "AXTextField");
    const label = String(params.label || "").trim();
    if (label) texts = texts.filter(e => (e.name + e.value).includes(label));
    if (texts.length === 0) {
        return { success: true, output: "未读取到文本值（可能是自绘显示）", error: null, exitCode: 0, value: null };
    }
    // 主显示区 = y 最大（最下方）的文本元素
    const main = texts.reduce((a, b) => ((b.y || 0) > (a.y || 0) ? b : a));
    const value = main.value || main.name || "";
    const all = texts.map(t => t.value || t.name || "");
    return {
        success: true,
        output: `「${app}」显示值: ${value}`,
        error: null,
        exitCode: 0,
        value,
        all,
        element: main
    };
}

module.exports = {
    name: "ui",
    description: "Accessibility UI 树：getTree 枚举窗口控件（按钮带行列号）；findElement 按名称/关键词定位控件精确坐标；readValue 读显示屏/输入框当前值（验证用）。快、准、零门槛",
    actions: { getTree, findElement, readValue }
};
