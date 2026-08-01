// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const brain = require("./brain");
const dispatch = require("./dispatcher");


const app = express();


app.use(cors());
app.use(express.json());



console.log("🔥 brain.js加载成功");



app.post("/chat", async (req, res) => {


    try {


        const message = req.body.message;


        console.log(
            "🐶 收到:",
            message
        );



        // AI大脑
        const aiResult = await brain(message);



        console.log(
            "🧠 AI:",
            aiResult
        );



        // Agent调度
        const output = await dispatch(
            aiResult
        );



        console.log(
            "✅ 最终输出:",
            output
        );



        res.json({

            reply: output

        });



    } catch(err) {


        console.error(
            "❌ 服务错误:",
            err
        );


        res.json({

            reply:
            "🐶 出错啦：" + err.message

        });


    }


});



app.get("/", (req,res)=>{

    res.send(
        "🐶 狗蛋 Agent运行中"
    );

});



const PORT = 3001;


const server = app.listen(PORT, "127.0.0.1", ()=>{

    console.log(
        "🐶 狗蛋 Agent启动：http://127.0.0.1:3001"
    );

});


