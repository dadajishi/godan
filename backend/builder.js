console.log("🏗️ Builder模块加载");

const axios = require("axios");


async function Builder({
    task,
    architecture,
    plan,
    mode = "create",
    existingProject = null,
    files = []
}) {


    console.log("🏗️ Builder task:", {
        task,
        mode,
        architecture,
        plan
    });



    try {


        if(!task){
            throw new Error("缺少task");
        }


        if(!architecture){
            throw new Error("缺少architecture");
        }



        const apiKey =
            process.env.DEEPSEEK_API_KEY;



        if(!apiKey){

            throw new Error(
                "缺少 DEEPSEEK_API_KEY"
            );

        }



        let updateContext = "";



        if(mode === "update"){


            console.log(
                "🔄 Builder进入更新模式"
            );


            updateContext = `

当前模式:
UPDATE（修改已有项目）


已有项目:

${JSON.stringify(
existingProject,
null,
2
)}


已有文件:

${JSON.stringify(
files.map(f=>({
    path:f.path,
    content:f.content.slice(0,2000)
})),
null,
2
)}


更新规则:

1. 必须基于已有项目修改
2. 保留原有功能
3. 只增加或修改用户要求部分
4. 不允许创建新的项目主题
5. 必须返回完整files数组
6. 返回的files必须包含修改后的完整代码


`;

        }





        const prompt = `

你是一个专业的软件工程师。


你的任务是根据用户需求开发软件。


最高优先级规则：

必须完全服从用户任务。


禁止：

- 修改用户需求
- 替换项目类型
- 创造新的需求
- 使用历史任务
- 把一个项目变成另一个项目


当前项目:

${architecture.project}



用户需求:

${task}



项目架构:

${JSON.stringify(
architecture,
null,
2
)}



开发计划:

${JSON.stringify(
plan,
null,
2
)}


${updateContext}



开发要求:

1. 输出完整可运行项目文件
2. 只能输出JSON
3. 必须包含:

title

files


files格式:

{
"path":"文件路径",
"content":"完整代码"
}



如果是HTML/CSS/JavaScript项目:

直接生成完整文件。


如果需要API:

必须加入Mock数据备用模式。


禁止输出解释文字。


禁止Markdown。


最终格式:

{
"title":"项目名称",
"files":[
{
"path":"index.html",
"content":"完整HTML"
},
{
"path":"style.css",
"content":"完整CSS"
},
{
"path":"script.js",
"content":"完整JS"
}
]
}



`;



        console.log(
            "🔥 发送DeepSeek..."
        );



        const response =
        await axios.post(

            "https://api.deepseek.com/chat/completions",

            {

                model:"deepseek-chat",

                messages:[

                    {
                        role:"system",
                        content:
                        "你是严格的软件工程Agent，只执行用户需求，不允许改变任务。"
                    },


                    {
                        role:"user",
                        content:prompt
                    }

                ],


                temperature:0.2

            },


            {

                headers:{

                    Authorization:
                    `Bearer ${apiKey}`,

                    "Content-Type":
                    "application/json"

                },


                timeout:120000

            }

        );



        let content =
        response.data
        .choices[0]
        .message
        .content;



        console.log(
            "🧠 DeepSeek原始:",
            content.slice(0,300)
        );



        content =
        content
        .replace(/```json/g,"")
        .replace(/```/g,"")
        .trim();



        const result =
        JSON.parse(content);



        if(!result.files){

            throw new Error(
                "DeepSeek没有返回files"
            );

        }



        console.log(
            "✅ Builder生成成功:",
            result.title
        );



        return result;



    }catch(error){


        console.log(
            "❌ Builder错误:",
            error.message
        );


        return {

            error:"builder failed"

        };

    }


}



module.exports = Builder;