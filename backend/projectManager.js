console.log("📁 ProjectManager模块加载");

const fs = require("fs");
const path = require("path");


const PROJECT_DB = path.join(
    __dirname,
    "projects.json"
);



function ensureDB(){

    if(!fs.existsSync(PROJECT_DB)){

        fs.writeFileSync(
            PROJECT_DB,
            "[]",
            "utf8"
        );

    }

}



function loadProjects(){

    ensureDB();

    try{

        return JSON.parse(
            fs.readFileSync(
                PROJECT_DB,
                "utf8"
            )
        );

    }catch(e){

        return [];

    }

}




function saveProjects(projects){

    fs.writeFileSync(

        PROJECT_DB,

        JSON.stringify(
            projects,
            null,
            2
        ),

        "utf8"

    );

}





// 注册项目

function registerProject(info){


    const projects =
        loadProjects();


    const now =
        new Date().toISOString();



    const exists =
        projects.find(
            p =>
            p.name === info.name
        );



    if(exists){


        exists.path =
            info.path;


        exists.type =
            info.type ||
            exists.type;


        exists.lastModified =
            now;


    }else{


        projects.push({

            name:info.name,

            path:info.path,

            type:
            info.type ||
            "web_app",

            created:now,

            lastModified:now

        });


    }



    saveProjects(projects);


    console.log(
        "📁 已记录项目:",
        info.name
    );


}





// 查找项目

function findProject(keyword){


    const projects =
        loadProjects();



    if(!keyword)
        return null;



    keyword =
        keyword
        .toLowerCase();



    return projects.find(
        p=>{


            const name =
            p.name.toLowerCase();


            return (
                name.includes(keyword)
                ||
                keyword.includes(name)
            );


        }
    );


}






// 项目列表

function listProjects(){

    return loadProjects();

}







// 读取项目文件

function readProjectFiles(projectPath){


    const files=[];


    if(
        !fs.existsSync(projectPath)
    ){

        return files;

    }




    function scan(dir){


        const items =
            fs.readdirSync(dir);



        for(const item of items){


            // 跳过垃圾目录

            if(
                item==="node_modules"
                ||
                item===".git"
                ||
                item==="dist"
            ){

                continue;

            }




            const fullPath =
                path.join(
                    dir,
                    item
                );



            const stat =
                fs.statSync(
                    fullPath
                );



            if(stat.isDirectory()){


                scan(fullPath);


            }else{


                try{


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


                }catch(e){


                    console.log(
                        "⚠️ 无法读取:",
                        fullPath
                    );


                }


            }


        }


    }



    scan(projectPath);



    return files;


}








// 获取项目结构

function getProjectInfo(name){


    const project =
        findProject(name);



    if(!project){

        return null;

    }



    return {


        ...project,


        files:
        readProjectFiles(
            project.path
        )


    };


}







// 删除项目记录

function removeProject(name){


    let projects =
        loadProjects();



    projects =
        projects.filter(
            p =>
            p.name !== name
        );



    saveProjects(projects);


}







module.exports={


    registerProject,


    findProject,


    listProjects,


    readProjectFiles,


    getProjectInfo,


    removeProject


};