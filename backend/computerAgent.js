// computerAgent.js — 电脑操作 Agent（计划-执行-观察-验证循环）
// 循环模型（ReAct 风格）:
//   LLM 决策 {tool, action, params, goal} → 工具执行 → 观察结果 → 再决策 → ... → {done, summary}
// 安全:
//   - 工具执行统一走 tools.run（权限系统强制）
//   - needConfirm 操作进待确认队列（不中断循环，任务末尾汇总）
//   - blocked 操作记录后跳过（不重试）
//   - 连续失败 ≥2 步 或 步数上限 → 停止
const llm = require("./llm");
const tools = require("./tools");
const opLog = require("./opLog");
const workingMemory = require("./workingMemory");
const replanner = require("./replanner"); // P3-3: 失败自修复 + Replanner

const MAX_STEPS = 15;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_ANALYZE = 10; // 每任务 screenshot.analyze 上限（防无限看屏幕）

function truncate(obj, maxLen = 300) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return obj.length > maxLen ? obj.slice(0, maxLen) + "…" : obj;
    if (Array.isArray(obj)) return obj.slice(0, 10).map(x => truncate(x, maxLen));
    if (typeof obj === "object") {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = truncate(v, maxLen);
        return out;
    }
    return obj;
}

function buildSystemPrompt(task, toolSpecJson, wmText) {
    return `
你是「狗蛋」的电脑操作 Agent，负责在用户的 Mac/PC 上完成真实操作。

【用户目标】
${task}

${wmText ? `【当前任务工作记忆】（Agent 已确认的状态，直接使用，不要重复探测；若与实际不符再以实际为准）\n${wmText}\n` : ""}

【可用工具】（JSON 格式说明）
${toolSpecJson}

【决策输出格式】每一步输出一个 JSON（只输出 JSON，无其他文字）：

1) 调用工具:
{"tool":"工具名","action":"动作名","params":{...},"goal":"这步的目的，一句话"}

2) 任务完成:
{"done":true,"summary":"给用户的中文总结（做了什么、结果如何、下一步建议）"}

【格式示例】
{"tool":"filesystem","action":"list","params":{"path":"/Users/用户名/Desktop"},"goal":"查看桌面文件"}
{"tool":"applications","action":"open","params":{"name":"Blender"},"goal":"启动Blender"}
{"tool":"shell","action":"exec","params":{"command":"df -h","cwd":"/Users/用户名/Godan"},"goal":"查看磁盘空间"}
{"done":true,"summary":"已完成，桌面有3个文件夹…"}

【重要】
- tool 字段必须是工具名（filesystem / shell / applications / process），action 字段必须是该工具的动作名（list / exec / open…），两者分开，不要写成 "filesystem.list" 这种格式
- 示例中的路径只是格式示意，必须替换为机器上的真实路径。不确定用户主目录/桌面路径时，先用 shell.exec 执行 whoami 和 echo $HOME 探测，禁止使用 /Users/me 这类假路径

【执行规则】
1. 一次只调用一个工具，看完结果再决定下一步
2. 优先用最直接的路径完成任务；先探索（list/status/analyze）再动手
3. 工具结果里的 output 可能是 JSON 或文本，仔细阅读
4. 遇到 needConfirm=true：该操作已进入「待确认队列」，不要重复调用，继续其他可做的步骤或直接 done（最后会汇总给用户确认）
5. 遇到 blocked=true：该操作被安全策略拒绝，不要重试，换一种 SAFE 的方式或放弃该步骤
6. 遇到 error：分析原因后重试（换参数/换工具），但同一操作最多尝试 2 次
7. 删除/覆盖/停止进程等破坏性操作，工具会自动要求确认，你不需要在 params 里做任何特殊处理
8. 所有 params 必须用绝对路径（~ 可展开）
9. 最后必须 done 并给出中文总结

【GUI 操作规则】（任务涉及点击/输入/窗口操作时使用）
- 定位优先用 Accessibility（快/准/零门槛）：
  1. ui.getTree(app) 拿控件树（按钮带行列号 row/col）
  2. ui.findElement(app, label/keyword/role) 拿控件精确坐标
  3. window.getBounds(app) 拿窗口位置
- 验证用 ui.readValue(app)：读显示屏/输入框当前值，毫秒级；或 ui.getTree 对比控件状态
- 每次 mouse/keyboard 操作后必须验证是否生效；验证不通过 → 重新规划（换控件/换方案），最多 3 次
- ui 工具返回的坐标是屏幕逻辑像素，可直接用于 mouse.click / keyboard
- 只有 Accessibility 无法覆盖的场景（自绘界面/游戏）才用 screenshot.analyze（视觉模型默认未启用，被拦截就换 ui 方案）
- 纯文件/Shell/进程任务不需要 GUI，直接操作即可
`;
}

