# Changelog

## [v1.1.0] — 2026-08-16 — 电脑操作 Agent 版

> 从「AI 应用工坊」升级为「macOS 电脑操作 Agent」：不仅能创建/修改网页应用，
> 还能直接操控你的电脑完成多步骤任务（打开应用、操作界面、等待条件、失败自修复）。

### ✨ 新能力：电脑操作 Agent（P3 系列）

- **P3-1 任务状态机 + 异步任务系统** — 九态状态机（PENDING→PLANNING→RUNNING→VERIFYING→WAITING→SUCCESS/FAILED/RETRYING/CANCELLED）；每步 stepId 全结构化记录（action/input/时间/结果/验证/error/retryCount）；checkpoint 原子落盘，进程崩溃后可恢复；前端实时状态徽标 + 取消/重试按钮
- **P3-2 Working Memory** — 每任务工作记忆（当前应用/窗口/焦点/文件/最近操作/验证结果/变量），步骤间上下文不丢失
- **P3-3 失败自修复 Replanner** — 13 类错误确定性分类（AX_NOT_FOUND/APP_NOT_RUNNING/BUILD_ERROR 等），结构化恢复计划，四道防循环闸（maxReplans 配额/重复失败检测/maxAttempts/连续失败上限）；PERMISSION_DENIED 类不自动恢复、交还用户
- **P3-4 Watch / 事件模式** — 等待条件自动继续（waitFile/waitProcess/waitApp/waitLog/waitValue/waitTree）；等待期间 Agent 零 token 消耗；强制默认超时 60s / 上限 600s；去重与取消
- **P3-5 Environment Context** — 环境摘要注入 Planner（前台应用/窗口/焦点/最近操作），AX 快照复用减少重复探测；不把整棵 AX 树喂给 LLM
- **P3-6 权限系统强化** — SAFE/CONFIRM/DANGEROUS 三级 + 资源级判断（系统路径写→DANGEROUS、删除/网络→CONFIRM、未知命令 fail-closed→CONFIRM）；凭证文件保护、密码框输入检测与 redact、确认队列绑定 taskId

### 🔧 可靠性强化（P4-1）

- **M1 参数 Schema 预验证** — 工具参数缺失/结构/类型在调用前拦截（18 用例）
- **M2 应用解析增强** — open 应用 260 个根因修复（mdfind/lsregister 注册表解析）
- **M3 参数 Schema 补漏** — atLeastOne/shape/numeric 校验（18 用例）
- **M4 paramError 反馈闭环** — PARAM_ERROR 分类 + 修正提示 + 误分类 bug 修复
- **M5 可靠性回归基准** — `npm run bench` 一键跑（45 单元用例 + 4 真实任务）
- **M6 重复成功探索抑制** — 只读探测同指纹第 2 次系统拦截，thrashing 止损（12 步→1-5 步）
- **M6b 视觉验证降级** — GUI 后自动验证优先 AX 读值（计算器任务 17 步 FAILED→6 步 SUCCESS）

### 🛡️ 安全加固（发布前审计修复）

- **S1 shell 权限绕过封堵** — sh/bash/zsh -c 内层命令递归分类；pipeline/命令链每段独立分类；解释器内联代码静态扫描（fs/child_process/os.system 绕过路径无法 SAFE）；命令执行包装器（command/time/xargs）递归；home dotfile 写入 CONFIRM；filesystem 未知动作 fail-closed
- **M1' retryTask 上限** — 最大重试 5 次，防无限重试
- **M2' 截图存储上限** — 200 张 / 500MB 自动清理
- **M3' checkpoint 磁盘上限** — 保留最近 100 个，运行中任务文件保护
- **P0 历史清洗** — git filter-repo 移除历史中 API key 泄露；build.files 排除 .env 与运行时数据文件
- **P1 用户数据出库** — projects.json/last_project.json 移出版本控制，个人路径不入库

### 📝 其他

- GUI 词表误伤修复（"清空计算器输入"不再被误判 CONFIRM）
- GUI 操作后自动验证走 `ui.readValue`（毫秒级）而非视觉分析

## [v1.0.0] — 2026-08 — AI 应用工坊（初始版）

- 自然语言创建/修改网页应用（番茄钟/计算器等）
- 应用内实时预览、项目管理
- BYOK（DeepSeek/OpenAI/Ollama），Key 加密存 macOS 钥匙串
- macOS DMG 分发
