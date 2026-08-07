// brain.js — Godan 意图路由（统一模型抽象层 + 长期记忆注入 + chat/plan 双出口）
const llm = require("./llm");
const Memory = require("./memory/memory");

console.log("🔥 brain.js加载成功");

// 构建注入记忆的 system prompt
function buildSystemPrompt() {
    const memories = Memory.memoriesContext(10);
    const memoryBlock = memories
        ? `\n\n【用户长期记忆】（聊天时参考这些偏好）\n${memories}\n`
        : "";
    return `
你是狗蛋Agent的大脑，负责判断用户意图。

你的职责：
分析用户消息，判断是要"聊天"还是"创建/修改应用"。

${memoryBlock}
你只能输出JSON，格式：

{
  "tool": "chat 或 plan",
  "task": "用户原话或规范化后的任务"
}

判断标准（严格）：
- tool="chat": 一切非"建应用"的消息。包括：问候、闲聊、提问、求建议、探讨思路、讨论方案、帮忙看代码、讲笑话、抱怨等。只要用户没有明确要求"做出一个应用/网页/程序"，就都是 chat。
- tool="plan": 仅当用户明确要创建或修改应用/网页/程序，且包含动作词（做一个、生成、帮我建、写个、改成、加个功能、优化、升级）并指明对象（如"番茄钟""计算器""网页"）。

关键规则：
1. "探讨思路""你觉得怎么样""怎么实现""帮我想想" → chat（不是 plan！）
2. "帮我看看这段代码有什么问题" → chat
3. "做一个番茄钟网页" → plan
4. "把计算器改成深色" → plan
5. 不确定时，倾向 chat（宁可聊天也不误建应用）

禁止解释。
禁止Markdown。
禁止<think>。
禁止任何多余文字。
`;
}

// 规则提取长期记忆（零成本，不调 LLM）
const MEMORY_PATTERNS = [
    { re: /我喜欢(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /我偏好(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /以后(?:都|就|尽量)?(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /记住[，,]?(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /(?:记得|记住)我喜欢(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /不要(?:再)?(.+?)(?:[。，,.!！?？]|$)/, category: "avoid" },
    { re: /请(?:一直|始终)(.+?)(?:[。，,.!！?？]|$)/, category: "preference" }
];

function learnFromMessage(message) {
    if (!message || typeof message !== "string") return 0;
    let learned = 0;
    for (const { re, category } of MEMORY_PATTERNS) {
        const m = message.match(re);
        if (m && m[1] && m[1].trim().length >= 2) {
            const content = m[1].trim();
            if (content.length > 40) continue;
            const r = Memory.addMemory({ content, source: "user", category });
            if (r.ok) {
                console.log("🧠 学到长期记忆:", content, `(${category})`);
                learned++;
            }
        }
    }
    return learned;
}

// 规则兜底：明确的建应用动作词（LLM 失败/超时时用）
const PLAN_KEYWORDS = ["做一个", "做一", "做个", "生成", "帮我建", "写个", "帮我做", "开发", "创建", "建个", "做出来", "写一个"];
const CHAT_KEYWORDS = ["你好", "谢谢", "哈哈", "笑", "聊天", "再见", "晚安", "早安", "怎么", "为什么", "能不能", "帮我看", "看看", "思路", "想法", "建议", "你觉得", "你觉不觉得", "吐槽"];

function ruleFallback(task) {
    // 先看强 chat 词
    if (CHAT_KEYWORDS.some(k => task.includes(k))) return { tool: "chat", task };
    // 再看强 plan 词
    if (PLAN_KEYWORDS.some(k => task.includes(k))) return { tool: "plan", task };
    // 默认 chat（宁可聊天不误建）
    return { tool: "chat", task };
}

async function brain(message) {
    try {
        learnFromMessage(message);

        const obj = await llm.chat({
            system: buildSystemPrompt(),
            user: message,
            temperature: 0.2,
            maxTokens: 500,
            json: true
        });

        if (obj && (obj.tool === "chat" || obj.tool === "plan") && obj.task) {
            console.log("✅ Brain解析成功:", obj.tool, "|", String(obj.task).slice(0, 60));
            return obj;
        }

        console.log("❌ Brain返回结构异常，使用规则兜底");
        return ruleFallback(message);

    } catch (err) {
        console.log("❌ Brain错误：", err.message, "，使用规则兜底");
        return ruleFallback(message);
    }
}

module.exports = brain;