function buildUserPrompt(history) {
    if (!history) return "请开始执行。";
    return `【已执行的步骤】\n${history}\n\n请根据以上结果决定下一步。`;
}

/**
 * 执行电脑操作任务
 * @param {string} task 用户自然语言目标
 * @param {object} opts {
 *   onStep?: (step, pendingOps) => void     每执行一步回调（异步任务增量推送用）
 *   onStatus?: (status) => void            状态汇报（RUNNING/VERIFYING/WAITING/RETRYING/SUCCESS/FAILED/CANCELLED）
 *   onLog?: (level, message) => void       任务日志
 *   isCancelled?: () => boolean            取消检查（每 step 边界）
 * }
 * @returns {Promise<{success, mode, reply, steps, pendingOps, cancelled?}>}
 */
async function computerAgent(task, opts = {}) {
    console.log("🖥️ ComputerAgent 任务:", task);
    opLog.logSession({ type: "computer_start", task });
    const onStep = typeof opts.onStep === "function" ? opts.onStep : null;
    const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : null;
    const onLog = typeof opts.onLog === "function" ? opts.onLog : null;
    const isCancelled = typeof opts.isCancelled === "function" ? opts.isCancelled : () => false;

    const toolSpecJson = JSON.stringify(tools.toolSpec(), null, 2);
    const steps = [];
    const pendingOps = [];
    let consecutiveFailures = 0;
    let llmDecisionFails = 0;
    let finished = false;
    let cancelled = false;
    let finalState = "SUCCESS"; // SUCCESS | FAILED | CANCELLED
    let finalSummary = "";
    // P3-3: 重规划配额（任务级可配置）
    const maxReplans = (typeof opts.maxReplans === "number" && opts.maxReplans >= 0)
        ? opts.maxReplans
        : replanner.DEFAULT_MAX_REPLANS;
    let replanCount = 0;

    // 工作记忆读取助手（P3-2 挂载在任务记录上）
    const getWm = () => (typeof opts.getWorkingMemory === "function") ? opts.getWorkingMemory() : null;

    // 启动即 RUNNING
    if (onStatus) onStatus("RUNNING");

    // 决策审查状态（防无意义重复 analyze + GUI 后验证闭环）
    let lastAnalyzeKey = null;   // 上次 analyze 的参数指纹（同参且屏幕未变 → 拦截）
    let analyzeCount = 0;        // 本任务 analyze 总次数
    let verifyPending = false;   // GUI 操作后允许再验证 1 次
    let lastFocus = "";          // 上次 analyze 的 focus（GUI 自动验证复用）

    for (let stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
        // ===== 取消检查（每 step 边界）=====
        if (isCancelled()) {
            cancelled = true;
            finalState = "CANCELLED";
            finalSummary = "任务已取消。";
            finished = true;
            if (onLog) onLog("warn", "⏹️ Agent 收到取消信号，停止执行");
            break;
        }

        // 历史压缩为行
        const history = steps.map((s, i) =>
            `步骤${i + 1} [${s.tool}.${s.action}] 目的:${s.goal} → ${s.ok ? "✅成功" : (s.needConfirm ? "⏸️待确认" : (s.blocked ? "⛔被拒: " + (s.error || "") : "❌失败: " + (s.error || "")))}`
            + (s.output ? ` | 输出: ${s.output.slice(0, 220)}` : "")
        ).join("\n");

        // LLM 决策下一步（P3-2: 注入工作记忆摘要，每步实时更新）
        let decision = null;
        try {
            const wmObj = getWm();
            const wmText = wmObj ? workingMemory.summarize(wmObj) : "";
            decision = await llm.chat({
                system: buildSystemPrompt(task, toolSpecJson, wmText),
                user: buildUserPrompt(history || null),
                temperature: 0.2,
                maxTokens: 700,
                json: true,
                retries: 1
            });
        } catch (e) {
            console.log("⚠️ ComputerAgent LLM 决策失败:", e.message);
        }

        if (!decision || typeof decision !== "object") {
            llmDecisionFails++;
            if (llmDecisionFails >= 2) {
                finalState = "FAILED";
                finalSummary = "Agent 决策模块连续异常，任务中止。";
                finished = true;
                if (onLog) onLog("error", "Agent 决策模块连续异常，任务中止");
                break;
            }
            continue;
        }
        llmDecisionFails = 0;

        // done?
        if (decision.done) {
            finalState = "SUCCESS";
            finalSummary = String(decision.summary || "任务完成");
            finished = true;
            break;
        }

        const toolName = decision.tool;
        const action = decision.action;
        const params = (decision.params && typeof decision.params === "object") ? decision.params : {};
        const goal = String(decision.goal || "");

        if (!toolName || !action) {
            steps.push({ tool: "agent", action: "invalid_decision", params, goal, ok: false, error: "LLM 输出缺少 tool/action", level: "SAFE", startTime: Date.now(), endTime: Date.now() });
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                finalState = "FAILED";
                finalSummary = "Agent 决策异常（缺少工具/动作），任务中止。";
                finished = true;
                break;
            }
            continue;
        }

        // ===================== 决策审查（防重复 analyze / 限频） =====================
        let blockedReason = null;
        if (toolName === "screenshot" && action === "analyze") {
            const key = JSON.stringify(params || {});
            analyzeCount++;
            if (analyzeCount > MAX_ANALYZE) {
                blockedReason = `⚠️ 系统限制：本任务已分析屏幕 ${MAX_ANALYZE} 次（上限）。请立即执行目标操作（mouse/keyboard）或输出 done 结束任务，禁止再调用 analyze。`;
            } else if (verifyPending) {
                // GUI 操作后的验证窗口：放行这一次，之后不再放行
                verifyPending = false;
            } else if (key === lastAnalyzeKey) {
                blockedReason = "⚠️ 系统拦截：你刚用相同参数分析过屏幕，且期间没有任何操作执行，屏幕没有变化。重复分析无意义。请直接执行目标操作（mouse/keyboard），或若目标已达成请输出 done 结束任务。";
            }
            lastAnalyzeKey = key;
            if (params.focus) lastFocus = String(params.focus);
        }
        if (blockedReason) {
            steps.push({ tool: toolName, action, params: truncate(params, 150), goal, level: "SAFE", ok: false, blocked: true, systemBlock: true, error: blockedReason, output: null, startTime: Date.now(), endTime: Date.now() });
            console.log("🚫 决策拦截:", blockedReason.slice(0, 80));
            // 被拦截不算连续失败（不是执行失败），但反馈给 LLM 下一步
            if (onStep) onStep(steps[steps.length - 1], pendingOps.slice());
            continue;
        }

        // 执行
        const stepStart = Date.now();
        const result = await tools.run(toolName, action, params);
        const step = {
            tool: toolName,
            action,
            params: truncate(params, 150),
            input: truncate(params, 150),
            goal,
            level: result.level || "SAFE",
            ok: result.success === true,
            needConfirm: !!result.needConfirm,
            blocked: !!result.blocked,
            opId: result.opId || null,
            output: result.success ? String(result.output || "").slice(0, 500) : null,
            error: result.error ? String(result.error).slice(0, 500) : null,
            startTime: stepStart,
            endTime: Date.now(),
            retryCount: 0
        };
        steps.push(step);
        console.log(`🖥️ 步骤${stepIndex + 1}: ${toolName}.${action} →`, step.ok ? "成功" : (step.needConfirm ? "待确认" : (step.blocked ? "被拒" : "失败")));

        if (result.needConfirm && result.opId) {
            pendingOps.push({ opId: result.opId, tool: toolName, action, reason: result.error || "需要确认", params: truncate(params, 120) });
            consecutiveFailures = 0; // 待确认不算失败
        } else if (result.success) {
            consecutiveFailures = 0;
        } else {
            consecutiveFailures++;
            // ===================== P3-3: 失败自修复 + Replanner =====================
            // 错误分析 → 根因分类 → 恢复计划 → 执行恢复 → 验证 → 继续原任务
            if (replanCount < maxReplans) {
                replanCount++;
                if (onStatus) onStatus("RETRYING");
                let analysis = null;
                try {
                    analysis = await replanner.analyzeAndRecover({
                        tool: toolName,
                        action,
                        params,
                        error: result.error,
                        wm: getWm()
                    });
                } catch (e) {
                    console.log("⚠️ Replanner 异常:", e.message);
                }
                if (onStatus) onStatus("RUNNING");

                if (analysis) {
                    // 1. 记录分析（failureType/rootCause/confidence 必须落日志）
                    const logMsg = `🔧 失败分析[${replanCount}/${maxReplans}] ${analysis.failureType} (置信度${Math.round(analysis.confidence * 100)}%): ${analysis.rootCause}`;
                    if (onLog) onLog("info", logMsg);
                    console.log(logMsg);

                    // 2. 推送 recovery 步骤（结构化，标记 recovery/recoveryOf/analysis）
                    analysis.recoverySteps.forEach((rs, i) => {
                        const recoveryStep = {
                            tool: rs.tool,
                            action: rs.action,
                            params: truncate(rs.params, 150),
                            input: truncate(rs.params, 150),
                            goal: rs.goal || `🔧 恢复步骤 ${i + 1}（针对 ${toolName}.${action}）`,
                            level: (rs.result && rs.result.level) || "SAFE",
                            ok: !!(rs.result && rs.result.success === true),
                            needConfirm: !!(rs.result && rs.result.needConfirm),
                            blocked: !!(rs.result && rs.result.blocked),
                            opId: (rs.result && rs.result.opId) || null,
                            output: (rs.result && rs.result.success) ? String(rs.result.output || "").slice(0, 500) : null,
                            error: (rs.result && rs.result.error) ? String(rs.result.error).slice(0, 500) : null,
                            recovery: true,
                            recoveryOf: `agent#${stepIndex + 1}`, // 指向原失败步骤（taskManager 记录中原步骤无 stepId，用序号标识）
                            retryCount: replanCount,
                            // 完整分析记录（failureType/rootCause/confidence/recoveryPlan/recoveryResult）随 checkpoint 落盘
                            analysis: i === 0 ? {
                                failureType: analysis.failureType,
                                rootCause: analysis.rootCause,
                                confidence: analysis.confidence,
                                recoveryPlan: analysis.recoveryPlan,
                                recoveryResult: analysis.recoveryResult
                            } : undefined,
                            startTime: Date.now(),
                            endTime: Date.now()
                        };
                        steps.push(recoveryStep);
                        if (onStep) onStep(recoveryStep, pendingOps.slice());
                    });

                    // 3. 记录 recoveryResult 并判断
                    const resultLog = `   ↳ 恢复结果: ${analysis.recovered ? "✅ 成功" : "⛔ 未解决"} — ${(analysis.recoveryResult && analysis.recoveryResult.detail) || analysis.notes || ""}`;
                    if (onLog) onLog(analysis.recovered ? "info" : "warn", resultLog);
                    console.log(resultLog);

                    if (analysis.recovered) {
                        // 问题已由系统解决：不惩罚，Agent 以新环境继续原任务
                        consecutiveFailures = 0;
                        continue;
                    }
                    // 未恢复：consecutiveFailures 已 +1，交给下方上限判断；分析已注入日志供 Agent 参考
                }
            }
            // ===================== 最终防线：连续失败上限 =====================
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                finalState = "FAILED";
                finalSummary = `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败（含 ${replanCount} 次自动恢复尝试），任务中止。最后错误: ${result.error}`;
                finished = true;
                if (onLog) onLog("error", `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败: ${result.error}`);
                break;
            }
        }

        // ===== GUI 操作成功后自动验证（一次，系统执行，不走 LLM 决策）=====
        const isGuiAction = (toolName === "mouse" || toolName === "keyboard") && result.success === true;
        if (isGuiAction) {
            const verifyParams = lastFocus ? { focus: lastFocus } : {};
            const verify = await tools.run("screenshot", "analyze", verifyParams);
            analyzeCount++;
            lastAnalyzeKey = JSON.stringify(verifyParams);
            verifyPending = true; // 允许 LLM 再验证 1 次（决策审查中放行后置 false）
            const verifyStep = {
                tool: "screenshot", action: "analyze",
                params: verifyParams,
                input: verifyParams,
                goal: "🖥️ GUI操作后自动验证（系统执行）。请对比验证结果：若目标状态已达成（如显示屏显示了你点击的内容），立即输出 done 结束任务；若不确定最多再验证一次，不要反复分析",
                level: "SAFE", ok: verify.success, needConfirm: false, blocked: false, opId: null,
                output: verify.success ? String(verify.output || "").slice(0, 500) : null,
                error: verify.error ? String(verify.error).slice(0, 500) : null,
                forced: true,
                startTime: Date.now(),
                endTime: Date.now(),
                retryCount: 0
            };
            steps.push(verifyStep);
            console.log("🧪 GUI操作后自动验证:", verify.success ? "完成" : "失败");
            if (onStep) onStep(verifyStep, pendingOps.slice());
        }

        // 增量推送（异步任务模式：前端实时看到步骤与待确认项）
        if (onStep) onStep(step, pendingOps.slice());
    }

    if (!finished) {
        finalState = "FAILED";
        finalSummary = `已达到最大步数(${MAX_STEPS})，任务未完全完成。已完成 ${steps.filter(s => s.ok).length} 步成功操作。`;
        if (onLog) onLog("warn", `达到最大步数(${MAX_STEPS})，任务未完全完成`);
    }

    // 终态汇报（任务状态机消费: SUCCESS / FAILED / CANCELLED）
    if (onStatus) onStatus(finalState);

    // 汇总回复
    let reply = finalSummary;
    if (steps.length > 0) {
        const okCount = steps.filter(s => s.ok).length;
        const confirmCount = pendingOps.length;
        reply += `\n\n🛠️ 执行了 ${steps.length} 步（${okCount} 步成功）:`;
        steps.forEach((s, i) => {
            const mark = s.ok ? "✅" : s.needConfirm ? "⏸️" : s.blocked ? "⛔" : "❌";
            reply += `\n${i + 1}. ${mark} ${s.tool}.${s.action}${s.goal ? "（" + s.goal + "）" : ""}`;
            if (!s.ok && s.error) reply += ` — ${s.error}`;
        });
        if (confirmCount > 0) {
            reply += `\n\n⚠️ ${confirmCount} 个操作等待你的确认（删除/覆盖/停止类），批准后我会执行。`;
        }
    }

    opLog.logSession({ type: "computer_end", task, summary: finalSummary });
    console.log("🖥️ ComputerAgent 完成:", finalSummary.slice(0, 200));

    return {
        success: steps.some(s => s.ok) || finished,
        mode: "computer",
        reply,
        steps,
        pendingOps,
        cancelled
    };
}

module.exports = computerAgent;
