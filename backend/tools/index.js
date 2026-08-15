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

const registry = {
    filesystem,
    shell,
    applications,
    process: processTool,
    screenshot,
    keyboard,
    mouse,
    window: windowTool,
    ui
};

// ============ 待确认操作队列 ============
const pendingOps = new Map(); // opId → {tool, action, params, createdAt}
const PENDING_TTL = 10 * 60 * 1000; // 10 分钟未确认过期

function registerPending(tool, action, params, reason) {
    const opId = crypto.randomBytes(6).toString("hex");
    pendingOps.set(opId, { tool, action, params, reason, createdAt: Date.now() });
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
 * @param {object} opts {autoApprove?: boolean 确认后重放时传 true}
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

    // 1. 权限判定
    let perm = permissions.classify(toolName, action, params);
    // process.start 的命令内容也要过 shell 黑名单
    if (toolName === "process" && action === "start") {
        const shellPerm = permissions.classifyShell(params.command || params.cmd);
        if (shellPerm.level === "DANGEROUS") perm = shellPerm;
    }

    // 2. DANGEROUS → 直接拒绝（即使 autoApprove 也不放行）
    if (perm.level === "DANGEROUS") {
        opLog.logToolCall({ tool: toolName, action, params, level: "DANGEROUS", result: { success: false, blocked: true, error: perm.reason } });
        return {
            success: false, output: null, error: perm.reason,
            exitCode: null, level: "DANGEROUS", blocked: true, reason: perm.reason
        };
    }

    // 3. CONFIRM → 进待确认队列（除非 autoApprove）
    if (perm.level === "CONFIRM" && !opts.autoApprove) {
        const opId = registerPending(toolName, action, params, perm.reason);
        opLog.logToolCall({ tool: toolName, action, params, level: "CONFIRM", result: { success: false, needConfirm: true, error: perm.reason } });
        return {
            success: false, output: null, error: perm.reason,
            exitCode: null, level: "CONFIRM", needConfirm: true, opId,
            message: `需要确认: ${perm.reason}（${toolName}.${action}）`
        };
    }

    // 4. 执行
    let result;
    try {
        result = await tool.actions[action](params);
    } catch (e) {
        result = { success: false, output: null, error: e.message, exitCode: 1 };
    }

    // 5. 日志
    opLog.logToolCall({ tool: toolName, action, params, level: perm.level, result });
    return { ...result, level: perm.level };
}

// ============ 待确认操作 ============
// 批准执行（仅 CONFIRM 级；DANGEROUS 永远拒绝）
async function confirmOp(opId) {
    const op = pendingOps.get(opId);
    if (!op) {
        return { success: false, output: null, error: "待确认操作不存在或已过期，请重新发起", exitCode: 1 };
    }
    pendingOps.delete(opId);
    return run(op.tool, op.action, op.params, { autoApprove: true });
}

function pendingList() {
    return [...pendingOps.entries()].map(([id, op]) => ({
        opId: id,
        tool: op.tool,
        action: op.action,
        reason: op.reason,
        params: op.params,
        createdAt: op.createdAt
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
