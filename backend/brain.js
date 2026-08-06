// brain.js — Godan v2 Lite D3: 意图路由（走统一模型抽象层）
const llm = require("./llm");

console.log("🔥 brain.js加载成功");

const BRAIN_SYSTEM_PROMPT = `
你是狗蛋Agent的大脑。

你的职责：
分析用户需求，并选择工具。

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

async function brain(message) {

    try {

        // D3: 统一走模型抽象层（用户配置 > .env），支持任意 OpenAI 兼容端点
        const obj = await llm.chat({
            system: BRAIN_SYSTEM_PROMPT,
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
