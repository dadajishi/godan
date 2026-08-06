console.log("🏗️ Builder模块加载");

const axios = require("axios");


async function Builder({

    task,
    architecture,
    plan,
    filePlan,
    mode="create",
    existingProject=null,
    files=[]

}){


    console.log(
        "🏗️ Builder task:",
        {
            task,
            mode
        }
    );


    try{


        const apiKey =
        process.env.DEEPSEEK_API_KEY;



        if(!apiKey){

            throw new Error(
                "缺少 DEEPSEEK_API_KEY"
            );

        }



        let context="";



        if(mode==="modify"){


            context=`

当前任务:
修改已有项目


已有项目:

${JSON.stringify(
existingProject,
null,
2
)}


已有文件:

${JSON.stringify(
files,
null,
2
)}


规则:

1. 保留原功能
2. 只修改需求部分
3. 返回完整文件

`;

        }





        const prompt=`

你是 Godan AI 软件工程师。


任务:

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


${context}



只输出JSON。


禁止:

Markdown

解释文字

代码围栏



格式:

{
"title":"",
"files":[
{
"path":"",
"content":""
}
]
}


必须返回完整files。
如果用户需求包含:

桌面
桌面应用
桌面软件
Electron
Mac应用
Windows软件
App客户端

那么:

type必须返回:

desktop_app

stack必须包含:

Electron
HTML
CSS
JavaScript

dependencies包含:

electron

不要返回web。

`;





        console.log(
            "🔥 发送DeepSeek..."
        );


        console.log(
            "🔑 Key长度:",
            apiKey.length
        );


        console.log(
            "📦 Prompt长度:",
            prompt.length
        );





        const response =
        await axios.post(

            "https://api.deepseek.com/chat/completions",


            {

                model:
                "deepseek-chat",


                messages:[

                    {

                        role:"system",

                        content:
                        "你是严格JSON代码生成Agent"

                    },


                    {

                        role:"user",

                        content:
                        prompt

                    }


                ],


                temperature:
                0.1,


                max_tokens:
                4000,


                stream:false


            },


            {


                headers:{


                    Authorization:
                    `Bearer ${apiKey}`,


                    "Content-Type":
                    "application/json"


                },


                timeout:
                120000


            }


        );





        console.log(
            "📡 DeepSeek状态:",
            response.status
        );




        let text =
        response.data
        .choices[0]
        .message
        .content;



        console.log(
            "🧠 DeepSeek原始:",
            text.slice(0,500)
        );





        text =
        text.replace(
            /<think>[\s\S]*?<\/think>/gi,
            ""
        );



        text =
        text
        .replace(/```json/g,"")
        .replace(/```javascript/g,"")
        .replace(/```html/g,"")
        .replace(/```css/g,"")
        .replace(/```/g,"")
        .trim();





        const start =
        text.indexOf("{");


        const end =
        text.lastIndexOf("}");



        if(
            start!==-1 &&
            end!==-1
        ){

            text =
            text.substring(
                start,
                end+1
            );

        }





        const result =
        JSON.parse(text);





        if(
            !result.files ||
            !Array.isArray(result.files)
        ){

            throw new Error(
                "DeepSeek返回没有files"
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

            files:[],

            error:
            error.message

        };


    }



}



module.exports =
Builder;