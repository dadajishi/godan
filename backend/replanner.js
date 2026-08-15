// replanner.js — 失败自修复 + Replanner（P3-3）
// ============================================================
// 把「失败 → 计数器+1 → 连续3次 → FAILED」升级为：
//   Action → Verification → Failure → Error Analysis → Root Cause
//   Classification → Recovery Plan → Execute Recovery → Verify → 继续原任务
//
// 原则:
//   1. 确定性规则优先，不默认调 LLM（BUILD_ERROR/UNKNOWN 记录后交给主循环 LLM 决策）
//   2. 恢复动作必须走 tools.run（permissions.classify 强制，不绕过安全系统）
//   3. 消费 Working Memory（重复失败检测，拒绝无意义的相同重试）
//   4. 有限性: 最大重规划次数 / plan.maxAttempts / 循环检测 / 重复失败检测
//
// 每次 Replanner 调用必须记录: failureType / rootCause / confidence / recoveryPlan / recoveryResult
// ============================================================
const tools = require("./tools");
const workingMemory = require("./workingMemory");

const DEFAULT_MAX_REPLANS = 3; // 任务级最大重规划次数（computerAgent 可经 opts.maxReplans 覆盖）
const REPETITION_LIMIT = 3;    // 相同 tool+action+error 出现 ≥3 次 → 判定为重复失败，不再自动恢复

// ---------- 失败分类（确定性规则，按优先级匹配） ----------
const CLASSIFIERS = [
    { type: "PERMISSION_DENIED", re: /not allowed|assistive|-25211|1002|EACCES|permission denied|operation not permitted|没有(?:辅助功能|屏幕录制|输入监控).*权限|缺少「/i, desc: "权限被拒绝" },
    { type: "COMMAND_NOT_FOUND", re: /\bcommand not found\b|未找到命令|not recognized as an? (?:internal|external)|\bcommand not recognized\b/i, desc: "命令不存在" },
    { type: "FILE_NOT_FOUND", re: /\bENOENT\b|no such file or directory|找不到文件|文件不存在|\bdoes not exist\b|没有找到.*文件/i, desc: "文件/路径不存在" },
    { type: "PORT_IN_USE", re: /\bEADDRINUSE\b|address already in use|端口.*(?:占用|被使用)|already in use/i, desc: "端口被占用" },
    { type: "BUILD_ERROR", re: /\bSyntaxError\b|\bReferenceError\b|\bTypeError\b|\bERR_MODULE\b|\bERR_REQUIRE\b|\bERR_PACKAGE\b|\berror TS\d+\b|\bnpm err\b|编译失败|构建失败|无法解析模块|module not found/i, desc: "构建/语法错误" },
    // 注意: timeout 正则必须有词边界——错误文本里可能出现参数名 "timeout"（如 paramError 的可用参数列表），无边界会误分类
    { type: "TIMEOUT", re: /\btimed?\s?out\b|\bETIMEDOUT\b|超时/i, desc: "操作超时" },
    { type: "PATH_ERROR", re: /不是有效路径|无效路径|invalid path|is not a directory|not a directory|路径不存在/i, desc: "路径错误" }
];

// ui/window/AX 相关失败（依赖上下文，单独处理）
function classifyAx({ tool, action, error, params }) {
    const app = (params && (params.app || params.name || params.target)) || null;
    const msg = String(error || "");
    // AX 定位失败
    if (/未找到匹配控件|没有可交互控件|未读取到文本值|找不到.*控件|未找到.*(?:按钮|输入框|元素)/i.test(msg)) {
        return { failureType: "AX_NOT_FOUND", rootCause: `AX 定位失败: ${msg.slice(0, 120)}`, confidence: 0.9, app };
    }
    // 应用未运行（AX/window 操作的常见根因）
    if (/not running|未运行|应用可能未运行|没有运行/i.test(msg)) {
        return { failureType: "APP_NOT_RUNNING", rootCause: `目标应用未运行: ${app || "未知"}`, confidence: 0.85, app };
    }
    // 窗口问题
    if (/窗口|window/i.test(msg) && /激活|不存在|没有|not/i.test(msg)) {
        return { failureType: "WINDOW_NOT_ACTIVE", rootCause: `窗口不可用: ${msg.slice(0, 120)}`, confidence: 0.7, app };
    }
    return null;
}

