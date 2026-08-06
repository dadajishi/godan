// preload.cjs — Godan v2 Lite D8: 安全桥接层
// 通过 contextBridge 暴露最小 API，渲染进程无法直接访问 Node
// 注意: sandbox:true 下 preload 禁止 require 任意文件，只能用 process 等受限 API
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("godan", {
    // 版本信息（Electron 沙箱 preload 内可用 process.versions）
    version: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
    },
    // 平台信息
    platform: process.platform,
    // 后端地址（由 main 进程注入）
    apiBase: process.env.GODAN_API_BASE || "http://127.0.0.1:3001",
    // 安全标记：渲染进程可检测是否在 Electron 中
    isElectron: true
});
