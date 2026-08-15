// taskManager.js — 任务状态机 + 异步任务系统（P3-1）
// ============================================================
// 状态机: PENDING → PLANNING → RUNNING → VERIFYING → WAITING → SUCCESS
//                      ↓           ↓            ↓
//                   RETRYING ← 失败（重规划/重试）      FAILED / CANCELLED
//
// 能力:
//   - 唯一 taskId，每个 step 唯一 stepId
//   - step 结构化记录: action/input/startTime/endTime/result/verification/error/retryCount
//   - 长任务后台执行（提交即返回 taskId，独立于 HTTP 请求生命周期）
//   - 取消 / 重试（FAILED/CANCELLED → 重新执行整个任务）
//   - 任务级日志（状态转换 + agent 事件）
//   - checkpoint 预留: 每个 step 完成后原子落盘 tasks/<taskId>.json，
//     序列化字段全量保留（含 workingMemory 挂载点），重启后 recoverFromDisk()
//     可恢复历史任务；「从 checkpoint 自动续跑」留给后续阶段，数据层已就绪
// ============================================================
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DATA_ROOT } = require("./paths");
const brain = require("./brain");
const dispatch = require("./dispatcher");
const workingMemory = require("./workingMemory");
const watch = require("./tools/watch"); // P3-4: Watch 生命周期管理（取消/清理）

const tasks = new Map(); // taskId → record
const MAX_TASKS_MEM = 50; // 内存保留上限（磁盘全量保留）

const TASKS_DIR = path.join(DATA_ROOT, "tasks");

// ---------- 状态常量 ----------
const ST = {
    PENDING: "PENDING",
    PLANNING: "PLANNING",
    RUNNING: "RUNNING",
    VERIFYING: "VERIFYING",
    WAITING: "WAITING",
    RETRYING: "RETRYING",
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED"
};
// 运行中状态集合（崩溃恢复时把这些标记为中断）
const RUNNING_STATES = new Set([ST.PENDING, ST.PLANNING, ST.RUNNING, ST.VERIFYING, ST.WAITING, ST.RETRYING]);
// 终态集合（不可再取消，仅 FAILED/CANCELLED 可重试）
const FINAL_STATES = new Set([ST.SUCCESS, ST.FAILED, ST.CANCELLED]);

// 旧前端兼容映射（statusCompat: running|done|error|cancelled）
function compatStatus(status) {
    switch (status) {
        case ST.SUCCESS: return "done";
        case ST.FAILED: return "error";
        case ST.CANCELLED: return "cancelled";
        default: return "running"; // PENDING/PLANNING/RUNNING/VERIFYING/WAITING/RETRYING
    }
}

// ---------- 工具 ----------
function newId(prefix, bytes = 6) {
    return prefix + crypto.randomBytes(bytes).toString("hex");
}

function now() { return Date.now(); }
function iso() { return new Date().toISOString(); }

// 从 dispatcher 输出提取展示文本（保持原逻辑）
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

// ---------- 持久化（checkpoint 预留） ----------
// 序列化：全量保留任务记录（含 workingMemory 挂载点，P3-2 写入后可随任务落盘）
function serializeTask(t) {
    return {
        id: t.id,
        message: t.message,
        status: t.status,
        steps: t.steps,
        currentStep: t.currentStep,
        logs: t.logs,
        pendingOps: t.pendingOps,
        reply: t.reply,
        result: t.result,
        error: t.error,
        attempts: t.attempts,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
        cancelRequested: t.cancelRequested,
        // checkpoint 恢复挂载点（预留，后续阶段填充）:
        //  - workingMemory: 每任务工作记忆（P3-2）
        //  - nextStepIndex: 中断时已执行到的 step 下标（P3-x 续跑用）
        //  - mode: brain 路由结果（computer/plan/chat），续跑时避免重复路由
        workingMemory: t.workingMemory || null,
        nextStepIndex: t.nextStepIndex || null,
        mode: t.mode || null
    };
}
function deserializeTask(d) {
    // 旧格式容错：缺失字段补默认
    return {
        id: d.id,
        message: d.message || "",
        status: d.status || ST.FAILED,
        steps: Array.isArray(d.steps) ? d.steps : [],
        currentStep: d.currentStep || null,
        logs: Array.isArray(d.logs) ? d.logs : [],
        pendingOps: Array.isArray(d.pendingOps) ? d.pendingOps : [],
        reply: d.reply || "",
        result: d.result || null,
        error: d.error || null,
        attempts: d.attempts || 1,
        createdAt: d.createdAt || now(),
        updatedAt: d.updatedAt || now(),
        startedAt: d.startedAt || null,
        finishedAt: d.finishedAt || null,
        cancelRequested: !!d.cancelRequested,
        maxReplans: d.maxReplans || undefined, // P3-3: 重规划配额（崩溃恢复后保留）
        workingMemory: d.workingMemory || null,
        nextStepIndex: d.nextStepIndex || null,
        mode: d.mode || null
    };
}