// 主入口：错误分类
// ctx: {tool, action, params, error, result}
function classifyFailure(ctx) {
    const { tool, action, error, result } = ctx;
    const msg = String(error || "");

    // 0. 参数错误（P4-1 M4）：决策质量问题，不是环境问题——优先识别
    //    识别依据: tools.run 的 paramError 标记 或 错误文本前缀「参数错误:」
    if ((result && result.paramError === true) || /^参数错误[:：]/.test(msg)) {
        return {
            failureType: "PARAM_ERROR",
            rootCause: `工具参数错误: ${msg.slice(0, 200)}`,
            confidence: 0.98
        };
    }

    // 1. AX/ui/window/applications 上下文分类优先
    //    （应用未运行/窗口问题/控件未找到 比通用错误码更具体，
    //      避免「未运行 + 权限码 1002」被误判成权限问题）
    if (["ui", "window", "applications"].includes(tool)) {
        const ax = classifyAx(ctx);
        if (ax) return ax;
    }

    // 2. 通用规则（此时 ui 类已分流，剩余的权限错误如 shell EACCES 会命中）
    if (msg) {
        for (const c of CLASSIFIERS) {
            if (c.re.test(msg)) {
                return { failureType: c.type, rootCause: c.desc + ": " + msg.slice(0, 150), confidence: 0.85 };
            }
        }
    }

    // 3. 应用相关工具的错误默认
    if (tool === "applications" && (action === "open" || action === "isRunning")) {
        return { failureType: "APP_NOT_RUNNING", rootCause: `应用操作失败: ${msg.slice(0, 120) || action}`, confidence: 0.6, app: ctx.params && (ctx.params.name || ctx.params.app) };
    }
    if (tool === "window" && (action === "focus" || action === "getBounds")) {
        return { failureType: "WINDOW_NOT_ACTIVE", rootCause: `窗口操作失败: ${msg.slice(0, 120)}`, confidence: 0.6, app: ctx.params && (ctx.params.name || ctx.params.app) };
    }

    // 4. 工具级默认
    if (tool && action) {
        return { failureType: "TOOL_ERROR", rootCause: `${tool}.${action} 失败: ${msg.slice(0, 120) || "无错误信息"}`, confidence: 0.5 };
    }

    return { failureType: "UNKNOWN", rootCause: msg.slice(0, 150) || "无错误信息", confidence: 0.3 };
}

// ---------- 重复失败检测（消费 Working Memory） ----------
// 相同 tool+action 连续失败 ≥2 次（recentActions）或 errors 合并计数 ≥3 → 拒绝重复恢复
function isRepeated(failure, wm) {
    if (!wm) return false;
    const keyTool = failure.ctxTool || (failure && failure._tool);
    const keyAction = failure._action;
    const errs = wm.errors || [];
    const last = errs[errs.length - 1];
    if (last && last.count >= REPETITION_LIMIT) {
        return { repeated: true, count: last.count, note: `同一失败已发生 ${last.count} 次（${last.tool}.${last.action}），重复自动恢复无意义` };
    }
    // recentActions 中相同 tool+action 失败 ≥2 次
    const acts = (wm.recentActions || []).filter(a => !a.ok && a.tool === keyTool && a.action === keyAction);
    if (acts.length >= 2) {
        return { repeated: true, count: acts.length, note: `同一操作 ${keyTool}.${keyAction} 连续失败 ${acts.length} 次，应更换方案而非重复执行` };
    }
    return false;
}

