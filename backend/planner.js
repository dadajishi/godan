// planner.js — Godan P1-4: 任务规划（LLM 生成具体步骤 + 规则降级）
// 策略: 闲聊/问候走规则（省 token 秒回）；构建任务用 LLM 生成具体计划；失败降级默认计划
const llm = require("./llm");

console.log("🧠 Planner模块加载");

// 闲聊识别（规则，秒回不调 LLM）
function isChatMessage(t) {
    return t.includes("你好") || t.includes("打招呼") || t.includes("聊天")
        || t.includes("hello") || t.includes("hi") || t.includes("谢谢")
        || t.includes("你是谁") || t.includes("你能做什么") || t.includes("介绍一下");
}

function chatReply(t) {
    if (t.includes("谢谢")) return "不客气！有需要随时叫我。";
    if (t.includes("你是谁")) return "我是狗蛋 Agent 🐶，一个 AI 应用工坊——可以帮你创建、修改、测试网页应用。";
    if (t.includes("你能做什么")) return "我能做的事情：\n1. 创建应用：「做一个番茄钟网页」\n2. 修改应用：「把计算器改成深色主题」\n3. 自动测试与修复生成的应用";
    return "你好！我是狗蛋 Agent，可以帮你规划任务、生成网页项目并执行创建。";
}

// 默认计划（降级兜底）
function defaultPlan(task) {
    return {
        title: task,
        type: "build",
        task: task,
        plan: ["分析需求", "设计结构", "生成代码", "测试"]
    };
}

// LLM 生成具体计划
async function llmPlan(task, architecture) {
    const prompt = `
你是一个项目规划师。为下面的开发任务制定具体执行计划。

任务: ${task}

技术架构: ${JSON.stringify(architecture || {}, null, 2)}

输出 JSON（只输出 JSON）:
{
  "title": "项目名（简短，8字以内）",
  "type": "build",
  "plan": ["步骤1", "步骤2", ...]  (4-8 个具体、可执行的步骤)
}

要求:
1. 步骤要具体（如「生成HTML页面结构」「实现倒计时逻辑」「添加样式美化」），不要泛泛而谈
2. 3-5 个步骤即可
`;

    const result = await llm.chat({
        system: "你是项目规划师，只输出 JSON。",
        user: prompt,
        temperature: 0.3,
        maxTokens: 800,
        json: true,
        retries: 1
    });

    if (!result || !result.title || !Array.isArray(result.plan) || result.plan.length === 0) {
        throw new Error("LLM 计划生成失败");
    }

    return {
        title: result.title,
        type: "build",
        task: task,
        plan: result.plan.slice(0, 8)
    };
}

async function planner(task, architecture) {
    console.log("🧠 Planner:", task);

    const t = task.toLowerCase();

    // 闲聊直接规则回复（省 token、秒回）
    if (isChatMessage(t)) {
        const result = {
            title: "聊天",
            type: "chat",
            task: task,
            reply: chatReply(t),
            plan: ["直接回复"]
        };
        console.log("🧠 Planner结果(规则):", result);
        return result;
    }

    // 构建任务: 优先 LLM 计划，失败降级
    try {
        const result = await llmPlan(task, architecture);
        console.log("🧠 Planner结果(LLM):", result);
        return result;
    } catch (e) {
        console.log("⚠️ LLM计划失败，降级默认:", e.message);
        const result = defaultPlan(task);
        console.log("🧠 Planner结果(默认):", result);
        return result;
    }
}

module.exports = planner;
