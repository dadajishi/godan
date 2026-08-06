# Godan v2 Lite 实施计划 — 2 周朋友体验版

> **Goal:** 2 周内交付一个可打包 dmg、朋友装上就能用的 Godan：输入自己的 API Key → 创建/修改/预览/测试网页项目。
> **Architecture:** 保持单机 Express + React 工作台，**不引入** SSE/任务队列/多用户/云同步/Docker。同步请求 + 前端 loading 状态即可。
> **Tech Stack:** 现有 Electron 43 + React 19 + Vite 8 + Express + DeepSeek(OpenAI 兼容) + Playwright

---

## 范围裁剪（相比完整 v2）

**做**：BYOK 设置页 + 模型抽象层 + 工作台 UI（聊天/项目列表/预览/设置）+ 失败重试 + 测试截图 + dmg 打包 + 死代码清理
**不做**：SSE 实时进度、任务队列、多用户隔离、Docker 沙箱、repair 自动修复循环、用量统计、模板市场

**理由**：朋友体验的核心是「输 Key → 说需求 → 看到网页 → 让它改」的闭环。异步化/多用户是锦上添花，2 周内会吃掉 40% 时间且不直接提升体验。

---

## 一、文件改动列表

### 新增（9 个）

| 文件 | 职责 |
|---|---|
| `backend/llm.js` | **模型抽象层**：`chat({system, user, maxTokens})`，读用户配置 (baseUrl/apiKey/model)，OpenAI 兼容协议；带重试（1 次）与 JSON 清理 |
| `backend/keyStorage.js` | API Key 加密存储：macOS Keychain（`security add-generic-password` / keytar），失败降级加密文件；`save/get/has` |
| `backend/previewServer.js` | 项目静态预览服务：`/preview/<projectName>/<path>`，目录穿越防护（复用 executor 校验逻辑） |
| `src/api.js` | fetch 封装：`chat/saveSettings/getSettings/listProjects/deleteProject` + 统一错误处理 |
| `src/views/ChatView.jsx` | 聊天+开发视图（迁移自 Home.jsx，加阶段状态显示） |
| `src/views/ProjectsView.jsx` | 项目列表：名称/类型/修改时间/打开/删除 |
| `src/views/SettingsView.jsx` | API Key 输入（掩码）+ 模型选择（DeepSeek/OpenAI/自定义）+ 保存/测试连接 |
| `src/components/PreviewPane.jsx` | iframe 内嵌预览 + 刷新按钮 |
| `src/components/Layout.jsx` | 侧栏导航（激活 `styles/godan.css` 的 .sidebar/.app-shell 类）+ 路由出口 |

### 修改（11 个）

| 文件 | 改动 |
|---|---|
| `backend/brain.js` | 删 Ollama 硬编码，改调 `llm.js`（意图路由用用户模型，small model 可后续加） |
| `backend/builder.js` | 用 `llm.js` 替代直连 axios；删 `apiKey.length` 日志；分块生成（files>8 时按 4 个一批两次请求） |
| `backend/patchBuilder.js` | 用 `llm.js`；补 `max_tokens: 8000` |
| `backend/server.js` | 新增路由：`GET/POST /api/settings`、`GET /api/projects`、`DELETE /api/projects/:name`、`GET /preview/*`；`/chat` 保持但内部走 llm.js |
| `backend/projectManager.js` | 加 `deleteProject(name)`（删目录+注册表）、`getProject(name)` |
| `backend/tester.js` | 测试后 `page.screenshot()` 保存到 `projects/<name>/_test/screenshot.png`，错误收集进结果 |
| `backend/dispatcher.js` | builder/patchBuilder 空结果时：重试 1 次（D5 简化版）后仍失败才返回 error |
| `src/App.jsx` | 加 react-router（`/`、`/projects`、`/settings`）+ Layout |
| `src/main.jsx` | 引入 BrowserRouter（或 HashRouter，dmg 下更稳） |
| `main.cjs` | 加 `preload.js`（contextBridge 暴露最小 API）+ macOS activate 处理 |
| `package.json` | 修正 build 配置（删计算器残留 appId），加 `hash-router` 依赖 |

### 删除/归档（安全，git 可恢复）

- 归档：`backend/*_backup*.js`(10+) 、`backend/brain_wrong_dispatch.js`、5 个整目录备份（`backend_backup_v1` 等，移到 `~/Desktop/_Godan_archive/`）
- 删除：`desktop/` 空壳、`backend/desktop/` 模板、`backend/agent.js`、`backend/tools.js`、`agents/` 下 6 个死代码文件（保留 manager.js）、根目录 `hello.txt/test*.txt/index_counter_backup.html/old_counter_index.html/tools.js`
- 保留：`backend/brain_new.js`？——不，一并归档（死代码）

---

## 二、开发顺序（14 天，每步含验证）

### 第 1 周：地基（清理 + BYOK + 模型层）

**D1 清理死代码与备份**（0.5 天）
- 动作：归档/删除上表「删除/归档」项；`git add -A && git commit -m "chore: v2-lite 前清理"`
- 验证：`node --check backend/*.js` 全过；启动 server 跑一次「你好」返回正常；`git status` 干净

