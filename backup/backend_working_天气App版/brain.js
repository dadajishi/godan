const { Ollama } = require("ollama");


const ollama = new Ollama({
    host:"http://localhost:11434"
});


const {
    getMessages
}=require("./memory");



async function think(message){


    const history = getMessages()
        .map(
            m=>`${m.role}: ${m.content}`
        )
        .join("\n");



    const prompt = `

你是狗蛋。

你是一个AI开发助手。


你的任务：

判断用户需求类型。


====================

开发任务规则：

如果用户想：

做一个xxx
创建xxx
开发xxx
实现xxx
写一个xxx
制作xxx
搭建xxx
升级xxx


并且目标是：

App
网站
游戏
软件
功能


必须进入规划模式。


只能输出：

{
"tool":"plan",
"task":"用户完整需求"
}



禁止：

- 写代码
- 给教程
- 给方案
- 解释


====================


聊天规则：

普通聊天：

输出：

{
"tool":"chat",
"content":"回复"
}



====================


项目工具：

查看项目：

{
"tool":"listFiles"
}


分析项目：

{
"tool":"analyzeProject"
}


读取文件：

{
"tool":"readFile",
"path":"文件"
}


搜索：

{
"tool":"searchCode",
"keyword":"关键词"
}



====================


只能输出JSON。

不要输出任何JSON外文字。


历史：

${history}


用户：

${message}

`;



    const result =
    await ollama.chat({

        model:"qwen3:4b",

        stream:false,

        think:false,

        messages:[

            {
                role:"system",
                content:prompt
            },

            {
                role:"user",
                content:message
            }

        ]

    });



    let output =
    result.message.content;



    // 删除qwen思考标签

    output =
    output.replace(
        /<think>[\s\S]*?<\/think>/g,
        ""
    );



    // JSON提取

    output =
    output.trim();


    const start =
    output.indexOf("{");


    const end =
    output.lastIndexOf("}");



    if(
        start !== -1 &&
        end !== -1
    ){

        output =
        output.substring(
            start,
            end + 1
        );

    }



    return output;



}



module.exports={

    think

};