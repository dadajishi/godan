#!/usr/bin/env node
// benchmark.js — P4-1 M5: 全工具可靠性回归基准
// ============================================================
// 用法:
//   node backend/benchmark.js --unit          仅单元层（秒级，无 LLM）
//   node backend/benchmark.js [--port 3010]   全量（单元 + 真实任务，需后端已启动）
//   node backend/benchmark.js --tasks-only    仅真实任务层
//
// 单元层（确定性，无 LLM）:
//   - toolSchema 参数验证用例（M1/M3）
//   - replanner 失败分类用例（P3-3 + P4-1 M4 PARAM_ERROR）
//   - permissions 权限分类用例（P3-6）
//   - watch 生命周期用例（P3-4: 触发/超时/去重/取消）
//
// 真实任务层（LLM + 真实工具，经 POST /api/tasks 全链路）:
//   - 计算器 AX 任务（AX 闭环回归）
//   - Blender 打开任务（M2 应用解析回归，未安装则跳过）
//   - watch 文件等待任务（P3-4 回归，脚本自动创建文件触发）
//   - 不存在的应用任务（M2 appNotFound 错误路径回归）
//
// 输出: 人类可读报告 + benchmark-report.json
// ============================================================
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || process.env.PORT || "3010", 10);
const BASE = `http://127.0.0.1:${PORT}`;
const REPORT_FILE = path.join(__dirname, "..", "benchmark-report.json");
const TASK_TIMEOUT_MS = 300 * 1000; // 单任务最长 5 分钟
const ONLY_UNIT = process.argv.includes("--unit");
const ONLY_TASKS = process.argv.includes("--tasks-only");

let passCount = 0, failCount = 0;
const failures = [];

