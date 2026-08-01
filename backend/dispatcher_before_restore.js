const { build } = require("./builder");
const { execute } = require("./executor");


async function dispatch(input) {

    console.log("⚙️ dispatcher收到:", input);

    let data;

    try {
        data = JSON.parse(input);
    } catch (err) {
        return {
            success: false,
            error: "JSON解析失败"
        };
    }


    const tool = data.tool;
    const task = data.task;


    if (tool === "plan") {

        console.log("🧠 Planner完成:", task);
        console.log("🏗️ 自动进入Builder...");

        const result = await build(task);

        console.log("🏗️ Builder完成");


        let buildData;

        try {
            buildData = typeof result === "string"
                ? JSON.parse(result)
                : result;
        } catch (e) {

            return {
                plan: task,
                build: result,
                error: "Builder输出不是JSON"
            };

        }


        const executeResult = await execute(
            JSON.stringify(buildData)
        );


        return {
            plan: task,
            build: buildData,
            execute: executeResult
        };

    }


    if (tool === "build") {

        console.log("🏗️ Builder任务:", task);

        const result = await build(task);

        return {
            build: result
        };

    }


    return {
        success:false,
        error:"未知tool:"+tool
    };

}


module.exports = {
    dispatch
};