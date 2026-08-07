// brain.js — Godan 意图路由（统一模型抽象层 + 长期记忆注入）
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
你是狗蛋Agent的大脑。

你的职责：
分析用户需求，并选择工具。

${memoryBlock}
你只能输出JSON。

格式：

{
  "tool":"plan",
  "task":"用户任务"
}

禁止解释。
禁止Markdown。
禁止<think>。
禁止任何多余文字。
`;
}

// 规则提取长期记忆（零成本，不调 LLM）
// 模式: 我喜欢/偏好/以后都/记得/记住/不要/请用/希望
const MEMORY_PATTERNS = [
    { re: /我喜欢(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /我偏好(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /以后(?:都|就|尽量)?(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /记住[，,]?(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /(?:记得|记住)我喜欢(.+?)(?:[。，,.!！?？]|$)/, category: "preference" },
    { re: /不要(?:再)?(.+?)(?:[。，,.!！?？]|$)/, category: "avoid" },
    { re: /请(?:一直|始终)(.+?)(?:[。，,.!！?？]|$)/, category: "preference" }
];

// 从用户消息提取长期记忆（返回提取到的条数）
function learnFromMessage(message) {
    if (!message || typeof message !== "string") return 0;
    let learned = 0;
    for (const { re, category } of MEMORY_PATTERNS) {
        const m = message.match(re);
        if (m && m[1] && m[1].trim().length >= 2) {
            const content = m[1].trim();
            // 过滤明显是任务描述而非偏好的内容
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

async function brain(message) {
    try {
        // 自动学习: 从消息提取偏好记忆（规则，零成本）
        learnFromMessage(message);

        const obj = await llm.chat({
            system: buildSystemPrompt(),
            user: message,
            temperature: 0.3,
            maxTokens: 2000,
            json: true
        });

        if (obj && obj.tool && obj.task) {
            console.log("✅ Brain解析成功：");
            console.log(obj);
            return obj;
        }

        console.log("❌ Brain返回结构异常，使用默认plan");
        return {
            tool: "plan",
            task: message
        };

    } catch (err) {
        console.log("❌ Brain错误：", err.message);
        return {
            tool: "plan",
            task: message
        };
    }
}

module.exports = brain;
