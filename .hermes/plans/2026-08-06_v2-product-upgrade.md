# Godan v2 产品化升级方案 — AI 开发助手（普通用户版）

> 基于：阶段 0 止血修复完成 + 真实 modify 流程验证通过（2026-08-06）
> 定位：从「开发者自用的本地 Agent」→「普通用户可用的 AI 应用开发产品」
> 核心场景：用户输入自己的 API Key → 用自然语言创建/修改/测试网页应用

---

## 〇、v1 现状（升级基线）

```
Electron 壳 (main.cjs) → React 聊天页 (Home.jsx) → fetch /chat
  → server.js → brain.js(Ollama 路由) → dispatcher.js 编排
  → architect/planner/manager(规则) → builder/patchBuilder(DeepSeek 生成)
  → reviewer(浅检查) → executor(写盘+启动+Playwright测试)
```

**阶段 0 已修复**：密钥入库/Modify 参数错位/失败静默/单字符匹配/路径注入/CORS/记忆容错/中文匹配。
**v1→v2 的核心差距**（已实测确认）：

| 维度 | v1 现状 | v2 目标 |
|---|---|---|
| 用户 | 单机单用户 | 多用户，每人独立空间 |
| API Key | 硬编码 `.env`（DeepSeek 固定） | 用户输入、加密存储、多模型可选 |
| 前端 | 单聊天页 | 工作台（项目列表/预览/日志/设置） |
| 任务 | `/chat` 同步阻塞（几分钟无反馈） | 异步队列 + 实时进度推送 |
| 执行 | 直接本机 `npm install`/`open` | 沙箱化 + 超时 + 资源限制 |
| 失败恢复 | 报错即止 | 自动重试 + repair 闭环 |
| 测试 | Playwright 无截图报告 | 截图 + 报告 + 自动修复循环 |

---

## 一、v2 产品架构

### 1.1 总体拓扑

```
┌─────────────────────────────────────────────────────┐
│  Electron 壳 (安全加固: contextIsolation+preload)    │
│  ┌───────────────────────────────────────────────┐  │
│  │  前端工作台 (React + 路由)                     │  │
│  │  ├ 聊天/开发页     ├ 项目列表/管理页           │  │
│  │  ├ 实时预览页      ├ 测试报告页                │  │
│  │  └ 设置页 (API Key + 模型选择)                 │  │
│  └───────────────┬───────────────────────────────┘  │
│                  │ IPC (preload 安全通道)            │
└──────────────────┼──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│  本地服务层 (Express)                                 │
│  ├ /api/auth        — 本地用户会话 (token)            │
│  ├ /api/keys        — 用户 API Key 加密存储/校验      │
│  ├ /api/tasks       — 任务提交/查询/取消 (异步队列)   │
│  ├ /api/projects    — 项目 CRUD / 打开 / 删除         │
│  ├ /api/preview     — 静态预览服务 (项目→iframe)      │
│  └ /api/events (SSE)— 任务进度/日志实时推送           │
└───────────────────┬──────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────┐
│  任务编排内核 (改造自 v1 流水线)                       │
│  TaskQueue → brain(模型路由) → dispatcher →          │
│  architect/planner/manager(LLM增强) →                │
│  builder/patchBuilder(分块生成) → reviewer(强化) →   │
│  executor(沙箱) → tester(截图报告) → repair(失败闭环) │
└─────────────────────────────────────────────────────┘
```

### 1.2 关键设计决策

**D1. BYOK（Bring Your Own Key）— 产品成立的前提**
- 用户首次启动在设置页输入 API Key，**不经过任何云服务器**，只存本机
- 加密存储：macOS 用 Keychain（`security` 命令 / keytar 库），Windows/Linux 用 DPAPI/加密文件
- 支持 OpenAI 兼容协议（DeepSeek/OpenAI/通义/GLM/本地 Ollama 均可）——只需 base_url + key + model 三要素
- Key 校验：保存时发一次最小请求验证有效性，失败即提示