// ---------- Recovery Plan 生成（确定性规则） ----------
// 返回 {failureType, rootCause, confidence, actionable, plan: [{tool, action, params}], maxAttempts, notes}
function buildRecoveryPlan(failure, ctx = {}) {
    const wm = ctx.wm || null;
    const app = failure.app || (wm && wm.currentApp) || null;
    const base = {
        failureType: failure.failureType,
        rootCause: failure.rootCause,
        confidence: failure.confidence
    };

    switch (failure.failureType) {
        case "AX_NOT_FOUND": {
            // 窗口可能未激活 → 激活 + 刷新 AX 树（AX 树是快照，刷新后可能已更新）
            if (app) {
                return {
                    ...base,
                    actionable: true,
                    plan: [
                        { tool: "window", action: "focus", params: { name: app }, goal: "恢复: 激活目标应用窗口" },
                        { tool: "ui", action: "getTree", params: { app }, goal: "恢复: 刷新 AX 控件树" }
                    ],
                    maxAttempts: 1,
                    notes: "已激活窗口并刷新 AX 树，原定位操作应由 Agent 以新树为准重试"
                };
            }
            return { ...base, actionable: false, notes: "AX 定位失败但未知目标应用，无法自动恢复" };
        }
        case "APP_NOT_RUNNING": {
            if (app) {
                return {
                    ...base,
                    actionable: true,
                    plan: [
                        { tool: "applications", action: "open", params: { name: app }, goal: "恢复: 启动目标应用" },
                        { tool: "applications", action: "isRunning", params: { name: app }, goal: "恢复: 验证应用已运行" }
                    ],
                    maxAttempts: 1,
                    notes: "已启动应用，等待 Agent 继续原操作"
                };
            }
            return { ...base, actionable: false, notes: "应用未运行但未知应用名，无法自动恢复" };
        }
        case "WINDOW_NOT_ACTIVE": {
            if (app) {
                return {
                    ...base,
                    actionable: true,
                    plan: [
                        { tool: "window", action: "focus", params: { name: app }, goal: "恢复: 激活目标窗口" },
                        { tool: "window", action: "getBounds", params: { name: app }, goal: "恢复: 确认窗口位置可用" }
                    ],
                    maxAttempts: 1,
                    notes: "已重新激活窗口"
                };
            }
            return { ...base, actionable: false, notes: "窗口不可用但未知应用名，无法自动恢复" };
        }
        case "TIMEOUT": {
            // 超时 → 重试一次原操作（不换参数），maxAttempts=1
            return {
                ...base,
                actionable: true,
                plan: [{ tool: ctx.tool, action: ctx.action, params: ctx.params, goal: "恢复: 超时后重试原操作" }],
                maxAttempts: 1,
                notes: "操作超时，已重试一次"
            };
        }
        case "FILE_NOT_FOUND": {
            // 检查父目录 → 把分析结果给 Agent（不自动重试同一路径）
            const p = (ctx.params && (ctx.params.path || ctx.params.file || ctx.params.target)) || null;
            if (p) {
                const dir = p.replace(/\/[^/]*$/, "") || "/";
                return {
                    ...base,
                    actionable: false,
                    plan: [{ tool: "filesystem", action: "list", params: { path: dir }, goal: "恢复: 检查父目录确认真实路径" }],
                    maxAttempts: 1,
                    notes: `文件不存在: ${p}，已检查父目录 ${dir}，Agent 应依据目录内容选择正确路径`
                };
            }
            return { ...base, actionable: false, notes: "文件不存在且无路径信息" };
        }
        case "PORT_IN_USE": {
            return {
                ...base,
                actionable: false,
                plan: [{ tool: "process", action: "list", params: {}, goal: "恢复: 查看占用端口的进程" }],
                maxAttempts: 1,
                notes: "端口被占用，已列出后台进程，Agent 决定换端口或停进程（停进程需用户确认）"
            };
        }
        case "PERMISSION_DENIED": {
            return { ...base, actionable: false, notes: "权限被拒绝，需用户介入（检查系统权限或确认操作），不自动恢复" };
        }
        case "PARAM_ERROR": {
            // P4-1 M4: 参数错误是决策质量问题——不自动恢复（环境无问题），
            // 提示 Agent 根据 missing/allowed 修正参数后重试，绝不原样重试
            return {
                ...base,
                actionable: false,
                notes: "参数错误：请阅读错误中的「缺少/可用参数」信息，修正参数后重试；禁止原样重试相同参数"
            };
        }
        case "COMMAND_NOT_FOUND":
        case "BUILD_ERROR":
        case "PATH_ERROR":
        case "TOOL_ERROR":
        case "UNKNOWN":
        default: {
            return { ...base, actionable: false, notes: `无法规则恢复（${failure.failureType}），错误信息已记录，由 Agent 决策下一步` };
        }
    }
}

