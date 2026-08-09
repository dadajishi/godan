// taskManager.js — 异步任务管理器（解决长任务超时）
// 模式: POST /api/tasks 立即返回 taskId，后台执行 brain→dispatcher 全流程
//       GET /api/tasks/:id 轮询实时状态（computer 模式步骤增量可见）
// 特性: 浏览器连接断开不影响后台执行（Agent 独立于请求生命周期）
const crypto = require("crypto");
const brain = require("./brain");
const dispatch = require("./dispatcher");

const tasks = new Map(); // taskId → record
const MAX_TASKS = 50;

// 从 dispatcher 输出提取展示文本
function extractReplyText(out) {
    if (!out || typeof out !== "object") return "任务完成";
    if (out.mode === "computer") return out.reply || "任务完成";
    if (out.mode === "chat" && out.plan && out.plan.reply) return out.plan.reply;
    if (out.plan && out.plan.reply) return out.plan.reply;
    if (out.success === true) {
        if (out.result && out.result.project) return `✅ 项目「${out.result.project}」已生成，点击下方按钮预览 →`;
        return "✅ 任务完成";
    }
    if (out.success === false) return `❌ ${out.error || "任务失败"}`;
    return "任务完成";
}

function createTask(message) {
    const taskId = crypto.randomBytes(6).toString("hex");
    const record = {
        id: taskId,
        message: String(message).slice(0, 500),
        status: "running",          // running | done | error
        steps: [],
        pendingOps: [],
        reply: "",
        result: null,
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    tasks.set(taskId, record);
    // 清理旧任务，防内存膨胀
    if (tasks.size > MAX_TASKS) {
        const oldest = [...tasks.keys()].slice(0, tasks.size - MAX_TASKS);
        oldest.forEach(id => tasks.delete(id));
    }

    // 后台执行（不 await，独立于请求生命周期；连接断开不受影响）
    (async () => {
        try {
            const aiResult = await brain(message);
            const out = await dispatch(aiResult, {
                onStep: (step, pendingOps) => {
                    record.steps.push(step);
                    record.pendingOps = pendingOps;
                    record.updatedAt = Date.now();
                }
            });
            record.status = "done";
            record.result = out;
            record.reply = extractReplyText(out);
            record.pendingOps = (out && out.pendingOps) || [];
            record.updatedAt = Date.now();
            console.log(`📋 任务 ${taskId} 完成 (${record.steps.length} 步):`, record.reply.slice(0, 60));
        } catch (err) {
            record.status = "error";
            record.error = (err && err.message) ? err.message : String(err);
            record.updatedAt = Date.now();
            console.log(`📋 任务 ${taskId} 出错:`, record.error);
        }
    })();

    return taskId;
}

function getTask(id) {
    const t = tasks.get(id);
    if (!t) return null;
    return {
        id: t.id,
        message: t.message,
        status: t.status,
        steps: t.steps,
        pendingOps: t.pendingOps,
        reply: t.reply,
        result: t.result,
        error: t.error,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
    };
}

function listTasks(limit = 10) {
    return [...tasks.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(t => ({
            id: t.id,
            message: t.message.slice(0, 60),
            status: t.status,
            stepCount: t.steps.length,
            createdAt: t.createdAt
        }));
}

module.exports = { createTask, getTask, listTasks };
