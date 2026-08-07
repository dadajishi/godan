// paths.js — Godan 统一数据路径
// 关键: 打包后 backend 运行在只读的 app.asar 内，所有可写数据必须重定向
//   - 项目生成到桌面「狗蛋项目」文件夹（用户可直接看到/打开/拖进微信）
//   - 注册表/记忆留在数据目录（打包: userData；开发: 源码目录）
const path = require("path");
const fs = require("fs");
const os = require("os");

const IS_PACKAGED = !!process.env.GODAN_DATA_DIR;

// 数据根目录（注册表/记忆/用量）
const DATA_ROOT = IS_PACKAGED
    ? path.resolve(process.env.GODAN_DATA_DIR)
    : path.resolve(__dirname, ".."); // 开发: Godan 项目根

// 桌面目录（打包: main.cjs 注入 app.getPath("desktop")，兼容 OneDrive 重定向；
//            开发: 用户主目录 Desktop）
const DESKTOP_DIR = IS_PACKAGED
    ? (process.env.GODAN_DESKTOP_DIR || path.join(os.homedir(), "Desktop"))
    : path.join(os.homedir(), "Desktop");

// 项目根目录: 桌面/狗蛋项目（所有生成的应用都放这里）
const PROJECTS_DIR = path.join(DESKTOP_DIR, "狗蛋项目");

// 项目注册表
const PROJECT_DB = IS_PACKAGED
    ? path.join(DATA_ROOT, "projects.json")   // 打包: userData/projects.json
    : path.join(__dirname, "projects.json");   // 开发: backend/projects.json

// 记忆文件
const MEMORY_FILE = IS_PACKAGED
    ? path.join(DATA_ROOT, "memory", "state.json")
    : path.join(__dirname, "memory", "state.json");

// 确保目录存在
function ensureDataDirs() {
    try {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    } catch (e) {
        console.log("⚠️ 目录创建失败:", e.message);
    }
}

module.exports = {
    IS_PACKAGED,
    DATA_ROOT,
    DESKTOP_DIR,
    PROJECTS_DIR,
    PROJECT_DB,
    MEMORY_FILE,
    ensureDataDirs
};
