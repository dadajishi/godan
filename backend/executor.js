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
        ?
        JSON.parse(input)
        :
        input;


    }catch(e){

        return {
            success:false,
            error:"JSON解析失败"
        };

    }



    let projectDir;
    let projectName;



    if(data.path){


        projectDir=data.path;

        projectName =
        path.basename(projectDir);


    }
    else{


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
            "📄写入:",
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





    /*
    ===========================
    自动识别Electron
    ===========================
    */


    let isElectron=false;


    const packageFile =
    path.join(
        projectDir,
        "package.json"
    );



    if(fs.existsSync(packageFile)){


        try{


            const pkg =
            JSON.parse(
                fs.readFileSync(
                    packageFile,
                    "utf8"
                )
            );


            if(
                pkg.dependencies?.electron ||
                pkg.devDependencies?.electron ||
                pkg.main
            ){

                isElectron=true;

            }


        }catch(e){}



    }





    /*
    ===========================
    Electron启动
    ===========================
    */


    if(isElectron){


        console.log(
            "🖥️检测到Electron项目"
        );


        exec(
            `cd "${projectDir}" && npm install && npm start`,
            (error)=>{


                if(error){

                    console.log(
                        "❌Electron失败:",
                        error.message
                    );

                }
                else{

                    console.log(
                        "🚀Electron启动成功"
                    );

                }


            }
        );



    }



    /*
    ===========================
    Web启动
    ===========================
    */


    else if(indexFile){


        console.log(
            "🌐启动网页"
        );


        exec(
            `open "${indexFile}"`,
            ()=>{

                console.log(
                    "🌐浏览器打开"
                );

            }
        );


    }





    let testResult=null;


    if(indexFile){

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




    try{


        ProjectManager.registerProject({

            name:projectName,

            path:projectDir,

            type:
            isElectron
            ?
            "desktop_app"
            :
            "web_app"

        });


    }catch(e){}



    return {

        success:true,

        project:projectName,

        path:projectDir,

        type:
        isElectron
        ?
        "desktop_app"
        :
        "web_app",

        opened:isElectron || !!indexFile,

        test:testResult

    };


}



module.exports=execute;