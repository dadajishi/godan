console.log("📁 FileArchitect模块加载");


async function FileArchitect(task, architecture){


    console.log(
        "📁 FileArchitect分析:",
        task
    );


    let files = [
        "index.html",
        "style.css",
        "script.js"
    ];



    const stack =
    architecture.stack || [];



    if(
        stack.includes("Three.js") ||
        stack.includes("WebGL")
    ){

        files = [

            "index.html",

            "style.css",

            "main.js",

            "scene.js",

            "animation.js"

        ];

    }



    if(
        stack.includes("React")
    ){

        files=[

            "src/main.jsx",

            "src/App.jsx",

            "src/App.css",

            "index.html"

        ];

    }



    if(
        task.includes("登录")
        ||
        task.includes("数据库")
        ||
        task.includes("后台")
    ){

        files.push(

            "server.js",

            "database.js",

            "api.js"

        );

    }



    return {


        project:
        architecture.project,


        files,


        rules:[

            "每个文件必须返回完整代码",

            "禁止把所有代码塞入index.html",

            "保持项目结构清晰"

        ]

    };


}



module.exports = FileArchitect;