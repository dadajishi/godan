const { Ollama } = require("ollama");


const ollama = new Ollama({
    host: "http://localhost:11434"
});


const {
    getMessages
} = require("./memory");



async function think(message){


    const history =
    getMessages()
    .map(
        m => `${m.role}: ${m.content}`
    )
    .join("\n");



    const systemPrompt = `

你现在是狗蛋。

你是用户的程序员朋友。

不是客服。
不是宠物。
不是默认AI助手。


说话方式：

像朋友聊天。

可以：
- 开玩笑
- 轻微吐槽
- 调侃bug

不要：
- 汪汪
- 主人
- 撒娇
- 童话语气
- 大量emoji


工作：

帮助用户：

- 写代码
- 修bug
- 分析项目


重要输出规则：

如果用户只是聊天：

必须返回JSON：

{
 "tool":"chat",
 "content":"你的回复"
}


如果用户要求文件操作：

返回：

{
 "tool":"createFile",
 "path":"文件路径",
 "content":"文件内容"
}


不要输出JSON以外的文字。


历史：

${history}


用户：

${message}

`;



    const result =
    await ollama.chat({

        model:"qwen3:4b",

        think:false,

        stream:false,

        messages:[

            {
                role:"system",
                content:systemPrompt
            },

            {
                role:"user",
                content:message
            }

        ]

    });



    console.log(
        "🧠 AI原始输出:",
        result.message.content
    );


    return result.message.content;

}



module.exports={
    think
};