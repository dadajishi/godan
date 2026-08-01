console.log("⚙️ Executor模块加载");


const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const testPage = require("./tester");
const ProjectManager = require("./projectManager");



async function execute(input){


    console.log(
        "⚙️ Executor收到:",
        input
    );


    let data;


    try{

        data =
        typeof input==="string"
        ? JSON.parse(input)
        : input;


    }catch(e){

        return {
            success:false,
            error:"JSON解析失败"
        };

    }




    /*
    =====================
    判断创建/修改
    =====================
    */


    let projectDir;
    let projectName;



    if(data.path){


        // 修改已有项目

        console.log(
            "🩹修改已有项目:",
            data.path
        );


        projectDir=data.path;

        projectName =
        path.basename(projectDir);



    }else{


        // 创建新项目

        const title =
        data.title || "Godan_Project";


        projectName =
        title.replace(
            /[^\w\u4e00-\u9fa5-]/g,
            "_"
        );


        projectDir =
        path.join(
            process.cwd(),
            "../projects",
            projectName
        );


        console.log(
            "📁创建新项目:",
            projectDir
        );


    }



    fs.mkdirSync(
        projectDir,
        {
            recursive:true
        }
    );



    if(
        !data.files ||
        !Array.isArray(data.files)
    ){

        return {
            success:false,
            error:"没有files文件列表"
        };

    }



    let indexFile=null;



    for(const file of data.files){



        const filePath =
        path.join(
            projectDir,
            file.path
        );


        fs.mkdirSync(
            path.dirname(filePath),
            {
                recursive:true
            }
        );



        fs.writeFileSync(
            filePath,
            file.content,
            "utf8"
        );



        console.log(
            data.path
            ?
            "🩹修改文件:"
            :
            "📄创建文件:",
            filePath
        );



        if(
            file.path.toLowerCase()
            ===
            "index.html"
        ){

            indexFile=filePath;

        }


    }





    let testResult=null;



    if(indexFile){


        console.log(
            "🧪开始测试..."
        );


        try{

            testResult =
            await testPage(indexFile);


        }catch(err){

            testResult={
                success:false,
                error:err.message
            };

        }


    }





    if(indexFile){


        exec(
            `open "${indexFile}"`,
            ()=>{
                console.log(
                    "🚀浏览器打开"
                );
            }
        );


    }





    try{


        ProjectManager.registerProject({

            name:projectName,

            path:projectDir,

            type:"web_app"

        });


    }catch(e){}



    return {


        success:true,

        project:projectName,

        path:projectDir,

        modified:!!data.path,

        opened:!!indexFile,

        test:testResult


    };


}



module.exports=execute;