console.log("🧠 ManagerAgent加载");

const FrontendAgent = require("./frontendAgent");
const BackendAgent = require("./backendAgent");
const UIAgent = require("./uiAgent");


async function Manager(input) {

    console.log("🧠 Manager收到:", input);


    const task = input.task || "";


    // 后端任务
    if (
        task.includes("API") ||
        task.includes("接口") ||
        task.includes("数据库") ||
        task.includes("服务端")
    ) {

        console.log("⚙️ 分配给 BackendAgent");

        return await BackendAgent(input);

    }


    // UI任务
    if (
        task.includes("UI") ||
        task.includes("界面") ||
        task.includes("样式") ||
        task.includes("动画") ||
        task.includes("颜色")
    ) {

        console.log("🎨 分配给 UIAgent");

        return await UIAgent(input);

    }


    // 默认前端
    console.log("💻 分配给 FrontendAgent");

    return await FrontendAgent(input);

}


module.exports = Manager;