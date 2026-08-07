// src/config.js — Godan 共享配置
// API_BASE 推导优先级：
//   1. window.godan.apiBase（Electron 桌面版注入）
//   2. import.meta.env.VITE_API_BASE（构建时指定）
//   3. 自动推导：http://<当前主机名>:3002（Web/手机版：手机访问电脑时，hostname 自动是电脑 IP）
export const API_BASE =
  window.godan?.apiBase ||
  import.meta.env.VITE_API_BASE ||
  `http://${window.location.hostname || "127.0.0.1"}:3002`;

// 后端默认端口（与 webStart.js 一致）
export const DEFAULT_API_PORT = 3002;
