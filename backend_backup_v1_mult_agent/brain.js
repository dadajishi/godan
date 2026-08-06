const axios = require("axios");

console.log("🔥 brain.js加载成功");

async function brain(message) {

    try {

        const response = await axios.post(
            "http://localhost:11434/api/chat",
            {
                model: "qwen3:4b",
                messages: [
                    {
                        role: "system",
                        content: `
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
`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                stream: false
            }
        );

        let text = response.data.message.content || "";

        console.log("🧠 Qwen原始输出：");
        console.log(text);

        // 删除 think
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

        // 删除 markdown
        text = text.replace(/```json/gi, "");
        text = text.replace(/```/g, "");

        // 去掉 BOM
        text = text.replace(/^\uFEFF/, "");

        // 去掉空格
        text = text.trim();

        // 如果还有其它废话，只截取第一个JSON
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");

        if (start !== -1 && end !== -1) {
            text = text.substring(start, end + 1);
        }

        console.log("🧹 清理后：");
        console.log(text);

        try {

            const obj = JSON.parse(text);

            console.log("✅ Brain解析成功：");
            console.log(obj);

            return obj;

        } catch (err) {

            console.log("❌ JSON解析失败：");
            console.log(err.message);

            console.log("⚠️ 使用默认plan");

            return {
                tool: "plan",
                task: message
            };

        }

    } catch (err) {

        console.log("❌ Brain错误：", err.message);

        return {
            tool: "plan",
            task: message
        };

    }

}

module.exports = brain;