const fs = require("fs");
const path = require("path");


const MEMORY_FILE = path.join(
    __dirname,
    "memory.json"
);


// 读取记忆
function loadMemory(){

    if(!fs.existsSync(MEMORY_FILE)){

        return {
            projects: [],
            history: []
        };

    }


    try {

        return JSON.parse(
            fs.readFileSync(
                MEMORY_FILE,
                "utf8"
            )
        );

    } catch(error){

        console.log("⚠️ memory损坏，重新创建");

        return {
            projects: [],
            history: []
        };

    }

}



// 保存记忆
function saveMemory(memory){

    fs.writeFileSync(

        MEMORY_FILE,

        JSON.stringify(
            memory,
            null,
            2
        ),

        "utf8"

    );

}



// 添加项目
function addProject(project){

    const memory = loadMemory();


    memory.projects.push({

        name: project.project,

        path: project.path,

        time: new Date().toISOString()

    });



    memory.history.push({

        action: "create",

        project: project.project,

        time: new Date().toISOString()

    });



    saveMemory(memory);


    console.log(
        "🧠 记忆保存:",
        project.project
    );

}



// 获取所有项目
function getProjects(){

    const memory = loadMemory();

    return memory.projects;

}



// 搜索项目
function searchProject(keyword){

    const memory = loadMemory();


    return memory.projects.filter((p)=>{

        return p.name.includes(keyword);

    });

}



module.exports = {

    addProject,

    getProjects,

    searchProject

};