// ---------- 执行 Recovery Plan（走 tools.run，权限系统强制） ----------
// 返回 {ok, steps: [{tool, action, params, result}], lastResult}
async function executeRecovery(plan) {
    const executed = [];
    let ok = true;
    let lastResult = null;
    for (const step of plan.plan || []) {
        const result = await tools.run(step.tool, step.action, step.params || {});
        executed.push({ tool: step.tool, action: step.action, params: step.params, result, goal: step.goal });
        lastResult = result;
        // CONFIRM 级恢复动作（如删除）→ 进待确认队列，不算失败但停止后续自动执行
        if (result.needConfirm) {
            ok = false;
            break;
        }
        if (!result.success) {
            ok = false;
            break;
        }
    }
    return { ok, steps: executed, lastResult };
}

// ---------- 验证恢复是否成功 ----------
async function verifyRecovery(failure, recovery, ctx = {}) {
    const steps = recovery.steps || [];
    if (steps.length === 0) return { ok: false, detail: "无恢复步骤可验证" };

    // 分类验证
    switch (failure.failureType) {
        case "APP_NOT_RUNNING": {
            const last = steps[steps.length - 1];
            if (last && last.tool === "applications" && last.action === "isRunning") {
                return { ok: last.result.success === true, detail: last.result.success ? "应用已运行" : "应用仍未运行" };
            }
            break;
        }
        case "AX_NOT_FOUND": {
            const tree = steps.find(s => s.tool === "ui" && s.action === "getTree");
            if (tree) {
                const t = tree.result;
                const hasTree = t.success === true && t.tree && t.tree.length > 0;
                return { ok: hasTree, detail: hasTree ? `AX 树已就绪（${t.tree.length} 个控件）` : "AX 树仍为空" };
            }
            break;
        }
        case "WINDOW_NOT_ACTIVE": {
            const gb = steps.find(s => s.tool === "window" && s.action === "getBounds");
            if (gb) return { ok: gb.result.success === true, detail: gb.result.success ? "窗口位置已获取" : "窗口仍不可用" };
            break;
        }
        default: break;
    }
    return { ok: recovery.ok, detail: recovery.ok ? "恢复动作全部成功" : "恢复动作存在失败" };
}

// ---------- 汇总入口（computerAgent 调用） ----------
// 输入: {tool, action, params, error, wm, maxReplans 由外层控制}
// 输出: {
//   failureType, rootCause, confidence,        // 分析记录（必须落日志）
//   recoveryPlan,                               // 结构化 plan（原始对象）
//   recoveryResult: {ok, detail},               // 验证结果
//   recovered: bool,                            // 是否成功恢复
//   notes,                                      // 给 Agent 的提示
//   recoverySteps                               // 已执行的恢复步骤（用于 push step 记录）
// }
async function analyzeAndRecover({ tool, action, params, error, wm }) {
    const ctx = { tool, action, params, error };
    const failure = classifyFailure(ctx);
    failure._tool = tool;
    failure._action = action;

    // 1. 重复失败检测
    const rep = isRepeated(failure, wm);
    if (rep) {
        return {
            ...failure,
            recoveryPlan: null,
            recoveryResult: { ok: false, detail: rep.note },
            recovered: false,
            notes: rep.note,
            recoverySteps: []
        };
    }

    // 2. 生成 plan
    const plan = buildRecoveryPlan(failure, { wm, tool, action, params });
    if (!plan.actionable) {
        // 分析性 plan（list 父目录/进程）仍执行，帮助 Agent 决策
        let recoverySteps = [];
        if (plan.plan && plan.plan.length > 0) {
            const r = await executeRecovery(plan);
            recoverySteps = r.steps;
        }
        return {
            ...failure,
            recoveryPlan: plan,
            recoveryResult: { ok: false, detail: plan.notes },
            recovered: false,
            notes: plan.notes,
            recoverySteps
        };
    }

    // 3. 执行 + 验证
    const recovery = await executeRecovery(plan);
    const verify = await verifyRecovery(failure, recovery, { wm });
    return {
        ...failure,
        recoveryPlan: plan,
        recoveryResult: verify,
        recovered: verify.ok,
        notes: plan.notes || "",
        recoverySteps: recovery.steps
    };
}

module.exports = {
    analyzeAndRecover,
    classifyFailure,
    buildRecoveryPlan,
    executeRecovery,
    verifyRecovery,
    isRepeated,
    DEFAULT_MAX_REPLANS,
    REPETITION_LIMIT
};
