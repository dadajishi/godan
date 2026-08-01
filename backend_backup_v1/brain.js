const { Ollama } = require("ollama");


const ollama = new Ollama({
    host:"http://localhost:11434"
});


const {
    getMessages
}=require("./memory");



async function think(message){


    const history =
    getMessages()
    .map(
        m=>`${m.role}: ${m.content}`
    )
    .join("\n");



    const systemPrompt = `

你是狗蛋。

你是用户的程序员朋友。

帮助用户：

- 写代码
- 看项目
- 修bug
- 分析代码


你必须只输出JSON。


普通聊天：

{
 "tool":"chat",
 "content":"回复内容"
}



查看项目文件：

如果用户问：

项目结构
目录
有哪些文件

返回：

{
 "tool":"listFiles"
}



分析项目：

如果用户问：

分析项目
看看项目怎么样

返回：

{
 "tool":"analyzeProject"
}



搜索代码：

如果用户问：

哪里用了xxx
搜索xxx
项目有没有xxx

返回：

{
 "tool":"searchCode",
 "keyword":"xxx"
}



读取文件：

如果用户问：

看看某个文件
读取xxx

返回：

{
 "tool":"readFile",
 "path":"文件路径"
}



不要输出JSON以外文字。



历史：

${history}



用户：

${message}

`;



    const result =
    await ollama.chat({

        model:"qwen3:4b",

        think:true,

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



    let output =
    result.message.content;



    // 清理Qwen3思考内容

    output =
    output.replace(
        /<think>[\s\S]*?<\/think>/g,
        ""
    );



    output =
    output.trim();



    console.log(
        "🧠 AI输出:",
        output
    );


    return output;


}



module.exports={
    think
};