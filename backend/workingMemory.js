// workingMemory.js — 每任务工作记忆（P3-2）
// ============================================================
// 纯数据层：操作内存对象（挂在 taskManager 任务记录上，随 checkpoint 落盘）。
// 与 memory/memory.js（全局长期记忆）完全解耦，无共享写路径，无并发冲突。
//
// 用途（服务于 Agent，不是第二套聊天历史）：
//   Agent 下一步决策时可回答：当前应用/窗口/焦点？刚做了什么？验证结果？
//   任务变量？最近失败？为什么失败？——不必每次重新探测。
//
// 体积控制（防无限增长）：
//   recentActions        ≤ 10 条
//   recentVerifications  ≤ 5 条
//   errors               ≤ 8 条（同 tool+action+error 合并计数）
//   importantContext     ≤ 8 条
//   所有字段截断存储，可序列化（JSON 直落 checkpoint）。
//
// 注：P3-5 负责把 Working Memory + 实时环境 + 最近操作压缩成 LLM 消费的
// Environment Context；本模块只提供数据层 + 轻量模板渲染（summarize）。
// ============================================================

const LIMITS = {
    RECENT_ACTIONS: 10,
    RECENT_VERIFICATIONS: 5,
    ERRORS: 8,
    CONTEXT: 8
};

function now() { return Date.now(); }
function trim(arr, max) { return arr.length > max ? arr.slice(-max) : arr; }

// ---------- 创建 ----------
function create(taskId) {
    return {
        taskId: String(taskId || ""),
        currentApp: null,
        currentWindow: null,
        currentFocus: null,
        currentFile: null,
        currentStep: null,          // {index, stepId, tool, action}
        recentActions: [],          // {tool, action, goal, ok, level, time}
        recentVerifications: [],    // {method, ok, detail, time}
        variables: {},              // 任务变量 {key: value}
        errors: [],                 // {stepId, tool, action, error, count, time}
        importantContext: [],       // {type, content, time}
        updatedAt: now()
    };
}

function touch(wm) { if (wm) wm.updatedAt = now(); }

// ---------- 基础接口 ----------
function get(wm) { return wm; }

function update(wm, patch) {
    if (!wm) return wm;
    for (const [k, v] of Object.entries(patch || {})) {
        // taskId 不可改；只接受已知字段，防脏数据
        if (k !== "taskId" && k in wm && k !== "recentActions" && k !== "recentVerifications" && k !== "errors" && k !== "importantContext") {
            wm[k] = v;
        }
    }
    touch(wm);
    return wm;
}

function recordAction(wm, { tool, action, goal, ok, level, time }) {
    if (!wm) return;
    wm.recentActions.push({
        tool: String(tool || "").slice(0, 30),
        action: String(action || "").slice(0, 30),
        goal: String(goal || "").slice(0, 80),
        ok: !!ok,
        level: level || "SAFE",
        time: time || now()
    });
    wm.recentActions = trim(wm.recentActions, LIMITS.RECENT_ACTIONS);
    touch(wm);
}

function recordVerification(wm, { method, ok, detail }) {
    if (!wm) return;
    wm.recentVerifications.push({
        method: String(method || "unknown").slice(0, 40),
        ok: !!ok,
        detail: String(detail || "").slice(0, 200),
        time: now()
    });
    wm.recentVerifications = trim(wm.recentVerifications, LIMITS.RECENT_VERIFICATIONS);
    touch(wm);
}

function recordError(wm, { stepId, tool, action, error }) {
    if (!wm) return;
    const text = String(error || "").slice(0, 300);
    // 同位置同错误合并计数（防 LLM 看到一屏相同错误）
    const last = wm.errors[wm.errors.length - 1];
    if (last && last.tool === tool && last.action === action && last.error === text) {
        last.count = (last.count || 1) + 1;
        last.time = now();
    } else {
        wm.errors.push({
            stepId: stepId || null,
            tool: String(tool || "").slice(0, 30),
            action: String(action || "").slice(0, 30),
            error: text,
            count: 1,
            time: now()
        });
    }
    wm.errors = trim(wm.errors, LIMITS.ERRORS);
    touch(wm);
}

function setVariable(wm, key, value) {
    if (!wm || !key) return;
    wm.variables[key] = value;
    touch(wm);
}

