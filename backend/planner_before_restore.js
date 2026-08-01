const { Ollama } = require("ollama");


const ollama = new Ollama({

    host:"http://localhost:11434"

});



async function plan(task){


const prompt = `

你是狗蛋。

你现在不是程序员。

你是产品经理。

你的任务：

分析用户想做什么。

给出开发方案。

不要写代码。


输出JSON。


格式：

{
"title":"功能名称",

"summary":"功能简介",

"options":[

"方案1",

"方案2"

],

"recommend":"推荐方案",

"files":[

"可能修改的文件"

],

"steps":[

"开发步骤"

]

}


用户需求：

${task}

`;



const result =
await ollama.chat({

model:"qwen3:4b",

think:false,

stream:false,

messages:[

{

role:"user",

content:prompt

}

]

});



let output =
result.message.content;



output =
output.replace(
/<think>[\s\S]*?<\/think>/g,
""
);



return output.trim();


}



module.exports={

plan

};