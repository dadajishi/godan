const fs = require("fs");
const path = require("path");

console.log("🔎 CodeAnalyzer模块加载");


function analyzeProject(projectPath){

    console.log(
        "🔎 分析项目:",
        projectPath
    );


    if(!fs.existsSync(projectPath)){

        throw new Error(
            "项目不存在"
        );

    }


    const files=[];


    function scan(dir){

        const items =
        fs.readdirSync(dir);


        for(const item of items){

            const fullPath =
            path.join(dir,item);


            const stat =
            fs.statSync(fullPath);


            if(stat.isDirectory()){

                //忽略依赖
                if(
                    item==="node_modules" ||
                    item===".git"
                ){
                    continue;
                }


                scan(fullPath);


            }else{


                const ext =
                path.extname(item);


                //只分析代码文件
                if([
                    ".html",
                    ".css",
                    ".js",
                    ".jsx",
                    ".ts",
                    ".tsx"
                ].includes(ext)){


                    files.push({

                        path:
                        path.relative(
                            projectPath,
                            fullPath
                        ),


                        content:
                        fs.readFileSync(
                            fullPath,
                            "utf8"
                        )

                    });


                }


            }

        }

    }


    scan(projectPath);



    return {

        project:
        path.basename(projectPath),


        path:
        projectPath,


        files

    };

}



module.exports={
    analyzeProject
};