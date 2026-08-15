// tools/watch.js — Watch/Event 模式（P3-4）
// ============================================================
// 目标: 「等待条件」成为 Agent 的状态（Task → WAITING），而不是 LLM 反复调用工具轮询。
//   Agent 决策 {tool:"watch", action:"waitFile", ...} → 创建 Watch → 任务进入 WAITING
//   → Watch 独立轮询（低 token，Agent 不消耗任何决策 token）→ 条件满足 TRIGGERED
//   → Task → RUNNING → Agent 继续。
//
// 信息源优先级（Vision 不参与默认 Watch）:
//   waitFile   → 文件系统（fs 轮询）
//   waitProcess→ 进程状态（kill(pid,0) / pgrep）
//   waitApp    → applications.isRunning
//   waitLog    → 进程日志 stdout/stderr（process.readLog）
//   waitValue  → AX 显示值（ui.readValue）
//   waitTree   → AX 控件树（ui.getTree）
//
// 生命周期: PENDING → WAITING → TRIGGERED / TIMEOUT / FAILED / CANCELLED
// 约束:
//   - 默认超时 60s，最大 600s（绝不无限等待）
//   - 去重: taskId + type + normalized condition（同条件不产生重复 watcher）
//   - 可取消: cancelTaskWatches(taskId)（任务取消/结束必须调用，不留孤儿 watcher）
//   - Watch 只做只读探测；触发后的动作仍由 Agent 正常决策走 tools.run（权限强制）
// ============================================================
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const applications = require("./applications");
const ui = require("./ui");

const DEFAULT_TIMEOUT = 60 * 1000; // 默认 60s
const MAX_TIMEOUT = 600 * 1000;    // 最大 600s
const DEFAULT_POLL = 1000;         // 默认轮询 1s
const MAX_POLL = 5000;
const RETENTION = 60 * 1000;       // 结束后保留 60s 供前端查看

const WS = {
    PENDING: "PENDING", WAITING: "WAITING", TRIGGERED: "TRIGGERED",
    TIMEOUT: "TIMEOUT", FAILED: "FAILED", CANCELLED: "CANCELLED"
};

const watches = new Map(); // watchId → record

function newId() { return "w_" + crypto.randomBytes(5).toString("hex"); }

function normTimeout(t) {
    const n = parseInt(t, 10);
    if (isNaN(n) || n <= 0) return DEFAULT_TIMEOUT;
    return Math.min(n * 1000, MAX_TIMEOUT);
}
function normPoll(p) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n <= 0) return DEFAULT_POLL;
    return Math.min(n * 1000, MAX_POLL);
}
function dedupeKey(taskId, type, condition) {
    return `${taskId || "-"}|${type}|${JSON.stringify(condition || {})}`;
}

// ---------- 核心等待（创建 + 后台轮询，Promise 在触发/超时/取消时 resolve） ----------
function wait(opts) {
    return new Promise((resolve) => {
        const taskId = opts.taskId || null;
        const key = dedupeKey(taskId, opts.type, opts.condition);

        // 去重: 同 task+type+condition 已有 active watch → 复用，不创建新 watcher
        for (const w of watches.values()) {
            if (w.dedupeKey === key && (w.status === WS.WAITING || w.status === WS.PENDING)) {
                w.duplicated = (w.duplicated || 0) + 1;
                resolve({
                    success: false,
                    error: `已存在相同等待（${w.watchId}，第 ${w.duplicated} 次重复调用已合并，不创建新 watcher）`,
                    watch: publicWatch(w)
                });
                return;
            }
        }

        const record = {
            watchId: newId(),
            taskId,
            type: opts.type,
            condition: opts.condition || {},
            conditionText: opts.conditionText || opts.type,
            status: WS.PENDING,
            createdAt: Date.now(),
            startedAt: null,
            timeoutAt: null,
            pollInterval: normPoll(opts.pollInterval),
            lastCheck: null,
            result: null,
            error: null,
            dedupeKey: key,
            duplicated: 0,
            _timer: null,
            _resolved: false
        };
        watches.set(record.watchId, record);

        const timeout = normTimeout(opts.timeout);
        record.startedAt = Date.now();
        record.timeoutAt = record.startedAt + timeout;
        record.status = WS.WAITING;

        const finish = (status, extra = {}) => {
            if (record._resolved) return;
            record._resolved = true;
            record.status = status;
            record.result = extra.result || null;
            record.error = extra.error || null;
            if (record._timer) { clearTimeout(record._timer); record._timer = null; }
            const pub = publicWatch(record);
            // 保留一段时间供前端查看后清理（防 map 膨胀）
            setTimeout(() => watches.delete(record.watchId), RETENTION).unref();
            const payload = { watch: pub };
            if (status === WS.TRIGGERED) {
                payload.success = true;
                payload.output = `✅ 条件已满足: ${record.conditionText}`;
                if (extra.result) payload.conditionResult = extra.result;
            } else {
                payload.success = false;
                payload.error = extra.error || `Watch ${status}`;
            }
            resolve(payload);
        };

        const tick = async () => {
            if (record._resolved) return;
            record.lastCheck = Date.now();
            // 取消检查（任务被取消 → 停止轮询）
            if (opts.isCancelled && opts.isCancelled()) {
                return finish(WS.CANCELLED, { error: "Watch 已取消（任务已取消）" });
            }
            // 超时检查
            if (Date.now() >= record.timeoutAt) {
                return finish(WS.TIMEOUT, { error: `等待超时(${Math.round(timeout / 1000)}s): ${record.conditionText}` });
            }
            try {
                const r = await opts.check();
                if (r && r.ok) {
                    return finish(WS.TRIGGERED, { result: r.result });
                }
            } catch (e) {
                // 探测异常（进程临时消失等）不立即失败，记录并继续
                record.error = String(e.message || e).slice(0, 200);
            }
            // 注意: 不能 unref — 等待期间必须保持进程存活（unref 会让 event loop 空转时进程退出，
            // 导致 Watch Promise 永不 resolve，任务挂死）
            record._timer = setTimeout(tick, record.pollInterval);
        };
        tick();
    });
}