**D2 API Key 存储模块**（1 天）
- 动作：写 `keyStorage.js`；`server.js` 加 `GET/POST /api/settings`（GET 只返回 `{hasKey:true, model, baseUrl}`，**永不回传 key 明文**）
- 验证：`curl POST /api/settings {apiKey:"sk-test"}` → 200；`security find-generic-password` 能看到条目（或加密文件存在）；GET 返回 hasKey 且无明文

**D3 模型抽象层 llm.js + brain 接入**（1.5 天）
- 动作：写 `llm.js`（OpenAI 兼容 chat + JSON 清理 + 重试）；`brain.js` 改调 llm.js（system prompt 不变）；builder/patchBuilder 改调 llm.js
- 验证：`node -e` 单测 llm.js（用真实 DeepSeek Key 发最小请求返回 200）；`curl /chat "你好"` 走通；`node --check` 全过

**D4 前端工作台骨架**（1.5 天）
- 动作：装 `react-router-dom`；写 `Layout.jsx` + 路由；`ChatView.jsx` 从 Home.jsx 迁移；激活 `styles/godan.css`（去掉内联样式改 className）
- 验证：`npm run dev` → 浏览器打开 → 侧栏三页可切换；聊天页发消息有响应；`npm run build` 通过

**D5 设置页 SettingsView**（1 天）
- 动作：API Key 输入（type=password）+ 模型下拉（deepseek-chat / gpt-4o-mini / 自定义 baseUrl）+ 「测试连接」按钮（调 llm.js 发最小请求）
- 验证：填 Key → 测试连接 ✅ 绿色；刷新页面 Key 仍在（已存 Keychain）；填错 Key → 红色错误提示

### 第 2 周：体验闭环（预览 + 项目 + 测试 + 打包）

**D6 项目列表 ProjectsView**（1 天）
- 动作：`server.js` 加 `GET /api/projects`（读 projectManager，附项目大小/文件数）；`DELETE /api/projects/:name`；写 `ProjectsView.jsx`
- 验证：页面列出所有项目（含之前 59 个）；点删除 → 目录消失 + 注册表更新；刷新列表正常

**D7 预览 PreviewPane**（1.5 天）
- 动作：写 `previewServer.js`（静态服务 + 路径防护）；`GET /preview/<name>/` 服务 `index.html`；ChatView 完成后自动切到预览标签
- 验证：创建/选择一个 web 项目 → iframe 内显示页面可交互；`curl /preview/../etc/passwd` 被拦截 403；`open` 系统调用可保留（预览失败时兜底）

**D8 builder 分块 + 失败重试**（1 天）
- 动作：dispatcher 在空结果时自动重试 1 次；builder files>8 分两批（第二次带「继续生成剩余文件」prompt）
- 验证：正常 create 一次（小项目一次过）；临时断网（注释 baseUrl）→ 返回「重试后失败」明确错误而非静默成功；用「生成完整电商网站」测分块（>8 文件）

**D9 测试截图 + 结果展示**（1 天）
- 动作：tester.js 截图保存；ChatView 显示「✅ 测试通过 (截图)」按钮点击看大图；失败时显示控制台错误
- 验证：跑一个正常项目 → `projects/<name>/_test/screenshot.png` 存在且可打开；制造 JS 错误项目 → 测试失败且错误信息可见

**D10 Electron 打包 + 安全加固**（1.5 天）
- 动作：写 `preload.js`（contextBridge 暴露 `window.godanAPI`）；`main.cjs` 加载 preload + 处理 macOS activate；修正 package.json build 配置；`npm run dist`
- 验证：`npm run dist` 产出 dmg；安装 dmg → 应用启动 → 工作台可用；开发者工具里 `window.require` 为 undefined（contextIsolation 生效）

**D11 端到端收尾**（1 天）
- 动作：完整走一遍朋友视角流程；修复发现的问题；写一页 `README.md`（安装 + 获取 Key 指引）
- 验证：**验收脚本**：① 全新安装 dmg ② 打开设置输 Key ③ 说「做一个番茄钟」→ 预览可交互 ④ 说「把番茄钟改成粉色」→ 原项目被改 + 预览更新 ⑤ 删除项目 ⑥ 重启应用数据仍在

---

## 三、风险与缓解（Lite 版特有问题）

| 风险 | 缓解 |
|---|---|
| 同步请求长任务（>60s）前端超时 | ChatView 用 `AbortController` + 明确「生成中…」状态；fetch 超时 180s（与后端一致） |
| 朋友没有 DeepSeek Key | 设置页默认展示 DeepSeek/OpenAI 申请指引；保留 Ollama 本地选项（llm.js 天然支持 localhost） |
| 分块生成合并出错（两批文件冲突） | 分块只按「新增文件」切，第二批明确「不修改已生成文件」；reviewer 校验文件数 |
| dmg 首次启动 Gatekeeper 拦截 | README 写「右键→打开」指引；后续可做签名（超出范围） |
| Keychain API 在无钥匙串环境失败 | keyStorage.js 降级为 0600 权限加密文件（AES-GCM，密钥派生自本机） |

---

## 验收标准（2 周末）

- [ ] dmg 安装后，非开发者朋友在 5 分钟内完成「输 Key → 创建番茄钟 → 预览」
- [ ] create / modify / 失败注入 三场景回归全过（沿用阶段 0 验证方法）
- [ ] 无任何 `process.env.DEEPSEEK_API_KEY` 引用残留（全走用户设置）
- [ ] `npm run build` + `node --check` 全过，git 提交颗粒度清晰（每 D 一 commit）
