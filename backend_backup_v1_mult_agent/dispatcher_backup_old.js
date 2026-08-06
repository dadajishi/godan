cat > dispatcher.js <<'EOF'
const {planner}=require("./planner");
const {builder}=require("./builder");


async function dispatch(input){

    console.log("⚙️ dispatcher收到:",input);


    let result=await planner(input);


    console.log("📌 路由结果:",result);


    if(result.tool==="build"){

        console.log("🏗️ 自动进入Builder...");

        return await builder(result.task);

    }


    if(result.tool==="plan"){

        console.log("🧠 进入规划模式");

        return result;

    }


    return result;

}


module.exports={
    dispatch
};
EOF