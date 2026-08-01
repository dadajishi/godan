const fs = require("fs");
const path = require("path");

// ⭐⭐⭐ 改这里
const { Ollama } = require("ollama");

const ollama = new Ollama({
    host: "http://127.0.0.1:11434"
});

async function build(task) {
    console.log("🏗️ Builder任务:", task);

    const prompt = `
你是一个代码生成器。

只输出一个JSON。

格式：

{
  "title":"项目名称",
  "files":[
    {
      "path":"index.html",
      "content":"文件内容"
    }
  ]
}

禁止输出：
- <think>
- Markdown
- \`\`\`
- 解释
- 任何JSON外内容

用户需求：
${task}
`;

    const result = await ollama.chat({
        model: "qwen3:4b",
        messages: [
            {
                role: "user",
                content: prompt
            }
        ]
    });

    let output = result.message.content.trim();

    // 去掉 think
    output = output.replace(/<think>[\s\S]*?<\/think>/g, "");

    // 去掉 markdown
    output = output.replace(/```json/g, "");
    output = output.replace(/```/g, "");

    output = output.trim();

    console.log("🏗️ Builder输出:", output);

    return output;
}

module.exports = {
    build
};