**D2. 多用户隔离**
- 单机多用户：每用户独立目录 `~/.godan/users/<uid>/`（projects/、memory/、settings/）
- 会话用本地 token（生成随机 token 存内存 + 加密文件），无需网络注册
- v2 暂不做云同步/远程访问（见风险 R7）

**D3. 任务异步化 + 实时反馈（普通用户能等的关键）**
- `/chat` 改为：提交任务 → 立即返回 `taskId` → 后台队列执行 → SSE 推送阶段进度
- 前端工作台显示：当前阶段（规划→生成→写入→测试）、实时日志、每阶段耗时
- 支持取消任务（kill 执行中的子进程）

**D4. 执行沙箱（本地生成代码有真实风险）**
- 每个任务在**独立临时工作目录**构建，成功后再原子替换到项目目录
- `npm install` 改为 `spawn` + 超时（已部分修复）+ 输出截断 + 资源限制
- 写盘白名单：仅允许项目目录内（已实现路径校验，需加绝对路径规范化）
- 可选：Docker 沙箱模式（v2.1，见风险 R4）

**D5. 失败自动闭环（v1 最大的体验坑）**
- builder 返回空/解析失败 → 自动重试 1 次（换 temperature/简化 prompt）
- reviewer 不通过 → 自动进入 repair 循环（最多 2 轮：问题清单 → LLM 修复 → 复审）
- 测试失败 → 附截图 + 错误信息 → 可选一键「让 AI 修复」

**D6. 前端工作台**
- 路由化（react-router）：Chat / Projects / Settings
- 项目列表：名称、类型、最后修改、状态徽标、打开/删除
- 预览：内嵌 iframe 指向本地静态服务（`/api/preview/<project>`），替代 `open` 弹窗
- 设置页：API Key 输入（掩码显示）、模型选择、测试开关

---

## 二、当前代码需要哪些模块升级

### 2.1 后端核心（改造）

| 模块 | v1 现状 | v2 升级内容 | 工作量 |
|---|---|---|---|
| `server.js` | 单 `/chat` 同步 | 多路由 + 静态预览 + SSE + 鉴权中间件 | 中 |
| `brain.js` | 固定 Ollama qwen3:4b | **模型抽象层**：读用户配置 (base_url/key/model)，支持 OpenAI 兼容协议 | 中 |
| `dispatcher.js` | 同步编排 | 集成 TaskQueue：进度回调、取消信号、阶段事件 | 中 |
| `architect.js` | 纯关键词规则 | 保留规则做快速路径 + **LLM 增强**（复杂需求时调用） | 小 |
| `planner.js` | 关键词规则 | 同上 | 小 |
| `agents/manager.js` | 规则分配（结果被丢弃） | 修复：真正把 agent 分配结果传给 Builder；或删除并简化 | 小 |
| `builder.js` | 单次 DeepSeek 调用，4000 token 上限 | **分块生成**（大项目分文件批次）+ 上下文裁剪 + 重试 | 中 |
| `patchBuilder.js` | 无 max_tokens、参数已修复 | 加 max_tokens + 与 builder 共用模型层 | 小 |
| `reviewer.js` | 只查 index.html 存在 | 强化：语法检查（node --check）、关键文件完整性、LLM 审查 | 中 |
| `executor.js` | 写盘 + spawn 启动 | 沙箱工作目录 + 超时 + 原子替换 + 进度回调 | 中 |
| `tester.js` | Playwright 无截图 | **截图 + 控制台错误收集 + 报告生成**（HTML/JSON） | 中 |
| `projectManager.js` | projects.json 单文件 | 迁到每用户 SQLite 或 JSON，加 `listByUser/deleteProject` | 中 |
| `memory/` | 状态日志（无人读） | 每用户记忆 + 任务历史 + 项目级上下文注入 | 中 |
| `repair.js` | **死代码** | 激活：接入失败闭环（D5） | 中 |

