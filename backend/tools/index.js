// tools/index.js — 工具注册表 + 统一执行入口
// 职责：
//   1. 注册所有工具模块
//   2. 统一权限判定（SAFE 执行 / CONFIRM 进待确认队列 / DANGEROUS 拒绝）
//   3. 操作日志记录
//   4. 待确认操作的管理（confirm / 超时清理）
const crypto = require("crypto");
const permissions = require("../permissions");
const opLog = require("../opLog");

const filesystem = require("./filesystem");
const shell = require("./shell");
const applications = require("./applications");
const processTool = require("./process");
const screenshot = require("./screenshot");
const keyboard = require("./keyboard");
const mouse = require("./mouse");
const windowTool = require("./window");
const ui = require("./ui");
const watch = require("./watch"); // P3-4: Watch/Event 条件等待

const registry = {
    filesystem,
    shell,
    applications,
    process: processTool,
    screenshot,
    keyboard,
    mouse,
    window: windowTool,
    ui,
    watch
};

// ============ 待确认操作队列 ============
const pendingOps = new Map(); // opId → {taskId, tool, action, params, reason, rule, createdAt}
const PENDING_TTL = 10 * 60 * 1000; // 10 分钟未确认过期

// P3-6: 确认绑定 taskId（防并发任务串台）+ 记录 rule（审计/解释用）+ 同参数去重（防 LLM 重复提交刷屏）
function registerPending(taskId, tool, action, params, reason, rule) {
    // 去重: 同 task+tool+action+params 已有待确认 → 复用 opId（不产生重复 watcher/队列项）
    const paramsKey = JSON.stringify(params);
    for (const [id, op] of pendingOps) {
        if (op.taskId === (taskId || null) && op.tool === tool && op.action === action && JSON.stringify(op.params) === paramsKey) {
            op.duplicated = (op.duplicated || 0) + 1;
            return id;
        }
    }
    const opId = crypto.randomBytes(6).toString("hex");
    pendingOps.set(opId, { taskId: taskId || null, tool, action, params, reason, rule, duplicated: 0, createdAt: Date.now() });
    return opId;
}

function cleanupPending() {
    const now = Date.now();
    for (const [id, op] of pendingOps) {
        if (now - op.createdAt > PENDING_TTL) pendingOps.delete(id);
    }
}
setInterval(cleanupPending, 60 * 1000).unref();

// ============ 统一执行入口 ============
/**
 * 执行一个工具动作
 * @param {string} toolName 工具名（registry key）
 * @param {string} action 动作名
 * @param {object} params 参数
 * @param {object} opts {
 *   autoApprove?: boolean 确认后重放时传 true
 *   taskContext?: {taskId, isCancelled} watch 工具用（P3-4）
 *   context?: {taskId, goal, secure} 权限上下文（P3-6: goal=LLM 决策意图, secure=目标疑似密码框）
 * }
 */
