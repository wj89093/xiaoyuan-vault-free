# 晓园 Vault (开源版)

> 免费的本地知识库 · 类 Obsidian · macOS / Windows / Linux 桌面应用

[![macOS](https://img.shields.io/badge/macOS-13+-blue)] ![Windows](https://img.shields.io/badge/Windows-10+-blue)] ![Linux](https://img.shields.io/badge/Linux-glibc%202.31+-blue)] ![Electron](https://img.shields.io/badge/Electron-34-green)] ![React](https://img.shields.io/badge/React-19-blueviolet)] ![Version](https://img.shields.io/badge/version-1.3.0--free-orange)]

---

## 一句话

**免费的本地知识库，类 Obsidian，AI 原生设计。** 全部数据本地存储。

---

## 这是什么

晓园 Vault 是一个本地知识库 + Skill 化 AI 工作流的桌面应用。

开源版包含：
- ✅ Markdown 笔记编辑（CodeMirror 6）
- ✅ 文件管理（树状结构 + 全文搜索 FTS5）
- ✅ 知识图谱（自动构建）
- ✅ 多 vault 隔离
- ✅ 自动简报
- ✅ **Skill.md 插件** — 接你自己 Agent

开源版**不包含**：
- ❌ 内置 AI Agent（用 Skill.md 插件接你自己的）
- ❌ 剪贴板浮窗
- ❌ AI Chat 浮窗

---

## Skill.md 插件

打开 **设置 → Skill.md** → 配置 endpoint → 复制全文 → 发给你的 Agent（OpenClaw / Claude Code / 自建 LLM）。

**Endpoint 配置**：在 Skill.md 设置面板填入 Agent 服务地址，保存后点「测试」可验证连接。

### 协议支持

| 协议 | 状态 | 说明 |
|------|------|------|
| HTTP | ✅ 可用 | POST `/agent/run` + SSE 流式响应 |
| HTTPS | ✅ 可用 | 同上，TLS 加密 |
| WebSocket | 🚧 TODO | 计划中 |
| Skill 协议 | 🚧 TODO | 计划中 |

**注意**：连接非本地 host（`localhost` / `127.0.0.1` / `::1`）会弹窗二次确认。

### 示例 Agent 服务（HTTP + SSE）

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json

app = FastAPI()
llm = OpenAI()

@app.post("/agent/run")
async def run(req: dict):
    async def stream():
        for chunk in llm.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": req["system"]},
                {"role": "user", "content": req["user_message"]},
            ],
            stream=True,
        ):
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'type': 'text', 'content': chunk.choices[0].delta.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

晓园设置 → Skill.md 旁的 endpoint 填 `http://localhost:8080`。

**OpenClaw 用户**：`http://127.0.0.1:18789` 直接接入，零代码。

### 预置 Skill 模板

8 个常用场景，可直接加载使用或作参考写自己的：

- `ingest` — 文件摄入（读 _raw/ 写到 _wiki/）
- `query` — FTS5 全文搜索
- `recall` — 跨会话/笔记回忆
- `lint` — 质量检查
- `write-note` — 写/更新 markdown
- `conversation-summary` — 对话摘要
- `self-improvement` — 自我改进
- `stats` — vault 统计

### 自己的 Skill

可以保存自己的 Skill.md 到本地（`~/Library/Application Support/xiaoyuan-vault/skills/`），在 Skill.md 区块选择使用。

详细：[`docs/SKILL_WORKFLOW.md`](docs/SKILL_WORKFLOW.md)

---

## 安装

### macOS

```bash
open ~/Downloads/晓园-Vault-1.3.0-free.dmg
# 拖动到 /Applications
```

### Windows

下载 `晓园-Vault-Setup-1.3.0-free.exe`，双击安装。

### Linux

```bash
chmod +x 晓园-Vault-1.3.0-free.AppImage
./晓园-Vault-1.3.0-free.AppImage
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
3. 导入文件到 `_raw/2026-06/`
4. （可选）打开 设置 → Skill.md → 接入你的 Agent

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 34 + React 19 |
| 编辑器 | CodeMirror 6 |
| 数据库 | SQLite + better-sqlite3 + FTS5 |
| 图谱 | D3.js |
| 构建 | electron-vite + electron-builder |

---

## 文档

- [CHANGELOG.md](CHANGELOG.md) — 变更日志
- [docs/SKILL_WORKFLOW.md](docs/SKILL_WORKFLOW.md) — Skill.md 插件工作流
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
| Skill.md 插件 | ✅ | ✅ |
| 内置 AI Agent | ❌ | ✅ |
| 剪贴板浮窗 | ❌ | ✅ |
| AI Chat 浮窗 | ❌ | ✅ |

Pro 版订阅咨询：联系 [新道蓝谷团队](https://github.com/wj89093)

---

## License

MIT © 晓园团队
