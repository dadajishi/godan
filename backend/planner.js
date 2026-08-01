console.log("🧠 Planner模块加载");

async function planner(task){

    console.log("🧠 Planner:", task);

    const t = task.toLowerCase();

    if(
        t.includes("你好") ||
        t.includes("打招呼") ||
        t.includes("聊天") ||
        t.includes("hello") ||
        t.includes("hi") ||
        t.includes("谢谢")
    ){

        let reply = "你好！我是狗蛋 Agent，有什么可以帮你的吗？";

        if(t.includes("谢谢")){
            reply = "不客气！有需要随时叫我。";
        }else if(t.includes("你好") || t.includes("hello") || t.includes("hi") || t.includes("打招呼")){
            reply = "你好！我是狗蛋 Agent，可以帮你规划任务、生成网页项目并执行创建。";
        }

        const result = {
            title:"聊天",
            type:"chat",
            task:task,
            reply:reply,
            plan:["直接回复"]
        };

        console.log("🧠 Planner结果:", result);

        return result;
    }


    const result = {
        title:task,
        type:"build",
        task:task,
        plan:[
            "分析需求",
            "设计结构",
            "生成代码",
            "测试"
        ]
    };


    console.log("🧠 Planner结果:", result);

    return result;
}


module.exports = planner;
