// main.cjs — Godan v2 Lite D8: Electron 主进程
// 安全: contextIsolation + preload 桥接，渲染进程无 Node 访问
// 生产: 启动内置 backend (3001) + 加载 dist；开发: 连接 vite dev server
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// 修复: Windows 白屏闪退 — 禁用硬件加速（GPU 驱动问题在虚拟机/老显卡/远程桌面极常见）
app.disableHardwareAcceleration();

// 修复: 渲染进程崩溃(0x80000003) — 强制软件渲染
// 这是 Windows 虚拟机/远程桌面/老显卡环境最稳的兼容组合
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("in-process-gpu");
// 软件渲染: SwiftShader 作为兜底 GL 实现
app.commandLine.appendSwitch("use-gl", "swiftshader");
app.commandLine.appendSwitch("enable-unsafe-swiftshader");
// 兜底: 部分 Windows 环境(杀软/组策略) sandbox 初始化失败会导致渲染进程崩溃
// 本地单机应用，关闭 sandbox 可接受（渲染进程本就无 Node 权限）
if (process.platform === "win32") {
    app.commandLine.appendSwitch("no-sandbox");
}

// ===== 文件日志系统（Windows 无控制台，崩溃诊断靠这个）=====
const LOG_FILE = path.join(app.getPath("userData"), "main.log");
function log(...args) {
    const line = `[${new Date().toISOString()}] ` + args.join(" ") + "\n";
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) { /* 日志失败不影响主流程 */ }
    console.log(...args);
}
process.on("uncaughtException", (err) => {
    log("❌ uncaughtException:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
    log("⚠️ unhandledRejection:", reason && reason.stack ? reason.stack : String(reason));
});

const IS_DEV = !app.isPackaged;
const net = require("net");
let API_PORT = parseInt(process.env.GODAN_PORT || "3001", 10);
let backendProc = null;

// 探测端口是否被占用
function isPortFree(port) {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.once("error", () => resolve(false));
        srv.once("listening", () => srv.close(() => resolve(true)));
        srv.listen(port, "127.0.0.1");
    });
}

// 找到第一个空闲端口（避免与用户已启动的其他服务冲突）
async function findFreePort(startPort) {
    for (let p = startPort; p < startPort + 20; p++) {
        if (await isPortFree(p)) return p;
    }
    return startPort; // 全部占用则用起始端口（后端会报错，窗口仍可打开）
}

// 启动内置后端（仅生产模式；开发模式由用户自行启动 backend）
async function startBackend() {
    if (IS_DEV) return;

    const backendEntry = path.join(__dirname, "backend", "server.js");
    if (!fs.existsSync(backendEntry)) {
        console.log("⚠️ 未找到 backend/server.js，跳过内置后端启动");
        return;
    }

    API_PORT = await findFreePort(API_PORT);
    console.log("🚀 启动内置后端 :" + API_PORT);

    // 修复: Windows 上 userData 目录可能尚未创建，spawn 的 cwd 必须存在否则 ENOENT
    const userDataDir = app.getPath("userData");
    try {
        fs.mkdirSync(userDataDir, { recursive: true });
    } catch (e) { /* 忽略 */ }

    try {
        backendProc = spawn(process.execPath, [backendEntry], {
            cwd: userDataDir,   // 打包后 backend 在 asar 内只读，cwd 必须用真实可写目录
            env: {
                ...process.env,
                PORT: String(API_PORT),
                // 关键: 打包后 process.execPath 是 Electron 二进制，
                // 必须用 ELECTRON_RUN_AS_NODE=1 使其以 Node 模式运行 server.js（且可读 asar 内文件）
                ELECTRON_RUN_AS_NODE: "1",
                // 数据重定向: 打包后 backend 在只读 asar 内，可写数据全部指向用户数据目录
                GODAN_DATA_DIR: userDataDir,
                // 项目生成到桌面（app.getPath("desktop") 自动适配 OneDrive 重定向等）
                GODAN_DESKTOP_DIR: app.getPath("desktop")
            },
            stdio: "inherit",
            windowsHide: true   // Windows 上隐藏后端控制台窗口
        });
        backendProc.on("exit", (code) => {
            log("🔌 后端退出 code=" + code);
            backendProc = null;
        });
        backendProc.on("error", (err) => {
            console.log("⚠️ 后端启动错误: " + err.message);
            backendProc = null;
        });
    } catch (err) {
        console.log("⚠️ 后端启动失败（窗口仍会打开）: " + err.message);
        backendProc = null;
    }
}

function createWindow() {
    log("🪟 createWindow() 被调用");
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

    // 修复: 渲染进程崩溃时自动重载，避免白屏闪退
    win.webContents.on("render-process-gone", (event, details) => {
        log("⚠️ 渲染进程崩溃: reason=" + details.reason + " exitCode=" + details.exitCode + "，5秒后重载");
        setTimeout(() => {
            if (!win.isDestroyed()) win.reload();
        }, 5000);
    });
    win.webContents.on("did-fail-load", (event, errorCode, errorDesc) => {
        console.log("⚠️ 页面加载失败: " + errorCode + " " + errorDesc);
    });
}

app.whenReady().then(() => {
    log("✅ app ready, isPackaged=" + app.isPackaged);
    startBackend().then(() => {
        log("🪟 创建窗口, API_PORT=" + API_PORT);
        createWindow();
    }).catch((err) => {
        log("❌ startBackend 异常: " + (err && err.stack ? err.stack : err));
        createWindow(); // 兜底: 后端失败也开窗口
    });

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
