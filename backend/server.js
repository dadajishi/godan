// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const brain = require("./brain");
const dispatch = require("./dispatcher");
const keyStorage = require("./keyStorage");
const llm = require("./llm");


const app = express();


// 修正: CORS 收紧 — 仅允许本地前端来源，不再全开
app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173",
             "http://localhost:5174", "http://127.0.0.1:5174", "file://"],
    methods: ["POST", "GET", "DELETE"]
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


// =====================================================
// D2: 用户设置 API（API Key 加密存储，BYOK）
// =====================================================

// 读取设置（脱敏，永不返回 key 明文）
app.get("/api/settings", async (req, res) => {
    try {
        const pub = await keyStorage.getPublic();
        res.json({ success: true, ...pub });
    } catch (err) {
        console.error("❌ 读取设置失败:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 保存设置 {apiKey, baseUrl?, model?}
app.post("/api/settings", async (req, res) => {
    try {
        const body = (req.body && typeof req.body === "object") ? req.body : {};
        const { apiKey, baseUrl, model } = body;
        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
            return res.status(400).json({ success: false, error: "apiKey 不能为空" });
        }
        const method = await keyStorage.save({
            apiKey: apiKey.trim(),
            baseUrl: (baseUrl || "").trim(),
            model: (model || "deepseek-chat").trim()
        });
        const pub = await keyStorage.getPublic();
        res.json({ success: true, storage: method, ...pub });
    } catch (err) {
        console.error("❌ 保存设置失败:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 清除设置
app.delete("/api/settings", async (req, res) => {
    try {
        const removed = await keyStorage.remove();
        res.json({ success: true, removed });
    } catch (err) {
        console.error("❌ 清除设置失败:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 测试 API Key 有效性（不保存，用临时配置发最小请求）
app.post("/api/settings/test", async (req, res) => {
    try {
        const body = (req.body && typeof req.body === "object") ? req.body : {};
        const { apiKey, baseUrl, model } = body;
        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
            return res.status(400).json({ success: false, error: "apiKey 不能为空" });
        }
        const reply = await llm.chat({
            system: "你是连接测试助手。收到 ping 就回复: ok",
            user: "ping",
            temperature: 0,
            maxTokens: 20,
            json: false,
            apiKey: apiKey.trim(),
            baseUrl: (baseUrl || "").trim(),
            model: (model || "deepseek-chat").trim()
        });
        res.json({ success: true, reply: String(reply).slice(0, 50) });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});



const PORT = process.env.PORT || 3001;


const server = app.listen(PORT, "127.0.0.1", ()=>{

    console.log(
        "🐶 狗蛋 Agent启动：http://127.0.0.1:3001"
    );

});


