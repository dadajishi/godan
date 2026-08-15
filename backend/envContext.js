// envContext.js — Environment Context（P3-5）
// ============================================================
// 职责: 把「Working Memory(已发生) + 必要实时状态(现在) + 最近操作/验证」压缩成
//       LLM 每次决策注入的轻量环境摘要，减少重复探测、减少 token。
//
// 核心原则:
//   已确认的信息直接复用（WM / AX 快照）；只有可能过期的信息才刷新（TTL + 事件失效）。
//   绝不为了生成 Context 主动调用 ui.getTree / window.list / applications.list /
//   process.list / screenshot —— AX 摘要只复用 agent 自己刚 getTree 的快照。
//
// 刷新策略:
//   Task state   → 事件驱动（taskManager 直接提供，不探测）
//   Current app  → WM 优先 + applications.isRunning 轻量探测（2s TTL）
//   Focus        → AX focused element 探测（1s TTL，成本低）
//   AX summary   → 只复用 agent 捕获的快照（20s 内有效），过期标注提示，不主动扫描
//   Working Memory → 立即（压缩渲染）
//
// 敏感信息:
//   AXSecureTextField → 只记录 role/title，不记录 value
//   password/token/secret/apiKey/私钥 等 → 摘要中脱敏为 ***
// ============================================================
const { execFile } = require("child_process");
const applications = require("./tools/applications");

const TTL = { app: 2000, window: 2000, focus: 1000, ax: 20000 }; // ax 用快照新鲜度（20s，非主动查询周期）
const SENSITIVE_RE = /(password|passwd|token|secret|api[_-]?key|private\s*key|BEGIN\s+[A-Z0-9]+\s+PRIVATE|cookie|authorization|bearer)/i;

const states = new Map(); // taskId → {cache, stale, axSnapshot}

function stateFor(taskId) {
    if (!taskId) return null;
    if (!states.has(taskId)) {
        states.set(taskId, {
            cache: { app: null, window: null, focus: null },
            stale: { app: true, window: true, focus: true, ax: true },
            axSnapshot: null
        });
    }
    return states.get(taskId);
}
function now() { return Date.now(); }
function fresh(entry, ttl) { return entry && (now() - entry.at) < ttl; }

