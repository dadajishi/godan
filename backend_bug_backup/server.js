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



// 狗蛋状态检测
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


        const ai =
        await think(message);



        console.log(
            "🧠 AI:",
            ai
        );



        const result =
        await dispatch(ai);



        saveMessage(
            "assistant",
            typeof result==="string"
            ?
            result
            :
            JSON.stringify(result)
        );



        res.json({

            reply:
            typeof result==="string"
            ?
            result
            :
            JSON.stringify(result)

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