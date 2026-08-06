console.log("🏗️ Builder模块加载");

const llm = require("./llm");


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
            "🔥 发送LLM..."
        );


        console.log(
            "📦 Prompt长度:",
            prompt.length
        );


        // D3: 统一走模型抽象层
        const result = await llm.chat({
            system: "你是严格JSON代码生成Agent",
            user: prompt,
            temperature: 0.1,
            maxTokens: 4000,
            json: true
        });








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