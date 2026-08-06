// previewServer.js — Godan v2 Lite D7: 项目预览静态服务
// 用法: app.use("/preview", previewServer(ProjectManager))
// 安全: 路径穿越防护 — 只允许服务 projects 根下的真实项目目录
const express = require("express");
const fs = require("fs");
const path = require("path");

module.exports = function createPreviewServer(ProjectManager, projectsRoot) {
    const router = express.Router();

    // GET /preview/:name/* — 服务项目静态文件（Express 5: 用正则路由替代 /:name/*）
    router.get(/^\/([^/]+)\/(.*)$/, (req, res) => {
        const name = decodeURIComponent(req.params[0]);
        const rel = req.params[1] || "index.html";
        const project = ProjectManager.findProject(name);

        if (!project || !project.path) {
            return res.status(404).json({ success: false, error: "项目不存在: " + name });
        }

        const projectDir = path.resolve(project.path);
        const root = path.resolve(projectsRoot);

        // 安全: 项目路径必须在 projects 根下
        if (!projectDir.startsWith(root + path.sep) && projectDir !== root) {
            return res.status(403).json({ success: false, error: "拒绝访问" });
        }

        // 相对路径（默认 index.html）
        // 路径穿越防护: 规范化后必须仍在项目目录内
        const resolved = path.resolve(projectDir, rel);
        if (!resolved.startsWith(projectDir + path.sep) && resolved !== projectDir) {
            return res.status(403).json({ success: false, error: "非法路径" });
        }

        // 目录请求 → index.html
        let target = resolved;
        if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
            target = path.join(target, "index.html");
        }

        if (!fs.existsSync(target)) {
            return res.status(404).json({ success: false, error: "文件不存在: " + rel });
        }

        res.sendFile(target);
    });

    // GET /preview/:name — 项目根（重定向到 index.html）
    router.get("/:name", (req, res) => {
        res.redirect("/preview/" + req.params.name + "/");
    });

    return router;
};