### 2.2 前端（重写为工作台）

| 模块 | v1 现状 | v2 升级内容 |
|---|---|---|
| `src/Home.jsx` | 184 行单聊天页，全内联样式 | 拆分为组件：ChatView / ProjectList / SettingsView / PreviewPane |
| `src/App.jsx` | 只渲染 Home | 加 react-router + 布局（侧栏导航） |
| `src/styles/godan.css` | 24 个类零使用（死代码） | **激活**：这就是现成的工作台 UI 设计（侧栏+控制台+会话） |
| 新增 `api.js` | 无 | fetch 封装（含 SSE、错误处理、token 头） |
| 新增 `previewPane.jsx` | 无 | iframe 预览 + 刷新 |

### 2.3 Electron 与基础设施

| 模块 | v1 现状 | v2 升级内容 |
|---|---|---|
| `main.cjs` | contextIsolation 已开，无 preload | 加 preload.js 安全 IPC + 应用生命周期完善（macOS activate） |
| `package.json` | electron-builder 配置有 | 修正 appId/productName 冲突（desktop/package.json 还是"计算器"残留） |
| 新增 `keyStorage.js` | 无 | macOS Keychain / 加密文件存储 API Key |
| 新增 `taskQueue.js` | 无 | 串行队列（本地单机先串行）+ 任务状态持久化 |
| 新增 `sse.js` | 无 | SSE 事件发布器 |
| 新增 `previewServer.js` | 无 | 静态文件服务 + 目录穿越防护 |

### 2.4 可删除/归档（v2 前清理）

- `backend/` 下 10+ 个 `*_backup*.js`、5 个整目录备份、`brain_wrong_dispatch.js` 等 → 归档（git 已有历史，本地删除安全）
- `desktop/` 空壳、`backend/desktop/` Vite 模板残留
- 死代码：`agents/backendAgent/frontendAgent/uiAgent/reviewerAgent/testerAgent`、`agent.js`、`tools.js`（未接线）
- 根目录散落垃圾文件（hello.txt/test*.txt/index_counter_backup.html 等）
- 重复项目家族（7 番茄钟/9 计算器）→ 迁移时合并

---

## 三、优先级排序

### P0 — MVP（普通用户能「用起来」，约 2-3 周）

| # | 任务 | 理由 |
|---|---|---|
| 1 | **清理死代码+备份**（2.4） | 不在烂地基上盖楼；git 历史可恢复 |
| 2 | **API Key 管理 + 模型抽象层**（brain.js + keyStorage.js + 设置页） | 产品成立前提——用户必须能用自己的 Key |
| 3 | **任务异步化 + SSE 进度**（taskQueue + server 改造） | 普通用户无法接受 5 分钟无反馈 |
| 4 | **前端工作台骨架**（路由 + 项目列表 + 聊天 + 设置） | 用户可见的最小完整产品形态 |
| 5 | **项目预览 iframe**（previewServer） | 「看到成果」是 AI 开发产品的核心体验 |
| 6 | **多用户目录隔离**（每用户 projects/memory） | 家庭成员/多账号不串数据 |

### P1 — 体验闭环（能「用得顺」，约 2-3 周）

| # | 任务 | 理由 |
|---|---|---|
| 7 | **builder 分块生成 + 重试** | 大项目不再截断失败 |
| 8 | **reviewer 强化 + repair 激活** | 失败自动修复，少打扰用户 |
| 9 | **测试截图 + 报告页** | 「测试过了」要有可视化证据 |
| 10 | **Electron 安全加固 + 打包 dmg** | 能发给别人安装 |
| 11 | **记忆系统启用**（每用户任务历史注入 prompt） | 连续对话不「失忆」 |

### P2 — 规模化（可选，约 1-2 月）

