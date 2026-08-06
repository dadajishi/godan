// paths.js — Godan v2 Lite D8: 统一数据路径
// 关键: 打包后 backend 运行在只读的 app.asar 内，所有可写数据必须重定向
//   - 开发模式 (无 GODAN_DATA_DIR): 数据留在源码目录（与现状一致）
//   - 打包模式 (有 GODAN_DATA_DIR): 数据在用户数据目录 (~/Library/Application Support/Godan)
const path = require("path");
const fs = require("fs");

const IS_PACKAGED = !!process.env.GODAN_DATA_DIR;

// 数据根目录
const DATA_ROOT = IS_PACKAGED
    ? path.resolve(process.env.GODAN_DATA_DIR)
    : path.resolve(__dirname, ".."); // 开发: Godan 项目根

// 项目目录（所有生成的应用）
const PROJECTS_DIR = path.join(DATA_ROOT, "projects");

// 项目注册表
const PROJECT_DB = IS_PACKAGED
    ? path.join(DATA_ROOT, "projects.json")   // 打包: userData/projects.json
    : path.join(__dirname, "projects.json");   // 开发: backend/projects.json（保持现状）

// 记忆文件
const MEMORY_FILE = IS_PACKAGED
    ? path.join(DATA_ROOT, "memory", "state.json")
    : path.join(__dirname, "memory", "state.json");

// 确保目录存在
function ensureDataDirs() {
    if (IS_PACKAGED) {
        fs.mkdirSync(PROJECTS_DIR, { recursive: true });
        fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    }
}

module.exports = {
    IS_PACKAGED,
    DATA_ROOT,
    PROJECTS_DIR,
    PROJECT_DB,
    MEMORY_FILE,
    ensureDataDirs
};