function publicWatch(w) {
    return {
        watchId: w.watchId,
        taskId: w.taskId,
        type: w.type,
        condition: w.condition,
        conditionText: w.conditionText,
        status: w.status,
        createdAt: w.createdAt,
        startedAt: w.startedAt,
        timeoutAt: w.timeoutAt,
        pollInterval: w.pollInterval,
        lastCheck: w.lastCheck,
        result: w.result,
        error: w.error
    };
}

// ---------- Watch 管理（供 taskManager / computerAgent 集成） ----------
function activeWatches(taskId) {
    if (!taskId) return [];
    return [...watches.values()]
        .filter(w => w.taskId === taskId && (w.status === WS.PENDING || w.status === WS.WAITING))
        .map(publicWatch);
}
function activeWatch(taskId) {
    const list = activeWatches(taskId);
    return list.length ? list[0] : null;
}
// 取消某任务的所有 active watch（任务取消/结束必须调用，防止孤儿 watcher）
function cancelTaskWatches(taskId) {
    if (!taskId) return 0;
    let n = 0;
    for (const w of watches.values()) {
        if (w.taskId === taskId && (w.status === WS.PENDING || w.status === WS.WAITING)) {
            w.status = WS.CANCELLED;
            w.error = "任务结束/取消，Watch 已停止";
            n++;
        }
    }
    return n;
}

// ---------- 各等待动作（params 由 LLM 提供；taskCtx={taskId,isCancelled} 由 tools.run 透传） ----------
async function waitFile(params, taskCtx) {
    const target = String(params.path || params.file || "").trim();
    if (!target) return { success: false, output: null, error: "缺少文件路径 (path)", exitCode: 1 };
    const mode = params.exists === false || params.notExists ? "notExists" : "exists";
    const size = parseInt(params.size, 10);
    const abs = target.replace(/^~(?=\/|$)/, os.homedir());
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitFile",
        condition: { path: abs, mode, size: isNaN(size) ? null : size },
        conditionText: `${mode === "exists" ? "等待文件出现" : "等待文件消失"}: ${abs}${!isNaN(size) ? ` (大小≥${size}B)` : ""}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const exists = fs.existsSync(abs);
            if (mode === "notExists") return exists ? { ok: false } : { ok: true, result: { exists: false } };
            if (!exists) return { ok: false };
            if (!isNaN(size)) {
                try {
                    if (fs.statSync(abs).size < size) return { ok: false };
                } catch (e) { return { ok: false }; }
            }
            return { ok: true, result: { exists: true } };
        }
    });
}

function isProcessRunning(pid, name) {
    return new Promise((resolve) => {
        if (!isNaN(pid) && pid > 0) {
            try { process.kill(pid, 0); return resolve(true); } catch (e) { return resolve(e.code === "EPERM"); }
        }
        execFile("pgrep", ["-x", String(name)], { timeout: 5000 }, (err, stdout) => {
            resolve(!err && String(stdout || "").trim().length > 0);
        });
    });
}

async function waitProcess(params, taskCtx) {
    const pid = parseInt(params.pid, 10);
    const name = String(params.name || "").trim();
    if (isNaN(pid) && !name) return { success: false, output: null, error: "缺少 pid 或 name", exitCode: 1 };
    const expect = params.running !== false && params.exited !== true; // 默认等 running
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitProcess",
        condition: { pid: isNaN(pid) ? null : pid, name, expect: expect ? "running" : "exited" },
        conditionText: `${expect ? "等待进程运行" : "等待进程退出"}: ${name || "pid " + pid}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const running = await isProcessRunning(pid, name);
            return running === expect ? { ok: true, result: { running } } : { ok: false };
        }
    });
}

