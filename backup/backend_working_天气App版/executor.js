const tools = require("./tools");
const path = require("path");
const fs = require("fs");


async function execute(planData){

    let data;

    try{

        data =
        typeof planData === "string"
        ? JSON.parse(planData)
        : planData;

    }catch(e){

        return {
            success:false,
            error:"Builder JSON解析失败"
        };

    }



    if(!data.files){

        return {
            success:false,
            error:"没有files"
        };

    }



    // 项目保存目录
    const projectDir =
    path.join(
        process.cwd(),
        "../projects"
    );



    if(!fs.existsSync(projectDir)){

        fs.mkdirSync(
            projectDir,
            {
                recursive:true
            }
        );

    }



    const results=[];



    for(const file of data.files){


        try{


            // 只允许写入projects
            const savePath =
            path.join(
                "projects",
                file.path
            );



            let content =
            file.content || "";



            // HTML自动支持中文
            if(
                file.path.endsWith(".html")
                &&
                !content.includes("charset")
            ){

                content =
                content.replace(
                    "<head>",
                    "<head>\n<meta charset=\"UTF-8\">"
                );

            }



            tools.createFile(
                savePath,
                content
            );



            results.push({

                file:file.path,

                success:true

            });



        }catch(e){


            results.push({

                file:file.path,

                success:false,

                error:e.message

            });


        }


    }



    return {

        success:true,

        message:"文件创建完成",

        results

    };


}



module.exports={
    execute
};