function addContext(wm, type, content) {
    if (!wm) return;
    wm.importantContext.push({
        type: String(type || "").slice(0, 30),
        content: String(content || "").slice(0, 200),
        time: now()
    });
    wm.importantContext = trim(wm.importantContext, LIMITS.CONTEXT);
    touch(wm);
}

function clear(wm) {
    return create(wm && wm.taskId);
}

// ---------- 从结构化 step 自动应用（taskManager onStep 调用） ----------
function applyStep(wm, step, index) {
    if (!wm || !step) return wm;

    // 当前步骤
    wm.currentStep = {
        index: (typeof index === "number") ? index : null,
        stepId: step.stepId || null,
        tool: step.tool || "",
        action: step.action || ""
    };

    // 从入参提取应用/窗口/文件（不塞完整 AX Tree，只提取轻量字段）
    const input = (step.input && typeof step.input === "object") ? step.input : {};
    if (step.tool === "applications" || step.tool === "window" || step.tool === "ui") {
        const app = input.app || input.name || input.target;
        if (app) wm.currentApp = String(app);
        if (step.tool === "applications" && app && step.status === "success") {
            const verb = { open: "打开", close: "关闭", restart: "重启" }[step.action];
            if (verb) addContext(wm, "app", `${verb}应用 ${app}`);
        }
    } else if ((step.tool === "filesystem" || step.tool === "shell") && input.path) {
        wm.currentFile = String(input.path);
    }

    // 操作记录（含失败/待确认/拦截）
    recordAction(wm, {
        tool: step.tool,
        action: step.action,
        goal: step.goal,
        ok: step.status === "success",
        level: step.level,
        time: step.endTime || now()
    });

    // 失败/拦截 → 错误记录（供 Replanner 消费）
    if ((step.status === "failed" || step.status === "blocked") && step.error) {
        recordError(wm, { stepId: step.stepId, tool: step.tool, action: step.action, error: step.error });
    }

    // forced 验证步骤 → 验证记录
    if (step.forced) {
        recordVerification(wm, {
            method: `${step.tool}.${step.action}`,
            ok: step.status === "success",
            detail: step.error || (step.result && step.result.output) || ""
        });
    }

    touch(wm);
    return wm;
}

// ---------- 渲染成 LLM 可读摘要（轻量版，P3-5 再做完整环境压缩） ----------
function summarize(wm) {
    if (!wm) return "";
    const lines = ["【工作记忆】"];
    if (wm.currentApp) lines.push(`- 当前应用: ${wm.currentApp}`);
    if (wm.currentWindow) lines.push(`- 当前窗口: ${wm.currentWindow}`);
    if (wm.currentFocus) lines.push(`- 当前焦点: ${wm.currentFocus}`);
    if (wm.currentFile) lines.push(`- 当前文件: ${wm.currentFile}`);
    if (wm.currentStep && wm.currentStep.tool) {
        const idx = (typeof wm.currentStep.index === "number") ? wm.currentStep.index + 1 : "?";
        lines.push(`- 当前步骤: ${idx}. ${wm.currentStep.tool}.${wm.currentStep.action}`);
    }
    const vKeys = Object.keys(wm.variables || {});
    if (vKeys.length) lines.push(`- 任务变量: ${JSON.stringify(wm.variables).slice(0, 200)}`);
    if (wm.recentActions.length) {
        const acts = wm.recentActions.slice(-5).map(a =>
            `${a.ok ? "✅" : "❌"} ${a.tool}.${a.action}${a.goal ? "(" + a.goal + ")" : ""}`
        ).join("  ");
        lines.push(`- 最近操作: ${acts}`);
    }
    if (wm.recentVerifications.length) {
        const vs = wm.recentVerifications.slice(-3).map(v => `${v.ok ? "✅" : "❌"} ${v.method}`).join("  ");
        lines.push(`- 最近验证: ${vs}`);
    }
    if (wm.errors.length) {
        const es = wm.errors.slice(-3).map(e =>
            `${e.tool}.${e.action}: ${e.error}${e.count > 1 ? "(x" + e.count + ")" : ""}`
        ).join(" | ");
        lines.push(`- 最近错误: ${es}`);
    }
    if (wm.importantContext.length) {
        const cs = wm.importantContext.slice(-3).map(c => c.content).join(" | ");
        lines.push(`- 重要上下文: ${cs}`);
    }
    return lines.join("\n");
}

module.exports = {
    create, get, update,
    recordAction, recordVerification, recordError,
    setVariable, addContext,
    applyStep, summarize, clear,
    LIMITS
};