async function run(toolName, action, params = {}, opts = {}) {
    // 容错: LLM 可能输出 "filesystem.list" 合体格式，自动拆分
    if (typeof toolName === "string" && toolName.includes(".") && !registry[toolName]) {
        const [tt, aa] = toolName.split(".");
        if (registry[tt] && aa) {
            console.log("🔧 容错解析工具名:", toolName, "→", tt, "+", aa);
            toolName = tt;
            action = aa;
        }
    }
    const tool = registry[toolName];
    if (!tool) return { success: false, output: null, error: `未知工具: ${toolName}`, exitCode: 1 };
    if (!tool.actions || typeof tool.actions[action] !== "function") {
        return { success: false, output: null, error: `未知动作: ${toolName}.${action}`, exitCode: 1 };
    }

    // 1. 权限判定（P3-6: 工具+动作+参数+资源+上下文；fail closed）
    const permContext = opts.context || {};
    let perm = permissions.classify(toolName, action, params, permContext);
    // process.start 的命令内容也要过 shell 分类
    if (toolName === "process" && action === "start") {
        const shellPerm = permissions.classifyShell(params.command || params.cmd);
        if (shellPerm.level === "DANGEROUS") perm = shellPerm;
        if (shellPerm.level === "CONFIRM" && perm.level === "SAFE") perm = shellPerm;
    }

    const taskId = permContext.taskId || (opts.taskContext && opts.taskContext.taskId) || null;
    const audit = { decision: perm.level, reason: perm.reason || "", rule: perm.rule || "", resource: perm.resource || null };

    // 2. DANGEROUS → 直接拒绝（即使 autoApprove/retry/replanner/watch 也不放行）
    if (perm.level === "DANGEROUS") {
        opLog.logToolCall({ tool: toolName, action, params: permissions.redactSensitive(params), level: "DANGEROUS", taskId, ...audit, result: { success: false, blocked: true, error: perm.reason } });
        return {
            success: false, output: null, error: perm.reason,
            exitCode: null, level: "DANGEROUS", blocked: true, reason: perm.reason, rule: perm.rule
        };
    }

    // 3. CONFIRM → 进待确认队列（除非 autoApprove）
    if (perm.level === "CONFIRM" && !opts.autoApprove) {
        const opId = registerPending(taskId, toolName, action, params, perm.reason, perm.rule);
        opLog.logToolCall({ tool: toolName, action, params: permissions.redactSensitive(params), level: "CONFIRM", taskId, opId, ...audit, result: { success: false, needConfirm: true, error: perm.reason } });
        return {
            success: false, output: null, error: perm.reason,
            exitCode: null, level: "CONFIRM", needConfirm: true, opId,
            reason: perm.reason, rule: perm.rule, resource: perm.resource || null,
            message: `需要确认: ${perm.reason}（${toolName}.${action}）`
        };
    }

    // 4. 执行
    let result;
    try {
        // P3-4: watch 工具接收 taskContext（{taskId, isCancelled}），用于去重/取消/生命周期；
        // 其余工具保持单参数签名不变
        if (toolName === "watch" && opts.taskContext) {
            result = await tool.actions[action](params, opts.taskContext);
        } else {
            result = await tool.actions[action](params);
        }
    } catch (e) {
        result = { success: false, output: null, error: e.message, exitCode: 1 };
    }

    // 5. 日志（P3-6: 敏感参数 redact；记录决策解释）
    opLog.logToolCall({ tool: toolName, action, params: permissions.redactSensitive(params), level: perm.level, taskId, ...audit, result });
    return { ...result, level: perm.level, rule: perm.rule };
}

// ============ 待确认操作 ============
// 批准执行（仅 CONFIRM 级；DANGEROUS 永远拒绝）
// P3-6: 确认绑定 taskId —— 调用方传 taskId 时校验归属，防并发任务串台
async function confirmOp(opId, opts = {}) {
    const op = pendingOps.get(opId);
    if (!op) {
        return { success: false, output: null, error: "待确认操作不存在或已过期，请重新发起", exitCode: 1 };
    }
    if (opts.taskId && op.taskId && op.taskId !== opts.taskId) {
        return { success: false, output: null, error: `该确认属于任务 ${op.taskId}，不能在任务 ${opts.taskId} 下确认（防串台）`, exitCode: 1 };
    }
    pendingOps.delete(opId);
    // 确认后重放: 走 tools.run（权限再判定一次；DANGEROUS 仍会被拒）
    const result = await run(op.tool, op.action, op.params, { autoApprove: true, context: { taskId: op.taskId } });
    opLog.logToolCall({
        tool: op.tool, action: op.action, params: permissions.redactSensitive(op.params),
        level: "CONFIRMED", taskId: op.taskId, opId,
        decision: "CONFIRMED", reason: "用户已确认执行", rule: op.rule || "",
        result
    });
    return { success: result.success, result, confirmedOp: { opId, tool: op.tool, action: op.action, rule: op.rule } };
}

function pendingList() {
    return [...pendingOps.entries()].map(([id, op]) => ({
        opId: id,
        taskId: op.taskId,
        tool: op.tool,
        action: op.action,
        reason: op.reason,
        rule: op.rule || "",
        params: permissions.redactSensitive(op.params), // 展示层 redact（不泄露密码/token）
        createdAt: op.createdAt,
        duplicated: op.duplicated || 0
    }));
}

// ============ 工具清单（给 LLM 的说明书）============
function toolSpec() {
    const specs = {};
    for (const [name, tool] of Object.entries(registry)) {
        specs[name] = {
            description: tool.description,
            actions: Object.keys(tool.actions || {})
        };
    }
    return specs;
}

module.exports = { registry, run, confirmOp, pendingList, toolSpec, pendingOps };
