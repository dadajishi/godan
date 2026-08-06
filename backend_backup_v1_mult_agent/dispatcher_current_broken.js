const { planner } = require("./planner");
const { builder } = require("./builder");

async function dispatch(input){

    let data;

    try{
        data = JSON.parse(input);
    }catch(e){
        return {
            error:"JSON错误",
            raw:input
        };
    }


    if(data.tool === "plan"){

        const result = await planner(data.task);

        return await builder(
            result.title || data.task
        );

    }


    if(data.tool === "build"){

        return await builder(data.task);

    }


    return {
        reply:data.content || "收到"
    };

}


module.exports={
    dispatch
};