function taskFilePath(id) {
    return path.join(TASKS_DIR, `${id}.json`);
}

// 原子写（tmp + rename，防写一半崩溃损坏 checkpoint）
function persist(taskId) {
    const t = tasks.get(taskId);
    if (!t) return;
    try {
        fs.mkdirSync(TASKS_DIR, { recursive: true });
        const file = taskFilePath(taskId);
        const tmp = file + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(serializeTask(t)), "utf8");
        fs.renameSync(tmp, file);
    } catch (e) {
        console.log("⚠️ 任务 checkpoint 写入失败:", e.message);
    }
}

// 启动时恢复：加载磁盘上最近 N 个任务进内存；运行中任务标记为中断
function recoverFromDisk() {
    let restored = 0, interrupted = 0;
    try {
        if (!fs.existsSync(TASKS_DIR)) return { restored, interrupted };
        const files = fs.readdirSync(TASKS_DIR)
            .filter(f => f.endsWith(".json") && !f.endsWith(".tmp.json"))
            .map(f => ({ file: f, mtime: fs.statSync(path.join(TASKS_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, MAX_TASKS_MEM);

        for (const { file } of files) {
            try {
                const d = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, file), "utf8"));
                const t = deserializeTask(d);
                // P3-2: 恢复/补齐 working memory（旧 checkpoint 无此字段或损坏时重建）
                if (!t.workingMemory || typeof t.workingMemory !== "object" || !t.workingMemory.taskId) {
                    t.workingMemory = workingMemory.create(t.id);
                }
                const wasRunning = RUNNING_STATES.has(t.status);
                if (wasRunning) {
                    // 崩溃中断：标记 FAILED，保留 steps 历史，可 retry 续跑
                    t.status = ST.FAILED;
                    t.error = "后端进程重启，任务中断（可点击重试）";
                    t.finishedAt = now();
                    t.logs.push({ ts: iso(), level: "warn", message: "⚠️ 检测到后端重启，运行中任务已标记为中断" });
                    interrupted++;
                }
                tasks.set(t.id, t);
                if (wasRunning) {
                    // 原子落盘中断状态（磁盘快照与内存一致）
                    try {
                        const file = taskFilePath(t.id);
                        const tmp = file + ".tmp";
                        fs.writeFileSync(tmp, JSON.stringify(serializeTask(t)), "utf8");
                        fs.renameSync(tmp, file);
                    } catch (e) { /* 忽略 */ }
                }
                restored++;
            } catch (e) {
                console.log("⚠️ 任务恢复跳过损坏文件:", file, e.message);
            }
        }
    } catch (e) {
        console.log("⚠️ 任务恢复失败:", e.message);
    }
    console.log(`📦 任务恢复: ${restored} 个（其中 ${interrupted} 个中断标记）`);
    return { restored, interrupted };
}

// ---------- 内部操作 ----------
function addLog(taskId, level, message) {
    const t = tasks.get(taskId);
    if (!t) return;
    t.logs.push({ ts: iso(), level, message: String(message).slice(0, 500) });
    if (t.logs.length > 500) t.logs = t.logs.slice(-500);
}

function setStatus(taskId, status) {
    const t = tasks.get(taskId);
    if (!t) return;
    const prev = t.status;
    t.status = status;
    t.updatedAt = now();
    if (status === ST.SUCCESS || status === ST.FAILED || status === ST.CANCELLED) {
        t.finishedAt = now();
    }
    if (prev !== status) {
        addLog(taskId, "info", `状态: ${prev} → ${status}`);
    }
    persist(taskId);
}

// 创建结构化 step 记录（P3-1: stepId + 时间戳 + verification/retryCount 字段）
// input 记录动作入参（LLM 决策原文），result 记录执行结果摘要
function newStepRecord(step, attempt) {
    const s = {
        stepId: newId("st_", 4),
        attempt,
        tool: step.tool || "",
        action: step.action || "",
        input: step.input ?? (step.params ?? null), // 入参（决策原文）
        goal: step.goal || "",
        level: step.level || "SAFE",
        status: step.ok ? "success" : step.needConfirm ? "needConfirm" : step.blocked ? "blocked" : "failed",
        startTime: step.startTime || now(),
        endTime: step.endTime || now(),
        result: step.result ?? (step.output ? { output: step.output } : null),
        verification: step.verification || null, // {ok, method, detail} | null
        error: step.error || null,
        retryCount: step.retryCount || 0,
        forced: step.forced || false,
        opId: step.opId || null,
        // P3-3: 恢复步骤标记（recovery=true 表示是 Replanner 生成的恢复动作；analysis 含完整失败分析）
        recovery: step.recovery || false,
        recoveryOf: step.recoveryOf || null,
        analysis: step.analysis || null,
        // P4-1 M4: 参数错误标记（决策质量问题，前端/日志可见）
        paramError: step.paramError === true
    };
    return s;
}

// ---------- 任务执行（后台） ----------
function runTask(taskId) {
    const t = tasks.get(taskId);
    if (!t) return;
    t.attempts = (t.attempts || 0) + 1;
    t.startedAt = now();
    t.finishedAt = null;
    t.cancelRequested = false;
    t.error = null;
    t.reply = "";
    t.result = null;
    setStatus(taskId, ST.PENDING);

    (async () => {
        try {
            // 阶段 1: 意图路由
            setStatus(taskId, ST.PLANNING);
            const aiResult = await brain(t.message);
            t.mode = aiResult.tool || null;
            persist(taskId);
            if (t.cancelRequested) { setStatus(taskId, ST.CANCELLED); return; }

            // 阶段 2: 调度执行（computer 模式由 computerAgent 逐 step 汇报）
            setStatus(taskId, ST.RUNNING);
            const out = await dispatch(aiResult, {
                taskId, // P3-4: watch 工具需要 taskId（去重/取消/生命周期）
                onStatus: (status) => setStatus(taskId, status),
                onLog: (level, msg) => addLog(taskId, level, msg),
                isCancelled: () => t.cancelRequested,
                getWorkingMemory: () => t.workingMemory,
                maxReplans: t.maxReplans, // P3-3: 重规划配额（任务级可配置）
                onStep: (step, pendingOps) => {
                    const rec = newStepRecord(step, t.attempts);
                    t.steps.push(rec);
                    t.currentStep = { stepId: rec.stepId, index: t.steps.length - 1, tool: rec.tool, action: rec.action };
                    t.nextStepIndex = t.steps.length; // checkpoint: 下一个待执行 step 下标
                    t.pendingOps = pendingOps || [];
                    // P3-2: 每 step 后自动更新工作记忆（应用/文件提取 + action/error/verification 记录）
                    workingMemory.applyStep(t.workingMemory, rec, t.steps.length - 1);
                    t.updatedAt = now();
                    persist(taskId); // 每步完成即 checkpoint（WM 随任务落盘）
                }
            });

            if (t.cancelRequested) {
                setStatus(taskId, ST.CANCELLED);
                addLog(taskId, "info", "任务已取消（用户请求）");
                persist(taskId);
                return;
            }

            // 阶段 3: 收尾
            t.result = out;
            t.reply = extractReplyText(out);
            t.pendingOps = (out && out.pendingOps) || [];
            persist(taskId);

            // computer 模式: agent 已通过 onStatus 汇报终态（SUCCESS/FAILED/CANCELLED），不覆盖；
            // plan/chat 模式: agent 未汇报，按 out 推导
            if (!FINAL_STATES.has(t.status)) {
                const ok = !!(out && out.success === true) || out.mode === "chat";
                setStatus(taskId, ok ? ST.SUCCESS : ST.FAILED);
                if (!ok) {
                    t.error = (out && out.error) ? out.error : (out && out.reply ? out.reply : "任务失败");
                    addLog(taskId, "error", "任务失败: " + String(t.error).slice(0, 300));
                } else {
                    addLog(taskId, "info", `任务完成（${t.steps.length} 步）`);
                }
            } else {
                // agent 已汇报终态：补充日志（不重复 setStatus，避免覆盖 finishedAt/日志）
                addLog(taskId, "info", `Agent 汇报终态 ${t.status}（共 ${t.steps.length} 步，attempt ${t.attempts}）`);
            }
            persist(taskId);
            console.log(`📋 任务 ${taskId} 终态 ${t.status} (attempt ${t.attempts}, ${t.steps.length} 步):`, (t.reply || "").slice(0, 60));
        } catch (err) {
            const msg = (err && err.message) ? err.message : String(err);
            setStatus(taskId, ST.FAILED);
            t.error = msg;
            addLog(taskId, "error", "任务异常: " + msg.slice(0, 300));
            persist(taskId);
            console.log(`📋 任务 ${taskId} 异常:`, msg);
        }
    })();
}

// ---------- 对外 API ----------
function createTask(message, opts = {}) {
    const taskId = newId("t_");
    const record = {
        id: taskId,
        message: String(message).slice(0, 500),
        status: ST.PENDING,
        steps: [],
        currentStep: null,
        logs: [{ ts: iso(), level: "info", message: "任务已创建" }],
        pendingOps: [],
        reply: "",
        result: null,
        error: null,
        attempts: 0,
        createdAt: now(),
        updatedAt: now(),
        startedAt: null,
        finishedAt: null,
        cancelRequested: false,
        // P3-3: 重规划配额（任务级可配置，默认 DEFAULT_MAX_REPLANS）
        maxReplans: (typeof opts.maxReplans === "number" && opts.maxReplans >= 0) ? opts.maxReplans : undefined,
        // P3-2: 每任务独立工作记忆（随 checkpoint 落盘，与全局 memory/ 解耦）
        workingMemory: workingMemory.create(taskId),
        nextStepIndex: null,
        mode: null
    };
    tasks.set(taskId, record);
    addLog(taskId, "info", "提交后台执行");
    persist(taskId);

    // 内存上限清理（只清内存，磁盘保留）
    if (tasks.size > MAX_TASKS_MEM) {
        const finished = [...tasks.values()]
            .filter(t => FINAL_STATES.has(t.status))
            .sort((a, b) => a.updatedAt - b.updatedAt);
        const excess = tasks.size - MAX_TASKS_MEM;
        finished.slice(0, excess).forEach(t => tasks.delete(t.id));
    }

    runTask(taskId);
    return taskId;
}

// 取消任务（仅运行中状态；立即置 CANCELLED，agent 循环在 step 边界停止）
function cancelTask(id) {
    const t = tasks.get(id);
    if (!t) return { ok: false, error: "任务不存在: " + id };
    if (FINAL_STATES.has(t.status)) {
        return { ok: false, error: `任务已结束（${t.status}），无法取消` };
    }
    t.cancelRequested = true;
    setStatus(id, ST.CANCELLED);
    addLog(id, "info", "⏹️ 用户请求取消任务");
    // P3-4: 取消该任务所有 active Watch（防孤儿 watcher 继续轮询）
    const n = watch.manager.cancelTaskWatches(id);
    if (n > 0) addLog(id, "info", `已停止 ${n} 个等待（Watch）`);
    persist(id);
    console.log(`📋 任务 ${id} 取消请求已受理${n > 0 ? `（停止 ${n} 个 Watch）` : ""}`);
    return { ok: true, status: ST.CANCELLED };
}

// 重试（FAILED/CANCELLED → 重新执行整个任务，同一 taskId，步骤历史保留并追加新 attempt）
// M1: 明确最大重试次数（MAX_RETRIES=5），超出后拒绝，防止无限重试
const MAX_RETRIES = 5;

// 纯逻辑重试判定（可独立测试）: {ok, error?}
function canRetry(t) {
    if (!t) return { ok: false, error: "任务不存在" };
    if (!FINAL_STATES.has(t.status)) {
        return { ok: false, error: `任务仍在执行（${t.status}），无法重试` };
    }
    if (t.status === ST.SUCCESS) {
        return { ok: false, error: "任务已成功，无需重试" };
    }
    if ((t.attempts || 1) >= 1 + MAX_RETRIES) {
        return { ok: false, error: `已达到最大重试次数（${MAX_RETRIES}），无法继续重试` };
    }
    return { ok: true };
}

function retryTask(id) {
    const t = tasks.get(id);
    const r = canRetry(t);
    if (!r.ok) return r;
    addLog(id, "info", `🔄 用户请求重试（attempt ${t.attempts + 1}/${1 + MAX_RETRIES}）`);
    runTask(id);
    return { ok: true, status: t.status };
}

function getTask(id) {
    const t = tasks.get(id);
    if (!t) return null;
    return {
        id: t.id,
        message: t.message,
        status: t.status,
        statusCompat: compatStatus(t.status),
        steps: t.steps,
        currentStep: t.currentStep,
        logs: t.logs.slice(-50),
        pendingOps: t.pendingOps,
        reply: t.reply,
        result: t.result,
        error: t.error,
        attempts: t.attempts,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
        cancelRequested: t.cancelRequested,
        workingMemory: t.workingMemory || null,
        // P3-4: 附加当前 active watch（任务 WAITING 时前端显示等待内容/倒计时）
        watch: watch.manager.activeWatch(id) // null 或 {watchId, type, conditionText, status, timeoutAt, ...}
    };
}

function getTaskLogs(id, limit = 100) {
    const t = tasks.get(id);
    if (!t) return null;
    return t.logs.slice(-Math.min(limit, 500));
}

function listTasks(limit = 10) {
    return [...tasks.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(t => ({
            id: t.id,
            message: t.message.slice(0, 60),
            status: t.status,
            statusCompat: compatStatus(t.status),
            stepCount: t.steps.length,
            attempts: t.attempts,
            createdAt: t.createdAt,
            finishedAt: t.finishedAt
        }));
}

module.exports = {
    createTask, getTask, getTaskLogs, listTasks,
    cancelTask, retryTask, canRetry, MAX_RETRIES,
    recoverFromDisk,
    ST, // 状态常量（前端/测试可用）
    serializeTask, deserializeTask, // checkpoint 序列化（供后续阶段/测试）
    TASKS_DIR
};
