// architect.js
console.log("🏛️ Architect模块加载");


function architect(task) {

    console.log("🏛️ Architect分析:", task);


    let architecture = {
        project: "Unknown",
        type: "web",
        stack: [],
        needsAPI: false,
        dependencies: [],
        risks: [],
        suggestions: []
    };


    const lower = task.toLowerCase();


    // 网站 / Web应用
    if (
        task.includes("网页") ||
        task.includes("网站") ||
        task.includes("App") ||
        task.includes("应用")
    ) {

        architecture.type = "web_app";

        architecture.stack = [
            "HTML",
            "CSS",
            "JavaScript"
        ];

    }


    // React项目
    if (
        task.includes("React") ||
        task.includes("react")
    ) {

        architecture.stack = [
            "React",
            "Vite",
            "CSS"
        ];

    }


    // 游戏检测

    if (
        task.includes("游戏") ||
        task.includes("小游戏") ||
        task.includes("模拟")
    ){

        architecture.type = "game";

        architecture.stack.push(
            "Canvas",
            "JavaScript"
        );

    }



    // API检测

    if (
        task.includes("天气") ||
        task.includes("地图") ||
        task.includes("新闻") ||
        task.includes("股票") ||
        task.includes("AI")
    ){

        architecture.needsAPI = true;

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



    // 3D项目

    if (
        task.includes("3D") ||
        task.includes("星球") ||
        task.includes("宇宙")
    ){

        architecture.stack.push(
            "Three.js",
            "WebGL"
        );

    }



    architecture.project = task;


    console.log(
        "🏛️ Architect结果:",
        architecture
    );


    return architecture;

}



module.exports = architect;