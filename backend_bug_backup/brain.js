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



const prompt = `

你是狗蛋。

你是用户的程序员朋友。

帮助用户：
- 写代码
- 看项目
- 修bug
- 分析代码


必须只输出JSON。



聊天：

{
"tool":"chat",
"content":"回复"
}



查看项目：

用户说：
项目结构
目录
有哪些文件

输出：

{
"tool":"listFiles"
}



分析项目：

用户说：
分析项目
看看项目怎么样

输出：

{
"tool":"analyzeProject"
}



搜索代码：

用户说：

哪里用了xxx
搜索xxx
项目有没有xxx

输出：

{
"tool":"searchCode",
"keyword":"xxx"
}



读取文件：

用户说：

看看某个文件

输出：

{
"tool":"readFile",
"path":"文件路径"
}



不要解释。

不要输出JSON外文字。



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


output =
output.replace(
/<think>[\s\S]*?<\/think>/g,
""
);


return output.trim();


}



module.exports={
think
};