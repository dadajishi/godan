const axios = require("axios");
const fs = require("fs");
const path = require("path");

console.log("🔧 Repair模块加载");


async function repairProject(projectPath, testResult) {

    console.log("🔧 开始自动修复");
    console.log("错误信息:", testResult.errors);


    const files = [];


    function scan(dir) {

        const list = fs.readdirSync(dir);


        for (const file of list) {

            const fullPath = path.join(dir, file);

            const stat = fs.statSync(fullPath);


            if (stat.isDirectory()) {

                scan(fullPath);

            } else {

                files.push({

                    path: path.relative(
                        projectPath,
                        fullPath
                    ),

                    content: fs.readFileSync(
                        fullPath,
                        "utf8"
                    )

                });

            }

        }

    }


    scan(projectPath);



    const prompt = `
你是一个专业代码修复Agent。

现在一个网页项目运行失败。

错误:
${JSON.stringify(testResult.errors, null, 2)}


项目文件:
${JSON.stringify(files, null, 2)}


请分析错误并修复。

要求:
1. 保留原功能
2. 只修改必要文件
3. 返回完整文件内容


只返回JSON格式:

{
 "files":[
   {
    "path":"文件路径",
    "content":"完整代码"
   }
 ]
}
`;



    try {


        console.log("🧠 请求DeepSeek修复...");


        const response = await axios.post(

            "http://localhost:11434/api/chat",

            {

                model: "deepseek",

                messages: [

                    {
                        role: "user",
                        content: prompt
                    }

                ],

                stream:false

            },

            {
                timeout:120000
            }

        );



        let output =
            response.data.message.content;



        // 清理Markdown代码块

        output = output.replace("```json", "");
        output = output.replace("```", "");
        output = output.trim();



        const result =
            JSON.parse(output);



        if(!result.files){

            throw new Error(
                "AI没有返回files"
            );

        }



        for(const file of result.files){


            const target =
                path.join(
                    projectPath,
                    file.path
                );



            fs.writeFileSync(

                target,

                file.content,

                "utf8"

            );


            console.log(
                "🔧 已修复:",
                file.path
            );


        }



        console.log("✅ 自动修复完成");


        return {

            success:true,

            repaired:true,

            files:result.files.length

        };



    } catch(err){


        console.log(
            "❌ Repair失败:",
            err.message
        );


        return {

            success:false,

            error:err.message

        };


    }


}



module.exports = repairProject;