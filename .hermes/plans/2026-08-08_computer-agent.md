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
| P1 | 文件系统 + Shell + 应用启动 + 进程管理 + 权限 + 日志 + ReAct 循环 | 真实请求：打开应用/列目录/执行命令/删除需确认/sudo 被拒 |
| P2 | 截图(screencapture) + 鼠标/键盘(辅助功能权限) + 窗口管理 | 能截图并保存；GUI 操作可用（权限受限时明确提示） |
| P3 | 视觉理解（截图喂视觉模型）+ Agent 自主观察/操作/验证闭环 | 「打开 Blender 加载 fox_character.blend」类任务全自动完成 |

## 测试方式

- curl 直调 /api/computer 各场景（SAFE/CONFIRM/DANGEROUS/多步任务）
- /chat 全流程（brain→dispatcher→computerAgent）真实请求
- Playwright 前端渲染验证（日志列表 + 确认按钮）
