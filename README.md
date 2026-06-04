# 晓园 Vault (开源版)

> **v1.5.0-free** · 2026-06-04
> 免费的本地知识库 · 类 Obsidian · macOS / Windows / Linux 桌面应用

[![macOS](https://img.shields.io/badge/macOS-13+-blue)] ![Windows](https://img.shields.io/badge/Windows-10+-blue)] ![Linux](https://img.shields.io/badge/Linux-glibc%202.31+-blue)] ![Electron](https://img.shields.io/badge/Electron-34-green)] ![React](https://img.shields.io/badge/React-19-blueviolet)] ![Version](https://img.shields.io/badge/version-1.4.0--free-orange)] ![License](https://img.shields.io/badge/license-MIT-brightgreen)

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

### 9 个内置 Skill 场景

| 场景 | 触发 | 动作 |
|------|------|------|
| `ingest` | 摄入文件 | `_raw/2026-06/` → `_wiki/` |
| `query` | 搜索关键词 | FTS5 全文搜索 |
| `recall` | 回忆上下文 | 跨笔记/会话回忆 |
| `lint` | 质量检查 | 命名 / frontmatter / 链接 |
| `write-note` | 写/更新 | 新建/修改 markdown |
| `conversation-summary` | 对话结束 | 生成摘要到 `_qa/` |
| `self-improvement` | 自检 | AI 行为模式调整 |
| `stats` | 看统计 | vault 节点/边/文件数 |
| `+` 自定义 | — | 自己写 Skill.md |

详见 [`src/main/templates/Agents.md`](src/main/templates/Agents.md) 顶部索引表。

### 自己的 Skill.md

v1.4 仍保留用户写自己 Skill.md 的能力（**设置面板 → Skill.md**），默认模板 = `Agents.md` 全文。

---

## 安装

### macOS

```bash
open ~/Downloads/晓园-Vault-1.4.0-free.dmg
# 拖动到 /Applications
```

### Windows

下载 `晓园-Vault-Setup-1.4.0-free.exe`，双击安装。

### Linux

```bash
chmod +x 晓园-Vault-1.4.0-free.AppImage
./晓园-Vault-1.4.0-free.AppImage
```

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

## 性能 (2026-06-03 更新)

最近一次性能优化（6 个 commits，详见 [CHANGELOG.md](CHANGELOG.md)）：

| 维度 | v1.4.0 起点 | 现在 | 提升 |
|------|-------------|------|------|
| 主 bundle 大小 | 2,650 KB | **521 KB** | **-80%** |
| FileTree DOM 节点（500+ 文件） | 500+ 嵌套 | **~30 虚拟可见** | **-94%** |
| Graph 增量重建 | 全量 5s | **200ms** | **-96%** |
| SettingsPanel | 649 行 / 15 useState | **51 行 / 0** | -92% |
| KnowledgeGraph 首屏 | 同步加载 2.6MB | **lazy + Suspense** | 首屏不加载 d3 |
| 致命错误防御 | 白屏整个 app | **ErrorBoundary 降级** | 防白屏 |
| 外部文件变化感知 | 不感知 | **500ms 内自动重建** | 新增 |

### 性能优化 Commit 历史

| Commit | 内容 |
|--------|------|
| `041417e` | 拆 SettingsPanel (649→51) + ErrorBoundary + Skeleton |
| `e43ac73` | App.tsx ErrorBoundary wrap + KnowledgeGraph lazy |
| `be2ed63` | FileTree 拍平版 + Graph 增量 IPC |
| `a76ccd4` | FileTree 接 react-window FixedSizeList 完整虚拟化 |
| `cb6ba97` | Editor memo + Bundle code-split (-80%) + 按钮反馈 |
| `dc38909` | Graph 接 file:changed 事件（外部 app 修改感知） |

---

## 文档

- [CHANGELOG.md](CHANGELOG.md) — 变更日志
- [docs/SKILL_WORKFLOW.md](docs/SKILL_WORKFLOW.md) — Skill.md 工作流
- [docs/DEPLOY.md](docs/DEPLOY.md) — 构建 / 部署指南
- [docs/ENGINEERING_MAP.md](docs/ENGINEERING_MAP.md) — 工程导航

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
