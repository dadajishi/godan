# Godan 狗蛋 🐶

macOS 电脑操作 Agent：用自然语言创建、修改网页应用，**并直接操控你的电脑完成多步骤任务**——打开应用、操作界面、等待条件、失败自修复。

> **当前版本**: v1.1.0（电脑操作 Agent 版）
> **平台**: macOS (Apple Silicon / Intel)

---

## ✨ 功能

### 🖥️ 电脑操作 Agent（v1.1 新增）

- **AX 界面操控** — 读取控件树、按名称/角色定位、精确点击、读取控件值验证（辅助功能，毫秒级）
- **应用管理** — 打开/关闭/重启/检测应用、窗口列表与激活
- **文件系统 + 终端** — 完整文件操作、shell 命令执行
- **Watch 等待** — 「等 Blender 渲染完成再打开结果」「等下载完成再移动文件」：等待条件满足自动继续，等待期间不消耗 token
- **任务状态机** — 每个任务实时可见：规划中→执行中→验证中→完成；可取消、可重试；进程崩溃后从 checkpoint 恢复
- **失败自修复** — 13 类错误自动分类（AX 找不到/应用未运行/build 失败…），结构化恢复计划，最多重试 N 次，绝不无限循环
- **权限系统** — SAFE / 需确认 / 危险 三级；系统文件写、凭证访问直接拦截；未知命令默认需确认（fail-closed）
- **视觉兜底** — AX 无法处理的场景（自绘 UI/Canvas）自动降级视觉分析（可选）

### 🛠️ 原有能力（AI 应用工坊）

- 💬 **对话创建** — 说「做一个番茄钟网页」，狗蛋自动生成完整项目
- 🔧 **修改已有项目** — 「把计算器改成深色主题」，狗蛋直接改原文件
- 👁️ **应用内预览** — 生成后立即在应用内查看运行效果
- 📁 **项目管理** — 列表查看、打开、删除你创建的所有应用
- 🔑 **BYOK** — 使用你自己的 API Key（DeepSeek / OpenAI / 任意 OpenAI 兼容端点 / 本地 Ollama）
- 🔐 **安全存储** — Key 加密保存在 macOS 钥匙串，不上传任何服务器

---

## 📦 安装

1. 下载 `Godan-1.1.0-arm64.dmg`
2. 双击打开 DMG，把 **Godan** 拖入「应用程序」文件夹
3. 首次打开：右键点击 App → 选择「打开」（绕过 Gatekeeper 提示，因为当前版本未签名）

> **为什么需要右键打开？**
> 当前为个人体验版，未购买 Apple Developer 证书签名。
> macOS 会提示「无法验证开发者」。右键 → 打开 → 再点「打开」即可。

4. **首次使用电脑操作功能**：系统设置 → 隐私与安全性 → 辅助功能（+ 屏幕录制，如用视觉）→ 添加 Godan

---

## 🚀 快速开始（5 分钟）

1. **打开 Godan**，进入「设置」页
2. **获取 API Key**：
   - [DeepSeek 开放平台](https://platform.deepseek.com) → API Keys → 创建（推荐，便宜）
   - 或 OpenAI / 其他兼容服务
3. **粘贴 Key** → 点「测试连接」→ 显示「连接成功」
4. 试试这些指令：
   - 「打开计算器，计算 123*456，告诉我结果」← 电脑操作
   - 「做一个番茄钟网页」← 应用创建
   - 「等 /tmp/result.txt 出现后读取内容汇报」← Watch 等待
   - 「把桌面上的 test.txt 移到下载文件夹」← 文件操作（会请求确认）

---

## 💡 使用技巧

- 任务执行中可随时点 **⏹️ 取消**；失败后点 **🔄 重试**
- 危险操作（删除/网络/系统路径）会弹确认，点「批准执行」才继续
- 长任务（几分钟）不会被 HTTP 超时打断——任务在后端持续运行，前端实时刷新

---

## 🔧 开发者

```bash
# 安装依赖
npm install
cd backend && npm install

# 开发模式（前端 + 后端分开跑）
npm run dev            # 终端1: vite (5173)
node backend/server.js # 终端2: 后端 (3001)
npm run electron       # 终端3: Electron 窗口

# 测试与基准
node backend/tests/permissions-shell.test.js   # 权限安全回归 (64 用例)
node backend/tests/security-audit.test.js      # 综合安全审计 (28 项)
npm run bench                                  # 可靠性基准 (45 单元 + 4 真实任务)

# 打包
npm run dist           # dmg + zip (release/)
```

### 目录结构

```
main.cjs            Electron 主进程（生产模式内置后端）
preload.cjs         安全桥接
backend/
  server.js         HTTP API (3001)
  taskManager.js    任务状态机 + checkpoint 持久化
  computerAgent.js  ReAct 决策循环（Planner/Executor/Verifier）
  replanner.js      失败分类 + 恢复计划
  workingMemory.js  工作记忆
  envContext.js     环境摘要（AX 快照复用）
  permissions.js    三级权限 + shell 静态分析
  tools/            AX / 文件系统 / shell / 截图 / watch 等工具
  benchmark.js      可靠性基准
src/                React 前端 (vite)
```

### 数据存储

| 数据 | 位置 | 说明 |
|---|---|---|
| API Key | macOS 钥匙串 | 加密存储 |
| 项目 | `~/Desktop/狗蛋项目/` + `backend/projects.json` | 项目文件在桌面 |
| 任务 | `backend/tasks/` | checkpoint（保留最近 100 个） |
| 截图 | `backend/screenshots/` | 上限 200 张 / 500MB 自动清理 |
| 日志 | `backend/oplog.jsonl` | 操作日志 |

---

## 🛡️ 安全说明

- **三级权限**：SAFE（读/观察）→ CONFIRM（删除/网络/写/未知命令，弹窗确认）→ DANGEROUS（系统路径/凭证/不可逆，直接拒绝）
- **fail-closed**：无法可靠判定的操作默认需要确认，绝不静默放行
- **shell 静态分析**：`sh -c` 内层命令、pipeline 每段、解释器内联代码（node/python `-e`/`-c`）全部递归检查；`rm -rf /`、`sudo`、格式化等直接拒绝
- **凭证保护**：密码框输入需要确认；token/密码等敏感字段绝不写入日志
- **Key 只存本机**：密钥加密存 macOS 钥匙串，所有 AI 请求直连你配置的服务商，无任何中间服务器

---

## 📝 已知限制

- **未签名**：需右键打开绕过 Gatekeeper（正式版将签名）
- **辅助功能权限**：首次使用电脑操作需在系统设置授权
- **视觉分析可选**：默认使用 AX 控件（快且省 token）；视觉模型（如 `ollama pull qwen2.5vl:3b` 或 OpenAI 视觉模型）用于自绘 UI/画布等 AX 无法处理的场景
- **Windows/Linux**：电脑操作功能当前聚焦 macOS；Web 应用创建功能跨平台可用
- **单机使用**：数据存本机，无云同步

---

## 📄 License

[MIT](LICENSE)