async function waitApp(params, taskCtx) {
    const name = String(params.name || params.app || "").trim();
    if (!name) return { success: false, output: null, error: "缺少应用名 (name)", exitCode: 1 };
    const expectRunning = params.running !== false;
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitApp",
        condition: { name, expect: expectRunning ? "running" : "exited" },
        conditionText: `${expectRunning ? "等待应用启动" : "等待应用退出"}: ${name}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const res = await applications.actions.isRunning({ name });
            const running = res.success === true;
            return running === expectRunning ? { ok: true, result: { running } } : { ok: false };
        }
    });
}

async function waitLog(params, taskCtx) {
    const pid = parseInt(params.pid, 10);
    const name = String(params.name || "").trim();
    const needle = String(params.contains || params.match || "").trim();
    if ((isNaN(pid) && !name) || !needle) return { success: false, output: null, error: "缺少 pid/name 或 contains", exitCode: 1 };
    const processTool = require("./process");
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitLog",
        condition: { pid: isNaN(pid) ? null : pid, name, needle },
        conditionText: `等待日志出现「${needle}」: ${name || "pid " + pid}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const res = await processTool.actions.readLog({ pid, name });
            if (!res.success) return { ok: false };
            if (String(res.output || "").includes(needle)) return { ok: true, result: { matched: needle } };
            return { ok: false };
        }
    });
}

async function waitValue(params, taskCtx) {
    const app = String(params.app || "").trim();
    if (!app) return { success: false, output: null, error: "缺少应用名 (app)", exitCode: 1 };
    const equals = params.equals !== undefined ? String(params.equals) : null;
    const contains = params.contains !== undefined ? String(params.contains) : null;
    if (equals === null && contains === null) return { success: false, output: null, error: "缺少条件 (equals 或 contains)", exitCode: 1 };
    const label = String(params.label || "").trim();
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitValue",
        condition: { app, label, equals, contains },
        conditionText: `等待「${app}」显示${contains !== null ? "包含「" + contains + "」" : "等于「" + equals + "」"}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const res = await ui.actions.readValue({ app, label: label || undefined });
            if (!res.success) return { ok: false };
            const val = String(res.value || "");
            if (equals !== null && val === equals) return { ok: true, result: { value: val } };
            if (contains !== null && val.includes(contains)) return { ok: true, result: { value: val } };
            return { ok: false };
        }
    });
}

async function waitTree(params, taskCtx) {
    const app = String(params.app || "").trim();
    if (!app) return { success: false, output: null, error: "缺少应用名 (app)", exitCode: 1 };
    const role = String(params.role || "").trim();
    const label = String(params.label || "").trim();
    const expect = params.exists !== false; // 默认等出现
    return wait({
        taskId: taskCtx && taskCtx.taskId,
        type: "waitTree",
        condition: { app, role, label, expect: expect ? "exists" : "gone" },
        conditionText: `${expect ? "等待控件出现" : "等待控件消失"}: ${role || label || "任意可交互控件"} @ ${app}`,
        timeout: params.timeout, pollInterval: params.pollInterval,
        isCancelled: taskCtx && taskCtx.isCancelled,
        check: async () => {
            const res = await ui.actions.getTree({ app });
            if (!res.success) return { ok: false };
            const els = res.tree || [];
            if (els.length === 0) return expect ? { ok: false } : { ok: true, result: { found: false, count: 0 } };
            let found = true;
            if (role) found = els.some(e => e.role === role);
            if (label && found) found = els.some(e => (e.name || e.value || "").includes(label));
            if (found === expect) return { ok: true, result: { found, count: els.length } };
            return { ok: false };
        }
    });
}

module.exports = {
    name: "watch",
    description: "条件等待（低 token 轮询，等待期间任务进入 WAITING，Agent 不消耗决策 token）：waitFile 等文件出现/消失(>=size)；waitProcess 等进程运行/退出(pid 或 name)；waitApp 等应用启动/退出；waitLog 等进程日志出现关键字(contains)；waitValue 等 AX 显示值等于(equals)/包含(contains)；waitTree 等 AX 控件出现/消失(role/label)。统一参数 timeout(秒,默认60,最大600)。条件满足返回 success，超时返回失败并交给 Replanner",
    actions: { waitFile, waitProcess, waitApp, waitLog, waitValue, waitTree },
    manager: { activeWatches, activeWatch, cancelTaskWatches, WS }
};
