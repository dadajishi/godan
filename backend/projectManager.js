console.log("📁 ProjectManager模块加载");

const fs = require("fs");
const path = require("path");


const PROJECT_DB = path.join(
    __dirname,
    "projects.json"
);



// ======================
// 数据库
// ======================

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





// ======================
// 注册项目
// ======================

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





// ======================
// 智能查找项目
// ======================

function findProject(keyword){


    const projects =
        loadProjects();



    if(!keyword)
        return null;



    keyword =
        keyword.toLowerCase();



    const stopWords = [

        "给",
        "帮",
        "我",
        "添加",
        "增加",
        "修改",
        "优化",
        "升级",
        "改成",
        "加入",
        "支持",
        "一个",
        "网页",
        "网站",
        "项目",
        "功能"

    ];



    const words =

        keyword

        .replace(
            /[^\u4e00-\u9fa5a-z0-9]/g,
            " "
        )

        .split(/\s+/)

        .filter(
            w =>
            w &&
            !stopWords.includes(w)
        );



    console.log(
        "🔎 搜索关键词:",
        words
    );



    // 修正: 中文无空格分词问题 — 补充双字组(bigram)匹配
    function bigrams(s){
        const out = [];
        for(let i = 0; i < s.length - 1; i++){
            out.push(s.slice(i, i + 2));
        }
        return out;
    }
    const keywordBigrams = new Set(bigrams(keyword.replace(/[^\u4e00-\u9fa5]/g, "")));


    let bestProject=null;

    let bestScore=0;



    for(const project of projects){


        const name =
            project.name.toLowerCase();



        let score=0;



        for(const word of words){


            if(name.includes(word)){


                score++;


            }




        // 修正: 中文匹配增强 — 完整项目名子串 + 双字组重合度
        if(keyword.includes(name) && name.length >= 2){
            score += 100;
        }
        const nameBigrams = bigrams(name.replace(/[^\u4e00-\u9fa5]/g, ""));
        let bigramHits = 0;
        for(const bg of nameBigrams){
            if(keywordBigrams.has(bg)) bigramHits++;
        }
        if(nameBigrams.length > 0){
            score += bigramHits * 2;
        }        }



        console.log(

            "📁匹配",

            project.name,

            "得分",

            score

        );



        if(score > bestScore){


            bestScore = score;

            bestProject = project;


        }


    }



    if(bestScore > 0){


        console.log(

            "✅智能找到项目:",

            bestProject.name,

            "score:",

            bestScore

        );


        return bestProject;


    }



    console.log(
        "❌没有匹配项目"
    );


    return null;


}






// ======================
// 项目列表
// ======================

function listProjects(){

    return loadProjects();

}






// ======================
// 读取项目文件
// ======================

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
                        "⚠️无法读取:",
                        fullPath
                    );


                }


            }


        }


    }



    scan(projectPath);



    return files;


}






// ======================
// 获取项目信息
// ======================

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






// ======================
// 删除项目
// ======================

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