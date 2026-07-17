# 晓园 Vault (开源版)

> 免费的本地知识库 · 类 Obsidian · macOS / Windows / Linux 桌面应用

[![macOS](https://img.shields.io/badge/macOS-13+-blue)] ![Windows](https://img.shields.io/badge/Windows-10+-blue)] ![Linux](https://img.shields.io/badge/Linux-glibc%202.31+-blue)] ![Electron](https://img.shields.io/badge/Electron-34-green)] ![React](https://img.shields.io/badge/React-19-blueviolet)] ![License](https://img.shields.io/badge/license-MIT-brightgreen)] ![Latest release](https://img.shields.io/github/v/release/wj89093/xiaoyuan-vault-free?label=v1.11.0-free&color=brightgreen)](https://github.com/wj89093/xiaoyuan-vault-free/releases/latest)

> 📝 **最新发布版本**：**v1.11.0-free** (2026-07-16) — [GitHub Releases](https://github.com/wj89093/xiaoyuan-vault-free/releases) 下载安装包 / [CHANGELOG.md](CHANGELOG.md) 看变更详情 / 本文件只讲产品定位，不讲版本细节

---

## 一句话

**免费的本地知识库，类 Obsidian，AI 原生设计。** 全部数据本地存储，无云端依赖。

---

## 这是什么

晓园 Vault 是一个**本地知识库文件系统**（不是后端 service），配合任何 AGENTS.md 兼容的 Agent 工作。

### 开源版包含

- ✅ Markdown 笔记编辑（CodeMirror 6）
- ✅ 文件管理（树状结构 + 全文搜索 FTS5）
- ✅ 知识图谱（自动构建 + 增量重建）
- ✅ 多 vault 隔离
- ✅ 自动简报
- ✅ **AGENTS.md 自动加载**（Anthropic / OpenAI / Cursor / Claude Code / Codex）
- ✅ 用户 Skill.md（写自己的 Skill 工作流）

### 开源版不包含

- ❌ 内置 AI Agent（用 AGENTS.md 接入你自己的）
- ❌ 剪贴板浮窗
- ❌ AI Chat 浮窗

---

## AGENTS.md 集成

仓库根 `AGENTS.md`（10 行标准）是 Agent 通用入口，**任何支持 AGENTS.md 标准的 Agent 自动加载**：

- **OpenClaw** / **Claude Code** / **Codex**
- **Cursor** / **Windsurf** / **Continue**
- **Anthropic** / **OpenAI** SDK

### 工作流

1. Agent 启动 → 自动加载 `AGENTS.md` 索引
2. Agent 看用户意图 → 触发对应 Skill 场景
3. Agent 用 4 个原子工具（read / write / edit / bash）**直接操作 vault 文件**
4. 文件变化 → KnowledgeGraph 自动增量重建（500ms 内）

### 7 个内置 Skill 场景（v1.6.1）

| 场景 | 触发 | 动作 |
|------|------|------|
| `ingest` | 摄入 / 整理文件 | `_raw/YYYY-MM/` → `_wiki/{topic}/` |
| `query` | 搜索 / 查一下 | FTS5 全文搜索 + 引用 |
| `lint` | 健康检查 | 5 类（死链/孤立/过期/矛盾/总数） |
| `stats` | 知识库统计 | topic/文件/节点/边数 |
| `log` | 自动追加 | 任何操作后追加 `log.md` |
| `ingest-batch` | 批量导入 | 一次性 ingest 整个月份 |
| `conversation-summary` | 对话存档 | 摘要到 `_briefing/conversations/` |

详见 [`src/main/templates/Agents.md`](src/main/templates/Agents.md) 顶部索引表 + [`src/main/templates/skills/`](src/main/templates/skills/) 7 个独立模板。

### 自己的 Skill.md

v1.4 仍保留用户写自己 Skill.md 的能力（**设置面板 → Skill.md**），默认模板 = `Agents.md` 全文。

---

## 安装

### macOS

**方式一：DMG 安装（推荐）**

1. 去 [GitHub Releases](https://github.com/wj89093/xiaoyuan-vault-free/releases) 下载最新 `晓园-Vault-*-free-arm64.dmg`（Apple Silicon）或 `*x64.dmg`（Intel）— badge 上方会显示当前最新版本号
2. 双击挂载 DMG
3. **重要**：打开终端，运行以下命令解除安全限制：

```bash
sudo xattr -cr "/Volumes/晓园 Vault/晓园 Vault.app"
```

4. 将 app 拖入 /Applications

**方式二：zip 安装**

1. 在 [GitHub Releases](https://github.com/wj89093/xiaoyuan-vault-free/releases) 下载最新 `晓园-Vault-*-free.zip`，选择你架构的版本
2. 解压后，在终端运行：

```bash
sudo xattr -cr ~/Downloads/晓园\ Vault.app
mv ~/Downloads/晓园\ Vault.app /Applications/
```

### Windows

去 [GitHub Releases](https://github.com/wj89093/xiaoyuan-vault-free/releases) 下载最新 `晓园-Vault-Setup-*-free.exe` (x64)，双击安装。

### Linux

去 [GitHub Releases](https://github.com/wj89093/xiaoyuan-vault-free/releases) 下载最新 `晓园-Vault-*-free.AppImage`，然后执行：

```bash
chmod +x 晓园-Vault-*-free.AppImage
./晓园-Vault-*-free.AppImage
```

> macOS 用户优先下 arm64 dmg（Apple Silicon 原生）。
>
> **macOS 26+ 用户注意**：本应用未签名，首次打开需运行 `sudo xattr -cr` 命令解除 Gatekeeper 限制，详见上方安装说明。

### 从源码运行（开发模式）

```bash
git clone https://github.com/wj89093/xiaoyuan-vault-free.git
cd xiaoyuan-vault-free
npm install
npm run dev
```

---

## 快速上手

1. 启动晓园 Vault
2. 选一个文件夹作为你的 vault
3. （可选）导入文件到 `_raw/2026-06/`
4. 让你的 Agent 读仓库根 `AGENTS.md`，按场景工作

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 34 + React 19 |
| 编辑器 | CodeMirror 6 |
| 数据库 | SQLite + better-sqlite3 + FTS5 |
| 图谱 | D3.js + react-window 虚拟化 |
| 构建 | electron-vite + electron-builder |
| 性能 | React.memo + ErrorBoundary + 手动 chunk 拆分 |
| 优化基础设施 | FileTree 拍平 + Graph 增量重建 + Lazy import |

---

## 性能 (产品视角)

- **500+ 文件 vault 流畅滚动** — FileTree 完全虚拟化，不嵌套
- **大型知识图谱首屏秒开** — lazy + Suspense 加载
- **AI 不白屏** — ErrorBoundary 降级，子组件出错不挂整个 app
- **外部文件修改自动感知** — `fs.watch` + 500ms debounce，Vault 不用手动刷新

具体优化历史和 commit 记录：见 [CHANGELOG.md](CHANGELOG.md)

---

## 文档

- [CHANGELOG.md](CHANGELOG.md) — 变更日志（**版本细节 / commit 列表**）
- [docs/SKILL_WORKFLOW.md](docs/SKILL_WORKFLOW.md) — Skill.md 工作流
- [docs/DEPLOY.md](docs/DEPLOY.md) — 构建 / 部署指南
- [docs/ENGINEERING_MAP.md](docs/ENGINEERING_MAP.md) — 工程导航
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) — 跨设备手动测试手册

---

## 与 Pro 版的区别

| 功能 | 开源版 | Pro 版 |
|------|--------|--------|
| 价格 | 免费 | 付费 |
| Markdown 编辑 / 搜索 / 图谱 | ✅ | ✅ |
| 多 vault 隔离 | ✅ | ✅ |
| 简报自动生成 | ✅ | ✅ |
| AGENTS.md 自动加载 | ✅ | ✅ |
| 用户 Skill.md | ✅ | ✅ |
| 内置 AI Agent | ❌ | ✅ |
| 剪贴板浮窗 | ❌ | ✅ |
| AI Chat 浮窗 | ❌ | ✅ |

Pro 版订阅咨询：联系 [新道蓝谷团队](https://github.com/wj89093)

---

## License

MIT © 晓园团队
