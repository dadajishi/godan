// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const brain = require("./brain");
const dispatch = require("./dispatcher");


const app = express();


// 修正: CORS 收紧 — 仅允许本地前端来源，不再全开
app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "file://"],
    methods: ["POST", "GET"]
}));
app.use(express.json());



console.log("🔥 brain.js加载成功");



app.post("/chat", async (req, res) => {


    try {


        // 修正: 输入校验 — 空消息直接拒绝
        const message = (req.body && req.body.message !== undefined) ? req.body.message : null;

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                reply: "消息不能为空",
                success: false
            });
        }

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


