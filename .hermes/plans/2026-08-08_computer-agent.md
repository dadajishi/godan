# Godan Computer Control Agent 计划（2026-08-08）

> 目标：让狗蛋从「文本聊天 + 生成网页」升级为能真实操作电脑的 Agent。
> 原则：**不推翻现有架构**（brain/dispatcher/llm/memory 全保留），以模块化增量方式接入。

## 现有架构接入点（已确认）

```
POST /chat
  → brain.js        意图路由 {tool: chat|plan}          ← 新增第三出口 computer
  → dispatcher.js   编排                                ← 新增 computer 分支
      chat  → persona.js
      plan  → architect → planner → manager → builder/patchBuilder → reviewer → executor
      computer → computerAgent.js (新)                  ← 计划-执行-观察-验证循环
```

- LLM 统一走 llm.js（BYOK/DeepSeek/Ollama 通用）
- 无流式：/chat 单请求响应，CONFIRM 操作用「待确认队列 + 前端按钮」实现多轮确认

## 新增模块（全部 backend/ 下）

```
backend/
├── tools/                   工具系统（每个工具独立模块）
│   ├── index.js             注册表：name → 工具模块
│   ├── filesystem.js        P1: list/read/write/search/mkdir/move/copy/rename/delete
│   ├── shell.js             P1: exec（DANGEROUS 黑名单）
│   ├── applications.js      P1: open/isRunning/close/restart（macOS open+osascript / win / linux）
│   └── process.js           P1: start(后台)/stop/status/list（本地服务管理）
├── permissions.js           权限分类 SAFE/CONFIRM/DANGEROUS（后端强制，不信任前端）
├── opLog.js                 操作日志（JSONL 追加，userData/oplog.jsonl）
├── computerAgent.js         ReAct 循环：LLM 规划 → 工具执行 → 观察 → 失败重试1轮 → 汇报
```

## 权限等级（permissions.js）

| 等级 | 范围 | 策略 |
|------|------|------|
| SAFE | 查看/搜索/读取/创建文件、打开应用、只读 shell | 直接执行 |
| CONFIRM | 删除文件/目录、覆盖写、批量修改、kill 进程 | 不自动执行 → 进待确认队列，前端按钮批准后单独执行 |
| DANGEROUS | sudo、系统目录写入(/System /etc /usr /Library/Preferences)、rm -rf 根、shutdown/mkfs/dd、磁盘操作 | **直接拒绝**，返回 blocked 说明 |

- 判定规则在权限模块内强制：路径黑名单 + shell 命令黑名单 + 动作类型
- 每个工具返回统一结构 `{success, output, error, exitCode, level, needConfirm?, blocked?}`

## 工具返回统一结构

```json
{ "success": true, "output": "...", "error": null, "exitCode": 0, "level": "SAFE" }
```

## API（server.js 新增）

- `POST /api/computer` `{message}` → 执行任务，返回 `{success, reply, steps[], pendingOps[]}`
- `POST /api/computer/confirm` `{opId}` → 批准执行待确认操作
- `GET  /api/computer/logs?limit=50` → 操作日志

## brain.js 意图扩展

- LLM prompt 增加 computer 判定：「打开/启动/关闭应用、执行命令、操作文件、启动服务、git 操作」→ `tool:"computer"`
- 规则兜底新增 COMPUTER_KEYWORDS，判定顺序改为：plan 强词 → computer 强词 → chat 弱词

## 前端 ChatView

- computer 回复渲染：文本 + 步骤日志列表（工具/动作/等级/结果）+ 待确认按钮（批准 → POST /confirm → 结果追加到会话）

## 阶段划分

| 阶段 | 内容 | 验收 |
|------|------|------|
| P1 ✅ | 文件系统 + Shell + 应用启动 + 进程管理 + 权限 + 日志 + ReAct 循环 | ✅ 已提交 b483a6f，9 项冒烟全过 |
| P2 ✅ | 截图(screencapture) + 鼠标/键盘(cliclick) + 窗口管理 | ✅ 已提交 26b66b2；截图 2940x1912、window.list/focus/getBounds、mouse.move、cliclick 权限全可用 |
| P3 ✅ | 视觉理解（截图喂视觉模型）+ Agent 自主观察/操作/验证闭环 | ✅ 已提交；llm.vision + screenshot.analyze(focus/bounds) + window.getBounds 混合定位；demo 跑通「读屏→输入7→视觉验证91+77」 |
| 异步化 ✅ | 长任务不超时：/api/tasks 提交即返回 taskId，后台执行，前端 1.5s 轮询实时步骤 | ✅ 已提交；128s 视觉任务全程无超时，15 步自主完成（打开→定位→点击7→验证）；连接断开不影响后台 |
| 停止逻辑 ✅ | 决策审查：同参 analyze 去重拦截 + 每任务 analyze 限频 10 次 + GUI 操作后系统自动验证一次 | ✅ 已提交；验收任务步数 15→4（open→analyze→click→自动verify→done），两次实测均收敛完成；拦截后 LLM 换策略而非绕过 |

## P3 实现要点（实测结论）

- 视觉模型：Ollama qwen2.5vl:3b（本地，拉取 3.2GB）；llm.vision 自动发现（当前配置 > Ollama 本地视觉模型 > OPENAI key）
- Ollama 调用需 `num_ctx: 16384`（全屏截图 base64 会超默认 4096）
- 3B 模型局限（实测）：复杂 JSON 输出不稳定（复读模板）→ 用「描述 + 元素列表」简单格式 + 正则解析；全屏图定位小窗口不可靠 → 混合方案：window.getBounds（系统 API 精确窗口坐标）+ screenshot.analyze({bounds, focus}) 区域分析
- Retina 坐标：screencapture 输出物理像素，cliclick 用逻辑像素，analyze 内部按 scale 换算
- 验证闭环：读屏「91+」→ 键盘输入 7 → 视觉验证「91+77」（每次输入生效）
- 改进方向：换更强视觉模型（qwen2.5vl:7b / gpt-4o-mini）可显著提升坐标精度与元素识别

## P2 依赖与权限（已确认）

- cliclick 5.1 已安装（brew）
- 辅助功能权限：✅ 已授予（window.focus / mouse.move 实测成功）
- 屏幕录制权限：✅ 已授予（截图实测成功）
- 截图目录：DATA_ROOT/screenshots/（开发: Godan/screenshots，打包: userData/screenshots）

## 测试方式

- curl 直调 /api/computer 各场景（SAFE/CONFIRM/DANGEROUS/多步任务）
- /chat 全流程（brain→dispatcher→computerAgent）真实请求
- Playwright 前端渲染验证（日志列表 + 确认按钮）
