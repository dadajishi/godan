// main.cjs — Godan v2 Lite D8: Electron 主进程
// 安全: contextIsolation + preload 桥接，渲染进程无 Node 访问
// 生产: 启动内置 backend (3001) + 加载 dist；开发: 连接 vite dev server
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const IS_DEV = !app.isPackaged;
const API_PORT = process.env.GODAN_PORT || 3001;
let backendProc = null;

// 启动内置后端（仅生产模式；开发模式由用户自行启动 backend）
function startBackend() {
    if (IS_DEV) return;

    const backendEntry = path.join(__dirname, "backend", "server.js");
    if (!fs.existsSync(backendEntry)) {
        console.log("⚠️ 未找到 backend/server.js，跳过内置后端启动");
        return;
    }

    console.log("🚀 启动内置后端 :" + API_PORT);
    backendProc = spawn(process.execPath, [backendEntry], {
        cwd: app.getPath("userData"),   // 打包后 backend 在 asar 内只读，cwd 必须用真实可写目录
        env: {
            ...process.env,
            PORT: String(API_PORT),
            // 关键: 打包后 process.execPath 是 Electron 二进制，
            // 必须用 ELECTRON_RUN_AS_NODE=1 使其以 Node 模式运行 server.js（且可读 asar 内文件）
            ELECTRON_RUN_AS_NODE: "1",
            // 数据重定向: 打包后 backend 在只读 asar 内，可写数据全部指向用户数据目录
            GODAN_DATA_DIR: app.getPath("userData")
        },
        stdio: "inherit"
    });
    backendProc.on("exit", (code) => {
        console.log("🔌 后端退出 code=" + code);
        backendProc = null;
    });
}

function createWindow() {
    // 注入后端地址到 preload（打包后前端通过 window.godan.apiBase 读取）
    process.env.GODAN_API_BASE = `http://127.0.0.1:${API_PORT}`;

    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        title: "Godan AI 应用工坊",
        backgroundColor: "#070a12",
        webPreferences: {
            contextIsolation: true,      // 隔离上下文
            nodeIntegration: false,      // 渲染进程禁用 Node
            sandbox: true,               // 渲染进程沙箱
            preload: path.join(__dirname, "preload.cjs"),
            webSecurity: true
        }
    });

    // 生产: 加载本地 dist；开发: 加载 vite dev server
    if (IS_DEV) {
        win.loadURL("http://localhost:5173");
        win.webContents.openDevTools({ mode: "detach" });
    } else {
        win.loadFile(path.join(__dirname, "dist", "index.html"));
    }
}

app.whenReady().then(() => {
    startBackend();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// 退出时清理后端进程
app.on("before-quit", () => {
    if (backendProc) {
        backendProc.kill();
        backendProc = null;
    }
});
