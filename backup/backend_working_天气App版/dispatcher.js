const tools = require("./tools");
const { build } = require("./builder");
const { execute } = require("./executor");



async function dispatch(aiText){


    console.log(
        "⚙️ dispatcher收到:",
        aiText
    );



    let data;



    try{

        data = JSON.parse(aiText);


    }catch(e){

        return aiText;

    }




    // 普通聊天

    if(data.tool==="chat"){

        return data.content;

    }





    // 创建文件

    if(data.tool==="createFile"){

        return tools.createFile(

            data.path,

            data.content

        );

    }





    // 写文件

    if(data.tool==="writeFile"){

        return tools.writeFile(

            data.path,

            data.content

        );

    }





    // 读取文件

    if(data.tool==="readFile"){

        return tools.readFile(

            data.path

        );

    }





    // 新增：规划任务自动进入建造

    if(data.tool==="plan"){


        console.log(
            "🧠 Plan任务:",
            data.task
        );



        const result =
        await build(data.task);



        console.log(
            "🏗️ Builder完成"
        );



        return await execute(result);



    }





    // 直接build

    if(data.tool==="build"){


        const result =
        await build(data.task);



        return await execute(result);


    }





    return aiText;


}



module.exports={

    dispatch

};