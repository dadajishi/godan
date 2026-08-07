// webStart.js — Godan 浏览器版启动器（无需 Electron）
// 用法: node webStart.js   → 浏览器自动打开 http://localhost:5174
// 依赖: 本目录下的 backend/ + dist/（Node.js >= 18 即可）
const path = require("path");
const fs = require("fs");

const ROOT = __dirname;

// 0. 检查环境
try {
    require.resolve("express", { paths: [path.join(ROOT, "backend/node_modules")] });
} catch (e) {
    console.error("❌ 缺少依赖。请先运行: cd backend && npm install");
    process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, "dist/index.html"))) {
    console.error("❌ 缺少前端构建产物 dist/，无法启动");
    process.exit(1);
}

const API_PORT = parseInt(process.env.PORT || "3002", 10);
const WEB_PORT = 5174;

// 1. 启动后端（默认 3002，避开常见的 3001；可用 PORT 环境变量覆盖）
process.env.PORT = String(API_PORT);
process.env.HOST = process.env.HOST || "0.0.0.0";
const server = require(path.join(ROOT, "backend/server.js"));

// 2. 启动静态服务（前端 dist）
const express = require(path.join(ROOT, "backend/node_modules/express"));
const app = express();
app.use(express.static(path.join(ROOT, "dist")));
// HashRouter 无需 SPA 兜底（所有路由走 #/）
const web = app.listen(WEB_PORT, "0.0.0.0", () => {
    console.log(`🌐 狗蛋 Web 版已启动: http://localhost:${WEB_PORT}`);
    console.log(`🔌 后端 API: http://127.0.0.1:${API_PORT}`);
    // 显示局域网地址（手机访问用）
    const os = require("os");
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal) {
                console.log(`📱 手机访问: http://${net.address}:${WEB_PORT}`);
            }
        }
    }
});

// 3. 自动打开浏览器（macOS/Windows/Linux 兼容）
const { exec } = require("child_process");
setTimeout(() => {
    const url = `http://localhost:${WEB_PORT}`;
    const plat = process.platform;
    if (plat === "darwin") exec(`open "${url}"`);
    else if (plat === "win32") exec(`start "" "${url}"`);
    else exec(`xdg-open "${url}"`);
}, 800);

// 4. 退出时清理
process.on("SIGINT", () => { web.close(); process.exit(0); });
process.on("SIGTERM", () => { web.close(); process.exit(0); });
