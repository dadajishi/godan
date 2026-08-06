# Godan AI 应用工坊 🐶

用自然语言创建、修改、预览网页应用的 AI 助手。输入你自己的 API Key，狗蛋帮你从零写代码。

> **当前版本**: v1.0.0 (v2 Lite 体验版)
> **平台**: macOS (Apple Silicon / Intel)

---

## ✨ 功能

- 💬 **对话创建** — 说「做一个番茄钟网页」，狗蛋自动生成完整项目
- 🔧 **修改已有项目** — 「把计算器改成深色主题」，狗蛋直接改原文件
- 👁️ **应用内预览** — 生成后立即在应用内查看运行效果
- 📁 **项目管理** — 列表查看、打开、删除你创建的所有应用
- 🔑 **BYOK** — 使用你自己的 API Key（DeepSeek / OpenAI / 任意 OpenAI 兼容端点 / 本地 Ollama）
- 🔐 **安全存储** — Key 加密保存在 macOS 钥匙串，不上传任何服务器

---

## 📦 安装

1. 下载 `Godan-1.0.0-arm64.dmg`
2. 双击打开 DMG，把 **Godan** 拖入「应用程序」文件夹
3. 首次打开：右键点击 App → 选择「打开」（绕过 Gatekeeper 提示，因为当前版本未签名）

> **为什么需要右键打开？**
> 当前为个人体验版，未购买 Apple Developer 证书签名。
> macOS 会提示「无法验证开发者」。右键 → 打开 → 再点「打开」即可。
> 后续正式发布将使用签名版本，无需此步骤。

---

## 🚀 快速开始（5 分钟）

1. **打开 Godan**，进入「设置」页
2. **获取 API Key**：
   - [DeepSeek 开放平台](https://platform.deepseek.com) → API Keys → 创建（推荐，便宜）
   - 或 OpenAI / 其他兼容服务
3. **粘贴 Key** → 点「测试连接」→ 显示「连接成功」
4. 点「保存」→ 状态变为「已配置」
5. 回到「聊天」页，输入：

```
做一个番茄钟网页
```

6. 等待生成 → 点「👁️ 查看预览」→ 完成！🎉

---

## 💡 使用技巧

| 想做什么 | 怎么说 |
|---|---|
| 新建应用 | 「做一个待办事项应用」「生成一个计算器」 |
| 修改应用 | 「把番茄钟改成粉色的」「给计算器加键盘输入」 |
| 进阶需求 | 「做一个贪吃蛇游戏，支持手机滑动操作」 |

- **修改功能**会自动匹配你已有的项目（按名称智能匹配）
- **预览**为沙箱环境，页面脚本可运行；需要完整功能请在浏览器中打开
- 支持 **Shift+Enter** 换行输入

---

## 🔧 开发者

```bash
# 安装依赖
npm install
cd backend && npm install

# 开发模式（前端 + 后端分开跑）
cd backend && node server.js        # 后端 :3001
npm run dev                         # 前端 vite

# 打包 dmg
npm run build && npx electron-builder --mac
```

### 目录结构

```
├── main.cjs          # Electron 主进程（内置后端启动、安全加固）
├── preload.cjs       # 安全桥接层
├── backend/          # 本地服务（Express + 生成流水线）
│   ├── llm.js        # 模型抽象层（任意 OpenAI 兼容端点）
│   ├── keyStorage.js # API Key 加密存储（Keychain）
│   ├── dispatcher.js # 任务编排
│   ├── builder.js    # 代码生成
│   ├── executor.js   # 写盘执行（路径防护）
│   └── previewServer.js # 项目预览静态服务
└── src/              # React 前端工作台
```

### 数据存储

| 数据 | 位置 |
|---|---|
| 生成的网页项目 | `~/Library/Application Support/Godan/projects/` |
| 项目注册表 | `~/Library/Application Support/Godan/projects.json` |
| API Key | macOS 钥匙串（`com.godan.ai`） |

---

## 🛡️ 安全说明

- API Key **仅加密存储在本机**（钥匙串），所有请求直连你配置的服务商
- 渲染进程 **无 Node 访问权**（contextIsolation + sandbox）
- 后端内置 **路径穿越防护** 与 **命令注入防护**
- 删除项目会同时删除对应目录，操作前有确认提示

## 📝 已知限制（体验版）

- 未签名，首次打开需右键确认
- 项目数据在本机用户目录，卸载 App 前建议先导出项目
- 大型项目生成时间较长（同步请求，约 1-3 分钟）
