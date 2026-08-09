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

function buildSystemPrompt(task, toolSpecJson) {
    return `
你是「狗蛋」的电脑操作 Agent，负责在用户的 Mac/PC 上完成真实操作。

【用户目标】
${task}

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

【GUI 视觉闭环规则】（任务涉及点击/输入/窗口操作时强制）
- 窗口级定位优先用系统 API：window.getBounds（应用名）→ 精确窗口位置，比视觉找窗口可靠
- 操作屏幕前：用 screenshot.analyze 看屏幕；有窗口 bounds 时传 {bounds, focus:"目标"} 做区域分析，定位更准
- 每次 mouse/keyboard 操作后：系统会自动执行一次验证截图并展示给你；看到验证结果后立即判断——目标状态已达成就输出 done，不确定最多再验证 1 次，绝不反复分析
- 系统会拦截「相同参数的重复 analyze」（屏幕没变化时）和「超过 10 次的分析」：被拦截后直接执行操作或 done，不要尝试绕过
- 验证不通过（操作没生效/点错了）：重新规划（换坐标/换元素/换方案），最多重新规划 3 次，不要无限重试
- analyze 返回的坐标是屏幕逻辑像素，可直接用于 mouse.click 等
- 纯文件/Shell/进程任务不需要截图，直接操作即可
`;
}

function buildUserPrompt(history) {
    if (!history) return "请开始执行。";
    return `【已执行的步骤】\n${history}\n\n请根据以上结果决定下一步。`;
}

/**
 * 执行电脑操作任务
 * @param {string} task 用户自然语言目标
 * @param {object} opts {onStep?: (step, pendingOps) => void} 每执行一步回调（异步任务增量推送用）
 * @returns {Promise<{success, mode, reply, steps, pendingOps}>}
 */
async function computerAgent(task, opts = {}) {
    console.log("🖥️ ComputerAgent 任务:", task);
    opLog.logSession({ type: "computer_start", task });
    const onStep = typeof opts.onStep === "function" ? opts.onStep : null;

    const toolSpecJson = JSON.stringify(tools.toolSpec(), null, 2);
    const steps = [];
    const pendingOps = [];
    let consecutiveFailures = 0;
    let llmDecisionFails = 0;
    let finished = false;
    let finalSummary = "";

    // 决策审查状态（防无意义重复 analyze + GUI 后验证闭环）
    let lastAnalyzeKey = null;   // 上次 analyze 的参数指纹（同参且屏幕未变 → 拦截）
    let analyzeCount = 0;        // 本任务 analyze 总次数
    let verifyPending = false;   // GUI 操作后允许再验证 1 次
    let lastFocus = "";          // 上次 analyze 的 focus（GUI 自动验证复用）

    for (let stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
        // 历史压缩为行
        const history = steps.map((s, i) =>
            `步骤${i + 1} [${s.tool}.${s.action}] 目的:${s.goal} → ${s.ok ? "✅成功" : (s.needConfirm ? "⏸️待确认" : (s.blocked ? "⛔被拒: " + (s.error || "") : "❌失败: " + (s.error || "")))}`
            + (s.output ? ` | 输出: ${s.output.slice(0, 220)}` : "")
        ).join("\n");

        // LLM 决策下一步
        let decision = null;
        try {
            decision = await llm.chat({
                system: buildSystemPrompt(task, toolSpecJson),
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
                finalSummary = "Agent 决策模块连续异常，任务中止。";
                finished = true;
                break;
            }
            continue;
        }
        llmDecisionFails = 0;

        // done?
        if (decision.done) {
            finalSummary = String(decision.summary || "任务完成");
            finished = true;
            break;
        }

        const toolName = decision.tool;
        const action = decision.action;
        const params = (decision.params && typeof decision.params === "object") ? decision.params : {};
        const goal = String(decision.goal || "");

        if (!toolName || !action) {
            steps.push({ tool: "agent", action: "invalid_decision", params, goal, ok: false, error: "LLM 输出缺少 tool/action", level: "SAFE" });
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
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
            steps.push({ tool: toolName, action, params: truncate(params, 150), goal, level: "SAFE", ok: false, blocked: true, systemBlock: true, error: blockedReason, output: null });
            console.log("🚫 决策拦截:", blockedReason.slice(0, 80));
            // 被拦截不算连续失败（不是执行失败），但反馈给 LLM 下一步
            if (onStep) onStep(steps[steps.length - 1], pendingOps.slice());
            continue;
        }

        // 执行
        const result = await tools.run(toolName, action, params);
        const step = {
            tool: toolName,
            action,
            params: truncate(params, 150),
            goal,
            level: result.level || "SAFE",
            ok: result.success === true,
            needConfirm: !!result.needConfirm,
            blocked: !!result.blocked,
            opId: result.opId || null,
            output: result.success ? String(result.output || "").slice(0, 500) : null,
            error: result.error ? String(result.error).slice(0, 500) : null
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
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                finalSummary = `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败，任务中止。最后错误: ${result.error}`;
                finished = true;
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
                goal: "🖥️ GUI操作后自动验证（系统执行）。请对比验证结果：若目标状态已达成（如显示屏显示了你点击的内容），立即输出 done 结束任务；若不确定最多再验证一次，不要反复分析",
                level: "SAFE", ok: verify.success, needConfirm: false, blocked: false, opId: null,
                output: verify.success ? String(verify.output || "").slice(0, 500) : null,
                error: verify.error ? String(verify.error).slice(0, 500) : null,
                forced: true
            };
            steps.push(verifyStep);
            console.log("🧪 GUI操作后自动验证:", verify.success ? "完成" : "失败");
            if (onStep) onStep(verifyStep, pendingOps.slice());
        }

        // 增量推送（异步任务模式：前端实时看到步骤与待确认项）
        if (onStep) onStep(step, pendingOps.slice());
    }

    if (!finished) {
        finalSummary = `已达到最大步数(${MAX_STEPS})，任务未完全完成。已完成 ${steps.filter(s => s.ok).length} 步成功操作。`;
    }

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
        pendingOps
    };
}

module.exports = computerAgent;
