const express = require("express");
const cors = require("cors");


const { think } = require("./brain");
const { dispatch } = require("./dispatcher");


const {
    saveMessage
} = require("./memory");



const app = express();



app.use(cors());

app.use(express.json());




// 状态检测

app.get("/status",(req,res)=>{

    res.json({

        status:"online",

        agent:"godan",

        model:"qwen3:4b"

    });

});





app.post("/chat", async(req,res)=>{


    const message =
    req.body.message;



    console.log(
        "🐶 收到:",
        message
    );



    saveMessage(
        "user",
        message
    );



    try{


        // 第一次 AI 判断

        const ai =
        await think(message);



        console.log(
            "🧠 AI:",
            ai
        );



        // 工具执行

        const toolResult =
        await dispatch(ai);



        console.log(
            "🔧 工具结果:",
            toolResult
        );



        let reply;




        // 如果工具返回对象

        if(
            typeof toolResult === "object"
        ){



            reply =
            await think(
`
用户问题：

${message}



工具返回数据：

${JSON.stringify(toolResult)}



请根据工具结果回答用户。


要求：

- 用自然语言
- 像程序员朋友一样说话
- 总结重点
- 不要输出JSON

`
            );



        }
        else{


            reply =
            toolResult;


        }





        saveMessage(

            "assistant",

            typeof reply==="string"
            ?
            reply
            :
            JSON.stringify(reply)

        );





        res.json({

            reply

        });





    }catch(e){


        console.error(e);



        res.json({

            reply:
            "🐶 出错啦："+e.message

        });


    }


});





app.listen(

3001,

()=>console.log(

"🐶 狗蛋 Agent启动：http://localhost:3001"

)

);