// ---------- 敏感脱敏 ----------
function sanitize(text, maxLen) {
    let s = String(text || "");
    if (SENSITIVE_RE.test(s)) {
        s = s.replace(/(password|passwd|token|secret|api[_-]?key|private\s*key|cookie|authorization|bearer)[=:\s]+[^\s,;|]+/gi, "$1=***");
    }
    return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

// ---------- 轻量探测（TTL 控制，不每次调用） ----------
function runOsascript(script, timeout = 5000) {
    return new Promise((resolve) => {
        execFile("osascript", ["-e", script], { timeout, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
            if (err) resolve(null); else resolve(String(stdout || "").trim());
        });
    });
}

// 前台应用名（frontmost）
async function probeFrontmost() {
    const r = await runOsascript('tell application "System Events" to get name of first process whose frontmost is true');
    return r || null;
}

// 焦点探测（macOS 26 实测: System Events 元素级 focused 不可靠、直接 AX API 因 TCC 权限链返回 -25201）
// 可靠实现: 窗口级焦点（front window 标题）；控件级焦点用 WM.currentFocus/最近操作推断，绝不编造
async function probeFocus(app) {
    if (!app) return null;
    const script = `
tell application "System Events" to tell process "${String(app).replace(/"/g, "")}"
    set out to ""
    try
        set w to front window
        set t to ""
        try
            set t to name of w
        end try
        set out to "window|" & t & "|"
    end try
    return out
end tell`;
    const r = await runOsascript(script);
    if (!r || !r.includes("|")) return null;
    const [level, title] = r.split("|");
    if (!level) return null;
    return { level: "window", title: title || "", secure: false };
}

async function probeAppRunning(name) {
    if (!name) return null;
    try {
        const res = await applications.actions.isRunning({ name });
        return res.success === true;
    } catch (e) { return null; }
}

// ---------- AX 快照（agent 每次 getTree 成功后调用，复用不重扫） ----------
function captureTree(taskId, tree) {
    const st = stateFor(taskId);
    if (!st) return;
    st.axSnapshot = { tree: Array.isArray(tree) ? tree : [], at: now() };
    st.stale.ax = false;
}

// 树 → 摘要（分类计数 + 网格坐标模式 或 relevant 控件坐标）
// 网格模式: 按钮带 row/col 标注（如计算器无 label 按钮）→ 输出全部按钮的坐标网格，
//          信息完整且远小于完整树（25 按钮 ≈ 400 字符 vs 完整树 2943 字符）
function summarizeTree(tree, wm) {
    const counts = {};
    const buttons = [], texts = [];
    for (const e of (tree || [])) {
        counts[e.role] = (counts[e.role] || 0) + 1;
        const label = e.name && e.name !== "missing value" ? e.name
            : (e.value && e.value !== "missing value" ? e.value
                : (e.row ? `r${e.row}c${e.col}` : ""));
        const item = {
            label: String(label).slice(0, 20),
            x: (typeof e.x === "number") ? e.x : null,
            y: (typeof e.y === "number") ? e.y : null,
            role: e.role,
            row: e.row || null,
            col: e.col || null
        };
        if (e.role === "AXButton") buttons.push(item);
        else if (["AXTextField", "AXStaticText"].includes(e.role)) texts.push(item);
    }

    // 网格模式：≥6 个按钮且大部分有 row/col → 输出全部按钮坐标（无 label 应用的关键信息源）
    const gridButtons = buttons.filter(b => b.row !== null);
    let grid = null;
    if (gridButtons.length >= 6 && gridButtons.length >= buttons.length * 0.8) {
        const rows = {};
        for (const b of gridButtons) (rows[b.row] = rows[b.row] || []).push(b);
        grid = Object.keys(rows).sort((a, b) => a - b).map(rid => {
            const btns = rows[rid].sort((a, b) => a.col - b.col);
            return `r${rid}: ${btns.map(b => `(${b.x},${b.y})`).join(" ")}`;
        }).join(" | ");
    }

    const recentGoal = wm && wm.recentActions && wm.recentActions.length
        ? String(wm.recentActions[wm.recentActions.length - 1].goal || "") : "";
    const relevant = [];
    const all = [...buttons, ...texts];
    if (recentGoal) {
        for (const l of all) {
            if (relevant.length >= 8) break;
            if (l.label && recentGoal.includes(l.label) && !relevant.some(r => r.label === l.label)) relevant.push(l);
        }
    }
    for (const l of all) {
        if (relevant.length >= 8) break;
        if (!relevant.some(r => r.label === l.label)) relevant.push(l);
    }
    return {
        total: (tree || []).length,
        buttons: counts.AXButton || 0,
        texts: (counts.AXTextField || 0) + (counts.AXStaticText || 0),
        grid,
        relevant
    };
}

// ---------- WM 压缩渲染（立即，无缓存） ----------
function summarizeWm(wm) {
    if (!wm) return { actions: "", verifications: "", errors: "" };
    const acts = (wm.recentActions || []).slice(-4).map(a =>
        `${a.ok ? "✅" : "❌"} ${a.tool}.${a.action}${a.goal ? "(" + sanitize(a.goal, 40) + ")" : ""}`
    ).join("  ");
    const vs = (wm.recentVerifications || []).slice(-2).map(v =>
        `${v.ok ? "✅" : "❌"} ${v.method}${v.detail ? ": " + sanitize(v.detail, 50) : ""}`
    ).join("  ");
    const errs = (wm.errors || []).slice(-2).map(e =>
        `${e.tool}.${e.action}${e.count > 1 ? "x" + e.count : ""}: ${sanitize(e.error, 50)}`
    ).join(" | ");
    return { actions: acts, verifications: vs, errors: errs };
}

// ---------- 事件驱动失效（工具执行后调用） ----------
function invalidateForAction(taskId, tool, action) {
    const st = stateFor(taskId);
    if (!st) return;
    switch (tool) {
        case "window": // 激活/移动窗口 → 窗口与应用状态可能变化
            st.stale.window = true;
            st.stale.app = true;
            st.stale.focus = true;
            break;
        case "applications": // 打开/关闭/重启 → 全套失效
            st.stale.app = true;
            st.stale.window = true;
            st.stale.focus = true;
            st.stale.ax = true;
            break;
        case "keyboard": // 输入 → 焦点值/控件状态变化
        case "mouse":
            st.stale.focus = true;
            st.stale.ax = true;
            break;
        case "ui": // AX 操作（getTree 已捕获新快照；findElement/readValue 只读不影响）
            if (action !== "getTree") st.stale.focus = true;
            break;
        case "shell": // 任意 shell 可能改变环境（保守失效焦点/窗口）
            st.stale.focus = true;
            st.stale.window = true;
            break;
        case "watch":
            // 等待结束不改变环境；触发后由下一次 get() 重新探测 app/focus
            st.stale.focus = true;
            break;
        default: break;
    }
}

// ---------- 主动失效（单 scope） ----------
function invalidate(taskId, scope) {
    const st = stateFor(taskId);
    if (!st) return;
    if (scope === "all" || scope === "app") st.stale.app = true;
    if (scope === "all" || scope === "window") st.stale.window = true;
    if (scope === "all" || scope === "focus") st.stale.focus = true;
    if (scope === "all" || scope === "ax") st.stale.ax = true;
}

// ---------- 主入口：获取环境上下文 ----------
// 输入: {taskId, wm, task:{status, currentStep, attempts}}
// 输出: 结构化上下文（含缓存状态；summarize() 渲染成 LLM 文本）
async function get({ taskId, wm, task = {} }) {
    const st = stateFor(taskId);
    const ctx = { taskId, wm, task: { status: task.status || "RUNNING", currentStep: task.currentStep || null, attempts: task.attempts || null } };

    if (!st) return ctx; // 无 taskId（直调模式）：只输出 WM 层

    // 当前应用：WM 确认信息优先；running 状态轻量探测（2s TTL）
    const wmApp = (wm && wm.currentApp) || null;
    let appName = wmApp || (st.cache.app && st.cache.app.value && st.cache.app.value.name) || null;
    if (appName) {
        const cached = st.cache.app && st.cache.app.value;
        if (st.stale.app || !fresh(st.cache.app, TTL.app) || !cached || cached.name !== appName) {
            const running = await probeAppRunning(appName);
            st.cache.app = { value: { name: appName, running }, at: now() };
            st.stale.app = false;
        }
        ctx.app = st.cache.app.value;
    }

    // 窗口：WM 标题直接复用；bounds 轻量获取（2s TTL，仅在需要时）
    if (appName) {
        const wmTitle = (wm && wm.currentWindow) || null;
        const cachedW = st.cache.window && st.cache.window.value;
        if (st.stale.window || !fresh(st.cache.window, TTL.window) || !cachedW || (wmTitle && cachedW.title !== wmTitle)) {
            let bounds = null;
            if (cachedW && !st.stale.window && cachedW.bounds) bounds = cachedW.bounds;
            else {
                try {
                    const windowTool = require("./tools/window");
                    const res = await windowTool.actions.getBounds({ name: appName });
                    if (res.success) bounds = res.bounds;
                } catch (e) { /* 静默 */ }
            }
            st.cache.window = { value: { title: wmTitle || appName, bounds }, at: now() };
            st.stale.window = false;
        }
        ctx.window = st.cache.window.value;
    }

    // 焦点：AX 探测（1s TTL + 事件失效）
    if (appName) {
        const cachedF = st.cache.focus && st.cache.focus.value;
        if (st.stale.focus || !fresh(st.cache.focus, TTL.focus) || !cachedF || cachedF.app !== appName) {
            const focus = await probeFocus(appName);
            st.cache.focus = { value: focus ? { app: appName, ...focus } : { app: appName, role: null }, at: now() };
            st.stale.focus = false;
        }
        ctx.focus = st.cache.focus.value;
    }

    // AX 摘要：只复用 agent 捕获的快照（不主动 getTree）
    if (st.axSnapshot && !st.stale.ax && (now() - st.axSnapshot.at) < TTL.ax) {
        ctx.ax = summarizeTree(st.axSnapshot.tree, wm);
    } else if (st.axSnapshot && st.stale.ax) {
        ctx.ax = { stale: true, hint: "AX 快照因操作已失效" };
    } else if (st.axSnapshot) {
        ctx.ax = { stale: true, hint: "AX 快照已过期，如需最新控件请先调用 ui.getTree" };
    }

    // 最近操作/验证/错误（立即）
    ctx.recent = summarizeWm(wm);
    return ctx;
}

// ---------- 渲染成 LLM 注入文本 ----------
function summarize(ctx) {
    if (!ctx) return "";
    const L = [];
    L.push("【当前环境】");
    const t = ctx.task || {};
    const stepTxt = t.currentStep && t.currentStep.tool
        ? ` | Step: ${(t.currentStep.index ?? 0) + 1}. ${t.currentStep.tool}.${t.currentStep.action}`
        : "";
    L.push(`Task: ${ctx.taskId || "-"} | Status: ${t.status || "-"}${stepTxt}`);

    if (ctx.wm && ctx.wm.waitingFor) {
        const wf = ctx.wm.waitingFor;
        L.push(`⏳ Waiting: ${sanitize(wf.condition || wf.watchType || "", 80)}`);
    }
    if (ctx.app) L.push(`App: ${ctx.app.name}${ctx.app.running === false ? "（未运行！）" : ""}`);
    if (ctx.window && ctx.window.title) {
        L.push(`Window: ${sanitize(ctx.window.title, 60)}`);
        if (ctx.window.bounds) L.push(`Window bounds: ${JSON.stringify(ctx.window.bounds)}`);
    }
    if (ctx.focus && (ctx.focus.title || ctx.focus.role)) {
        const f = ctx.focus;
        if (f.level === "window") {
            L.push(`Focus window: ${sanitize(f.title || ctx.app ? (ctx.app && ctx.app.name) || "" : "", 60)}`);
        } else {
            const val = f.secure ? "" : (f.value ? ` = "${sanitize(f.value, 30)}"` : "");
            L.push(`Focus: ${f.role}${f.title ? ` "${sanitize(f.title, 30)}"` : ""}${val}`);
        }
    }
    if (ctx.ax) {
        if (ctx.ax.stale) L.push(`AX: ${ctx.ax.hint}`);
        else if (ctx.ax.grid) {
            // 网格模式（无 label 按钮应用）：全量按钮坐标 + 布局提示
            L.push(`AX: ${ctx.ax.total} 控件 (Buttons: ${ctx.ax.buttons}, Text: ${ctx.ax.texts})`);
            L.push(`AX grid: ${ctx.ax.grid}`);
            L.push(`AX coords: 网格按钮坐标(x,y)为屏幕逻辑像素，可直接用于 mouse.click；按钮无文字标签，按 row/col 行列（r1c1=第1行第1列）结合应用布局推断目标按钮`);
        } else {
            const rel = ctx.ax.relevant && ctx.ax.relevant.length
                ? ` · ${ctx.ax.relevant.slice(0, 6).map(x => `"${x.label}"(${x.x},${x.y})`).join(" ")}`
                : "";
            L.push(`AX: ${ctx.ax.total} 控件 (Buttons: ${ctx.ax.buttons}, Text: ${ctx.ax.texts})${rel}`);
            if (ctx.ax.relevant && ctx.ax.relevant.some(x => typeof x.x === "number")) {
                L.push(`AX coords: 上面控件的坐标(x,y)是屏幕逻辑像素，可直接用于 mouse.click，无需重新 getTree`);
            }
        }
    }
    const r = ctx.recent || {};
    if (r.actions) L.push(`Recent: ${sanitize(r.actions, 300)}`);
    if (r.verifications) L.push(`Last verification: ${sanitize(r.verifications, 200)}`);
    if (r.errors) L.push(`Recent errors: ${sanitize(r.errors, 200)}`);
    return L.join("\n");
}

// ---------- 清理 ----------
function clear(taskId) {
    if (taskId) states.delete(taskId);
}

// P3-6: 当前 AX 快照中是否存在密码框（AXSecureTextField）——权限系统判断 keyboard.type 是否敏感输入
function hasSecureField(taskId) {
    const st = states.get(taskId);
    return !!(st && st.axSnapshot && (st.axSnapshot.tree || []).some(e => e.role === "AXSecureTextField"));
}

module.exports = {
    get, summarize, refresh: invalidate, invalidate, invalidateForAction,
    captureTree, clear, hasSecureField, probeFrontmost, TTL
};
