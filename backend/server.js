// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const brain = require("./brain");
const dispatch = require("./dispatcher");
const keyStorage = require("./keyStorage");
const llm = require("./llm");
const usage = require("./usage");
const ProjectManager = require("./projectManager");
const createPreviewServer = require("./previewServer");
const Memory = require("./memory/memory");
const { PROJECTS_DIR, ensureDataDirs } = require("./paths");
const fs = require("fs");
const path = require("path");

// D8: 打包模式下确保用户数据目录存在
ensureDataDirs();


const app = express();


// 修正: CORS 收紧 — 仅允许本地前端来源，不再全开
app.use(cors({
    origin: (origin, cb) => {
        // 允许: 本地开发端口 / file:// / 局域网任意 IP:5174(Web/手机版)
        if (!origin || origin === "file://" || origin === "null") return cb(null, true);
        const allowLocal = /^https?:\/\/(localhost|127\.0\.0\.1):(517[3-5])$/.test(origin);
        const allowLan = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}:5174$/.test(origin);
        if (allowLocal || allowLan) return cb(null, true);
        return cb(new Error("CORS 拒绝: " + origin), false);
    },
    methods: ["POST", "GET", "DELETE", "PUT"]
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
// D7: 项目预览静态服务（带路径穿越防护）
// =====================================================
const PROJECTS_ROOT = path.resolve(PROJECTS_DIR);
app.use("/preview", createPreviewServer(ProjectManager, PROJECTS_ROOT));





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



// =====================================================
// 长期记忆 API
// =====================================================
// GET: 查看记忆
app.get("/api/memory", (req, res) => {
    try {
        res.json({ success: true, memories: Memory.getMemories() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST: 手动添加记忆
app.post("/api/memory", (req, res) => {
    try {
        const { content, category } = req.body || {};
        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, error: "记忆内容不能为空" });
        }
        const r = Memory.addMemory({ content: String(content).trim(), source: "user", category: category || "general" });
        if (!r.ok) return res.status(400).json({ success: false, error: r.error });
        res.json({ success: true, memory: r.memory });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE: 清除记忆（全部 或 指定 id）
app.delete("/api/memory", (req, res) => {
    try {
        const id = req.query.id;
        if (id) {
            const r = Memory.removeMemory(id);
            res.json({ success: r.ok, removed: r.removed });
        } else {
            const r = Memory.clearMemories();
            res.json({ success: true, cleared: r.cleared });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// =====================================================
// P2-1: 用量统计 API
// =====================================================
app.get("/api/usage", (req, res) => {
    try {
        res.json({ success: true, ...usage.summary() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// =====================================================
// D6: 项目列表 API
// =====================================================

// 项目列表（含大小/文件数/存在性）
app.get("/api/projects", (req, res) => {
    try {
        const projects = ProjectManager.listProjects();
        const enriched = projects.map((p) => {
            let size = 0, fileCount = 0, exists = false;
            try {
                exists = fs.existsSync(p.path);
                if (exists) {
                    const walk = (dir) => {
                        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                            if (e.name === "node_modules") continue;
                            const full = path.join(dir, e.name);
                            if (e.isDirectory()) walk(full);
                            else { size += fs.statSync(full).size; fileCount++; }
                        }
                    };
                    walk(p.path);
                }
            } catch (e) { /* 目录异常忽略 */ }
            return {
                name: p.name,
                type: p.type || "web_app",
                created: p.created || "",
                lastModified: p.lastModified || "",
                exists,
                size,
                fileCount
            };
        });
        res.json({ success: true, projects: enriched });
    } catch (err) {
        console.error("❌ 项目列表失败:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 删除项目（目录 + 注册表）
app.delete("/api/projects/:name", (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        const project = ProjectManager.findProject(name);
        if (!project) {
            return res.status(404).json({ success: false, error: "项目不存在: " + name });
        }
        ProjectManager.deleteProject(name);
        res.json({ success: true, deleted: name });
    } catch (err) {
        console.error("❌ 删除项目失败:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 打开项目（macOS open 命令打开 index.html，无则打开目录）
app.post("/api/projects/:name/open", (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        const project = ProjectManager.findProject(name);
        if (!project || !fs.existsSync(project.path)) {
            return res.status(404).json({ success: false, error: "项目不存在" });
        }
        const { execFile } = require("child_process");
        const indexFile = path.join(project.path, "index.html");
        const target = fs.existsSync(indexFile) ? indexFile : project.path;
        execFile("open", [target], (err) => {
            if (err) {
                console.log("⚠️ 打开失败:", err.message);
                return res.json({ success: false, error: err.message });
            }
            res.json({ success: true, opened: target });
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// 文件树编辑 API（P2: 项目文件浏览/读取/保存）
// =====================================================

// GET: 文件树（列表，含大小）
app.get("/api/projects/:name/files", (req, res) => {
    try {
        const project = ProjectManager.findProject(req.params.name);
        if (!project || !project.path || !fs.existsSync(project.path)) {
            return res.status(404).json({ success: false, error: "项目不存在" });
        }
        const files = ProjectManager.readProjectFiles(project.path).map(f => ({
            path: f.path,
            size: Buffer.byteLength(f.content, "utf8")
        }));
        res.json({ success: true, files });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: 读取单个文件内容（?path=相对路径）
app.get("/api/projects/:name/file", (req, res) => {
    try {
        const project = ProjectManager.findProject(req.params.name);
        if (!project || !project.path || !fs.existsSync(project.path)) {
            return res.status(404).json({ success: false, error: "项目不存在" });
        }
        const relPath = req.query.path || "";
        const r = ProjectManager.readProjectFile(project.path, relPath);
        if (!r.ok) return res.status(400).json({ success: false, error: r.error });
        res.json({ success: true, path: r.path, content: r.content });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT: 保存文件内容（?path=相对路径, body: {content})
app.put("/api/projects/:name/file", (req, res) => {
    try {
        const project = ProjectManager.findProject(req.params.name);
        if (!project || !project.path || !fs.existsSync(project.path)) {
            return res.status(404).json({ success: false, error: "项目不存在" });
        }
        const relPath = req.query.path || "";
        const content = req.body && req.body.content;
        const r = ProjectManager.writeProjectFile(project.path, relPath, content);
        if (!r.ok) return res.status(400).json({ success: false, error: r.error });
        res.json({ success: true, path: r.path });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


const PORT = process.env.PORT || 3001;


const HOST = process.env.HOST || "127.0.0.1";
const server = app.listen(PORT, HOST, ()=>{

    console.log(
        `🐶 狗蛋 Agent启动：http://${HOST}:${PORT}`
    );

});