| # | 任务 | 理由 |
|---|---|---|
| 12 | Docker 沙箱执行模式 | 高风险 npm 包的隔离 |
| 13 | 模型用量统计/成本展示 | 用户自付 Key，需要透明 |
| 14 | 项目模板市场（番茄钟/计算器/主页…） | 降低普通用户起步门槛 |
| 15 | 自动更新（electron-updater） | 桌面软件基本要求 |
| 16 | 云端同步/远程访问（v3 方向） | 多设备，需重做鉴权 |

---

## 四、风险点

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | **API Key 安全**：用户 Key 明文落盘/被读取 | 🔴 高 | Keychain/DPAPI 加密；日志永不打印 key（v1 有 `apiKey.length` 日志要删）；前端掩码显示 |
| R2 | **本地任意代码执行**：生成的代码 `npm install` 可能执行恶意 postinstall 脚本 | 🔴 高 | 沙箱工作目录 + spawn 超时（已做）+ 可选 Docker 模式；首次运行提示风险 |
| R3 | **LLM 输出不稳定**：JSON 解析失败/大文件截断/幻觉文件名 | 🟡 中 | 分块生成 + 严格 JSON schema 校验 + 自动重试；reviewer 校验文件路径白名单（已做路径防护） |
| R4 | **供应商/模型差异**：不同 OpenAI 兼容端点行为不一（如 max_tokens 上限、temperature 支持） | 🟡 中 | 模型层做能力探测 + 参数降级；默认 DeepSeek，其余标记「实验性」 |
| R5 | **成本失控**：用户 Key 被大量调用（尤其重试/repair 循环） | 🟡 中 | 每次任务预估 token、重试上限（1-2 次）、任务取消；P2 加用量面板 |
| R6 | **普通用户预期管理**：AI 生成 ≠ 100% 正确，用户可能因失败流失 | 🟡 中 | 明确「预览→测试→修复」流程；失败时给可操作的错误（截图+日志），而非技术栈错误 |
| R7 | **单机多用户局限**：无网络服务，无法远程/协作 | 🟢 低 | v2 明确定位「本地单机产品」，云版列入 v3 |
| R8 | **当前代码债务传导**：v1 死代码/备份未清理就改造，新功能被旧逻辑干扰 | 🟡 中 | P0 第 1 步强制清理；改造时保持阶段 0 已验证的 create/modify 链路可回滚 |
| R9 | **Electron 打包复杂度**：electron-builder 配置残留（计算器 appId）会导致构建问题 | 🟢 低 | P1 统一修正 package.json/build 配置，删 desktop/ 旧壳 |

---

## 五、实施路线建议

```
第 1-2 周  P0-1~2: 清理 → Key 管理 + 模型层 → 设置页
第 3-4 周  P0-3~4: 任务队列 + SSE → 工作台骨架（项目列表/聊天/设置）
第 5 周    P0-5~6: 预览 iframe → 多用户隔离
第 6-8 周  P1-7~9: 分块生成 → repair 闭环 → 测试报告
第 9-10 周 P1-10~11: Electron 打包 + 记忆启用
之后      P2 按需
```

**里程碑**：
- M1（第 4 周末）：内部可用 —— 输入自己的 Key，能创建/预览/修改一个网页项目
- M2（第 8 周末）：发给朋友可用 —— 打包 dmg，失败自动修复，测试有截图
- M3（第 10 周末）：稳定版 —— 记忆、用量、完整工作台

**关键验证**：每个 P0 任务完成时，用「真实 create + 真实 modify + 失败注入」三场景回归（沿用本次已验证的测试方法）。

---

## 六、一句话总结

Godan v2 = **本地优先、BYOK 的「AI 应用工坊」**：普通用户提供 Key，Godan 提供「对话 → 生成 → 预览 → 测试 → 修复」的完整闭环。技术上最大的三个升级是 **模型抽象层（支持任意 OpenAI 兼容端点）、任务异步化（SSE 实时反馈）、执行沙箱（安全兜底）**；最大的三个风险是 **Key 安全、本地代码执行、LLM 输出不稳定**——都已在方案中给出对应缓解措施。
