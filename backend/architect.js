// architect.js

console.log("🏛️ Architect模块加载");



function architect(task) {


    console.log(
        "🏛️ Architect分析:",
        task
    );



    let architecture = {

        project: "Unknown",

        type: "web_app",

        stack: [],

        needsAPI:false,

        dependencies:[],

        risks:[],

        suggestions:[]

    };



    const text =
    task.toLowerCase();



    /*
    =====================
    Electron桌面应用
    =====================
    */


    if(

        text.includes("桌面") ||
        text.includes("electron") ||
        text.includes("客户端") ||
        text.includes("mac应用") ||
        text.includes("windows软件") ||
        text.includes("桌面软件")

    ){


        architecture.type =
        "desktop_app";



        architecture.stack = [

            "Electron",

            "HTML",

            "CSS",

            "JavaScript"

        ];



        architecture.dependencies.push(

            "electron"

        );



        architecture.suggestions.push(

            "生成electron主进程和渲染进程"

        );


    }





    /*
    =====================
    Web应用
    =====================
    */


    else if(

        text.includes("网页") ||
        text.includes("网站") ||
        text.includes("web") ||
        text.includes("应用") ||
        text.includes("app")

    ){


        architecture.type =
        "web_app";



        architecture.stack = [

            "HTML",

            "CSS",

            "JavaScript"

        ];


    }







    /*
    =====================
    React
    =====================
    */


    if(

        text.includes("react")

    ){


        architecture.type =
        "web_app";


        architecture.stack = [

            "React",

            "Vite",

            "CSS"

        ];



    }






    /*
    =====================
    游戏
    =====================
    */


    if(

        text.includes("游戏") ||
        text.includes("小游戏") ||
        text.includes("模拟器") ||
        text.includes("模拟")

    ){


        architecture.type =
        "game";


        architecture.stack.push(

            "Canvas",

            "JavaScript"

        );


    }







    /*
    =====================
    3D项目
    =====================
    */


    if(

        text.includes("3d") ||
        text.includes("三维") ||
        text.includes("星球") ||
        text.includes("宇宙") ||
        text.includes("粒子")

    ){


        architecture.stack.push(

            "Three.js",

            "WebGL"

        );


    }







    /*
    =====================
    API需求
    =====================
    */


    if(

        text.includes("天气") ||
        text.includes("地图") ||
        text.includes("新闻") ||
        text.includes("股票") ||
        text.includes("ai") ||
        text.includes("人工智能")

    ){


        architecture.needsAPI =
        true;



        architecture.dependencies.push(

            "external API"

        );



        architecture.risks.push(

            "API Key可能缺失"

        );



        architecture.suggestions.push(

            "增加Mock数据模式"

        );


    }






    /*
    =====================
    Node后台
    =====================
    */


    if(

        text.includes("后台") ||
        text.includes("服务器") ||
        text.includes("数据库") ||
        text.includes("登录")

    ){


        architecture.stack.push(

            "Node.js",

            "Express"

        );


        architecture.needsAPI=true;


    }






    architecture.project =
    task;



    console.log(

        "🏛️ Architect结果:",

        architecture

    );



    return architecture;



}




module.exports = architect;