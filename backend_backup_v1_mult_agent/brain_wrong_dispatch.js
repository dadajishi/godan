const { planner } = require("./planner");
const { builder } = require("./builder");


async function dispatch(input){

    console.log("⚙️ dispatcher收到:", input);


    let data;


    try {

        data = typeof input === "string"
            ? JSON.parse(input)
            : input;

    } catch (e) {

        console.log("JSON解析失败:", input);

        return {
            error: "AI没有输出JSON",
            raw: input
        };

    }


    if (data.tool === "plan") {

        console.log("🧠 进入Planner");


        const result = await planner(data.task);


        console.log(
            "Planner结果:",
            result
        );


        return await builder(
            result.title || data.task
        );

    }


    if (data.tool === "build") {

        return await builder(data.task);

    }


    if (data.tool === "chat") {

        return {
            reply: data.content
        };

    }


    return {
        error: "未知工具",
        data: data
    };

}



module.exports = {
    dispatch
};