function check(name, ok, detail = "") {
    if (ok) passCount++;
    else { failCount++; failures.push({ name, detail }); }
    console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

// ==================== 单元层 ====================
async function runUnit() {
    console.log("\n📐 单元层（确定性用例）\n");

    // ---- toolSchema（M1/M3）----
    console.log("[1] toolSchema 参数验证");
    const toolSchema = require("./toolSchema");
    const schemaCases = [
        [false, "waitValue 缺 equals/contains", "watch", "waitValue", { app: "Calculator" }],
        [true, "waitValue 有 equals", "watch", "waitValue", { app: "Calculator", equals: "0" }],
        [true, "waitValue 有 contains", "watch", "waitValue", { app: "Calculator", contains: "0" }],
        [false, "drag from 缺 x", "mouse", "drag", { from: { y: 100 }, to: { x: 300, y: 400 } }],
        [false, "drag from 传字符串", "mouse", "drag", { from: "100,200", to: { x: 300, y: 400 } }],
        [true, "drag 正常", "mouse", "drag", { from: { x: 100, y: 200 }, to: { x: 300, y: 400 } }],
        [false, "click x 传字符串", "mouse", "click", { x: "100", y: 200 }],
        [true, "click 正常", "mouse", "click", { x: 100, y: 200 }],
        [false, "waitProcess pid 字符串", "watch", "waitProcess", { pid: "123" }],
        [true, "waitProcess pid 数字", "watch", "waitProcess", { pid: 123 }],
        [false, "screenshot bounds 缺 w", "screenshot", "capture", { bounds: { x: 0, y: 0, h: 100 } }],
        [true, "screenshot bounds 正常", "screenshot", "analyze", { bounds: { x: 0, y: 0, w: 100, h: 100 } }],
        [false, "shell.exec 缺 command", "shell", "exec", { cwd: "/tmp" }],
        [true, "filesystem.list 正常", "filesystem", "list", { path: "/tmp" }],
        [true, "ui.getTree 正常", "ui", "getTree", { app: "Calculator" }],
        [true, "watch.waitFile 正常", "watch", "waitFile", { path: "/tmp/x.txt", timeout: 30 }]
    ];
    for (const [expectPass, name, tool, action, params] of schemaCases) {
        const r = toolSchema.validate(tool, action, params);
        check(`schema: ${name}`, (r === null) === expectPass, r ? r.message.slice(0, 60) : "");
    }

    // ---- replanner（P3-3 + M4）----
    console.log("\n[2] replanner 失败分类");
    const replanner = require("./replanner");
    const classCases = [
        ["PARAM_ERROR", "paramError 标记", { tool: "watch", action: "waitValue", params: {}, error: "参数错误: 缺少: equals/contains 至少需要其中一个（可用参数: label, equals, contains, timeout, pollInterval）", result: { paramError: true } }],
        ["PARAM_ERROR", "paramError 文本前缀", { tool: "watch", action: "waitValue", params: {}, error: "参数错误: 缺少: app" }],
        ["TIMEOUT", "真超时", { tool: "shell", action: "exec", params: {}, error: "Command failed: ETIMEDOUT" }],
        ["TIMEOUT", "watch 超时文本", { tool: "watch", action: "waitFile", params: {}, error: "等待超时(60s): 等待文件出现: /x" }],
        ["AX_NOT_FOUND", "AX 找不到控件", { tool: "ui", action: "findElement", params: { app: "Calculator" }, error: "在「Calculator」中未找到匹配控件 (keyword=加号)" }],
        ["APP_NOT_RUNNING", "应用未运行", { tool: "applications", action: "isRunning", params: { name: "Safari" }, error: "应用未运行" }],
        ["WINDOW_NOT_ACTIVE", "窗口不可用", { tool: "window", action: "getBounds", params: { name: "Chrome" }, error: "获取窗口位置失败: window not available" }],
        ["COMMAND_NOT_FOUND", "命令不存在", { tool: "shell", action: "exec", params: {}, error: "/bin/sh: xyz: command not found" }],
        ["FILE_NOT_FOUND", "ENOENT", { tool: "filesystem", action: "read", params: {}, error: "ENOENT: no such file or directory, open '/a/b.txt'" }],
        ["PORT_IN_USE", "端口占用", { tool: "shell", action: "exec", params: {}, error: "Error: listen EADDRINUSE: address already in use :::3001" }],
        ["BUILD_ERROR", "语法错误", { tool: "shell", action: "exec", params: {}, error: "SyntaxError: Unexpected token (1:2)" }],
        ["PERMISSION_DENIED", "权限拒绝", { tool: "shell", action: "exec", params: {}, error: "Operation not permitted" }],
        ["TOOL_ERROR", "工具未知错误", { tool: "mouse", action: "click", params: {}, error: "cliclick 未安装" }]
    ];
    for (const [expect, name, ctx] of classCases) {
        const f = replanner.classifyFailure(ctx);
        check(`分类: ${name} → ${expect}`, f.failureType === expect, `实际 ${f.failureType}`);
    }
    // PARAM_ERROR plan 不可恢复 + 提示修正
    const pf = replanner.classifyFailure(classCases[0][2]);
    const pp = replanner.buildRecoveryPlan(pf, {});
    check("PARAM_ERROR actionable=false", pp.actionable === false);
    check("PARAM_ERROR notes 含修正提示", /修正参数/.test(pp.notes || ""));
    // 重复失败检测（WM 消费）
    const wm = require("./workingMemory").create("t_bench");
    wm.recentActions.push({ tool: "ui", action: "findElement", goal: "x", ok: false, level: "SAFE", time: Date.now() });
    wm.recentActions.push({ tool: "ui", action: "findElement", goal: "x", ok: false, level: "SAFE", time: Date.now() });
    const rep = replanner.isRepeated({ _tool: "ui", _action: "findElement" }, wm);
    check("重复失败检测", rep && rep.repeated === true, rep && rep.note);

    // ---- permissions（P3-6）----
    console.log("\n[3] permissions 权限分类");
    const permissions = require("./permissions");
    const permCases = [
        ["SAFE", "读文件", permissions.classify("filesystem", "read", { path: "/tmp/a.txt" })],
        ["SAFE", "新文件写", permissions.classify("filesystem", "write", { path: "/tmp/new.txt" })],
        ["CONFIRM", "覆盖写", (() => { const p = "/tmp/godan_perm_ov.txt"; require("fs").writeFileSync(p, "x"); return permissions.classify("filesystem", "write", { path: p }); })()],
        ["CONFIRM", "删除文件", permissions.classify("filesystem", "delete", { path: "/tmp/a.txt" })],
        ["DANGEROUS", "写系统路径", permissions.classify("filesystem", "write", { path: "/etc/hosts" })],
        ["DANGEROUS", "sudo 命令", permissions.classify("shell", "exec", { command: "sudo rm -rf /tmp/x" })],
        ["SAFE", "只读命令", permissions.classify("shell", "exec", { command: "ls -la /tmp" })],
        ["CONFIRM", "关闭应用", permissions.classify("applications", "close", { name: "Safari" })],
        ["SAFE", "打开应用", permissions.classify("applications", "open", { name: "Blender" })]
    ];
    for (const [expect, name, r] of permCases) {
        check(`权限: ${name} → ${expect}`, r.level === expect, `实际 ${r.level}`);
    }

    // ---- watch 生命周期（P3-4，轻量）----
    console.log("\n[4] watch 生命周期");
    const watch = require("./tools/watch");
    const tmpFile = path.join(os.tmpdir(), "godan_bench_watch_" + Date.now() + ".txt");
    let p = watch.actions.waitFile({ path: tmpFile, timeout: 10 }, { taskId: "t_bench", isCancelled: () => false });
    setTimeout(() => fs.writeFileSync(tmpFile, "x"), 1200);
    const rw = await p;
    check("waitFile 触发", rw.success === true && rw.watch.status === "TRIGGERED", `${rw.watch.status}`);
    fs.unlinkSync(tmpFile);
    const rto = await watch.actions.waitFile({ path: "/nonexistent_never_xyz.txt", timeout: 2 }, { taskId: "t_bench", isCancelled: () => false });
    check("waitFile 超时", rto.watch.status === "TIMEOUT", rto.watch.status);
    let cancelled = false;
    p = watch.actions.waitFile({ path: "/nonexistent_abc.txt", timeout: 30 }, { taskId: "t_bench2", isCancelled: () => cancelled });
    setTimeout(() => { cancelled = true; }, 800);
    const rc = await p;
    check("waitFile 取消", rc.watch.status === "CANCELLED", rc.watch.status);
    p = watch.actions.waitFile({ path: "/dup_bench.txt", timeout: 10 }, { taskId: "t_dup", isCancelled: () => false });
    const rd = await watch.actions.waitFile({ path: "/dup_bench.txt", timeout: 10 }, { taskId: "t_dup", isCancelled: () => false });
    check("watch 去重", rd.success === false && /已合并/.test(rd.error || ""), rd.error);
    watch.manager.cancelTaskWatches("t_dup");
}

// ==================== 真实任务层 ====================
async function waitTask(taskId, timeoutMs = TASK_TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await fetch(`${BASE}/api/tasks/${taskId}`);
        const data = await res.json();
        if (!data.success || !data.task) { await sleep(2000); continue; }
        const t = data.task;
        if (t.statusCompat !== "running") return t;
        await sleep(3000);
    }
    return { id: taskId, status: "POLL_TIMEOUT", steps: [] };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTask(name, message, extra = {}) {
    console.log(`  🚀 ${name}: ${message.slice(0, 60)}`);
    const res = await fetch(`${BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...extra })
    });
    const data = await res.json();
    if (!data.success || !data.taskId) return { name, error: data.error || "任务创建失败", skipped: true };
    const t = await waitTask(data.taskId);
    const okSteps = t.steps ? t.steps.filter(s => s.status === "success").length : 0;
    const paramErrors = t.steps ? t.steps.filter(s => s.paramError).length : 0;
    const recoveries = t.steps ? t.steps.filter(s => s.recovery).length : 0;
    const record = {
        name,
        taskId: t.id,
        status: t.status,
        steps: t.steps ? t.steps.length : 0,
        okSteps,
        paramErrors,
        recoveries,
        durationMs: t.finishedAt ? t.finishedAt - t.startedAt : null,
        reply: t.reply ? t.reply.slice(0, 200) : ""
    };
    console.log(`     → ${t.status} | ${record.steps} 步 (${okSteps} 成功) | paramError ${paramErrors} | recovery ${recoveries} | ${Math.round((record.durationMs || 0) / 1000)}s`);
    return record;
}

async function runTasks() {
    console.log("\n🖥️ 真实任务层（经 /api/tasks 全链路）\n");
    // 后端健康检查
    try {
        const health = await fetch(`${BASE}/`);
        if (!health.ok) throw new Error("HTTP " + health.status);
    } catch (e) {
        console.log(`❌ 后端不可达: ${BASE}（请先启动: PORT=${PORT} node backend/server.js）`);
        process.exit(1);
    }

    const results = [];

    // 1. 计算器 AX 任务
    results.push(await runTask("计算器AX", "打开计算器应用，点击数字 7，然后验证显示区出现 7", { maxReplans: 2 }));

    // 2. Blender 打开任务（M2 回归；未安装跳过）
    const blenderApp = fs.existsSync("/Applications/Blender.app");
    if (blenderApp) {
        results.push(await runTask("Blender打开", "打开 Blender 应用，确认它在运行"));
    } else {
        console.log("  ⏭️ Blender 未安装，跳过 Blender 任务");
        results.push({ name: "Blender打开", skipped: true, reason: "Blender 未安装" });
    }

    // 3. watch 文件等待任务（P3-4 回归：脚本自动创建文件触发）
    const watchFile = path.join(os.tmpdir(), "godan_bench_task_" + Date.now() + ".txt");
    const watchPromise = runTask("Watch等待", `用 watch 工具等待文件 ${watchFile} 出现（timeout 30 秒），出现后读取内容并汇报`);
    setTimeout(() => { try { fs.writeFileSync(watchFile, "benchmark trigger"); } catch (e) { /* ignore */ } }, 8000);
    results.push(await watchPromise);
    try { fs.unlinkSync(watchFile); } catch (e) { /* ignore */ }

    // 4. 不存在的应用任务（M2 appNotFound 错误路径）
    results.push(await runTask("不存在应用", "打开一个肯定不存在的应用 GodanNotExistApp987654321 看看会怎样", { maxReplans: 1 }));

    return results;
}

// ==================== 报告 ====================
function printReport(unit, tasks) {
    console.log("\n==================== 基准报告 ====================");
    if (!ONLY_TASKS) {
        console.log(`单元层: ${passCount}/${passCount + failCount} 通过${failCount ? `（${failCount} 失败）` : ""}`);
        if (failures.length) {
            console.log("\n失败明细:");
            for (const f of failures) console.log(`  ❌ ${f.name} — ${f.detail || ""}`);
        }
    } else {
        console.log("单元层: 未运行（--tasks-only）");
    }
    if (tasks && tasks.length) {
        console.log("\n真实任务:");
        for (const t of tasks) {
            if (t.skipped) { console.log(`  ⏭️ ${t.name}: 跳过（${t.reason || t.error || ""}）`); continue; }
            console.log(`  ${t.status === "SUCCESS" ? "✅" : t.status === "FAILED" ? "❌" : "⏳"} ${t.name}: ${t.status} | ${t.steps} 步(${t.okSteps}成功) | paramError ${t.paramErrors} | recovery ${t.recoveries} | ${Math.round((t.durationMs || 0) / 1000)}s`);
            if (t.reply) console.log(`       ↳ ${t.reply.replace(/\n/g, " | ").slice(0, 120)}`);
        }
    }
    console.log("==================================================");

    // 报告落盘
    const report = {
        timestamp: new Date().toISOString(),
        backend: BASE,
        unit: { pass: passCount, fail: failCount, failures },
        tasks: tasks || [],
        summary: {
            unitPass: passCount,
            unitFail: failCount,
            taskSuccess: tasks ? tasks.filter(t => t.status === "SUCCESS").length : 0,
            taskFailed: tasks ? tasks.filter(t => t.status === "FAILED").length : 0,
            taskSkipped: tasks ? tasks.filter(t => t.skipped).length : 0,
            totalParamErrors: tasks ? tasks.reduce((a, t) => a + (t.paramErrors || 0), 0) : 0,
            totalRecoveries: tasks ? tasks.reduce((a, t) => a + (t.recoveries || 0), 0) : 0
        }
    };
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n报告已保存: ${REPORT_FILE}`);
    return report;
}

// ==================== 入口 ====================
(async () => {
    console.log(`🐶 Godan 可靠性基准 (backend: ${BASE})`);
    let tasks = null;
    if (!ONLY_TASKS) {
        await runUnit();
    }
    if (!ONLY_UNIT) {
        tasks = await runTasks();
    }
    const report = printReport(null, tasks);
    // 退出码：单元失败 > 0
    if (failCount > 0) process.exit(1);
    process.exit(0);
})().catch(e => { console.error("❌ 基准异常:", e.message); process.exit(1); });
