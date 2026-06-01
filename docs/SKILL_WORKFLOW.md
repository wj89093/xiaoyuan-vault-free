# Skill.md 工作流

> 适用：晓园 Vault v1.3+
> 目的：教用户的 Agent 怎么管理晓园 Vault 知识库

## 概述

晓园 Vault 通过 **HTTP POST + SSE** 与用户的 Agent 通信。`system` 字段直接喂"工作手册"（Skill.md），`user_message` 喂用户消息。

**Skill.md 不是协议文档**——它是**教 Agent 怎么干活的工作手册**。协议本身只是 30 行 HTTP/SSE 代码，可以参考 `docs/SKILL_PLUGIN_API.md` 里的示例实现。

## Skill.md 内容

晓园预置的 Skill.md 在 `src/main/templates/skill-plugin-default.md`，包含：

| 章节 | 内容 |
|------|------|
| 1. Vault 是什么 | 目录结构图 + 文件用途 |
| 2. 工作流（4 步） | 读 index → 分析 → 写 → 告诉用户 |
| 3. 关键规则 | ✅/❌ 必须做和永远不要 |
| 4. 工具说明 | Agent 自带工具栈怎么用 |
| 5. 触发场景速查 | "用户说 X → 你做 Y" 表 |
| 6. 输出风格 | 流式、中文、完成后总结 |
| 7. 完整示例 | 端到端 walkthrough |

## 怎么用

### 用户侧

1. 打开 **设置 → Skill.md** → 查看
2. 复制全文，发给 Agent（OpenClaw / Claude Code / 自建服务）
3. **或者**——直接用 Skill.md 作为 system prompt 喂给 LLM

### 接入方（实现 HTTP 端点）

参考 `docs/SKILL_PLUGIN_API.md` 里的 Python / Node.js 模板，30 行代码搞定。

```
POST /agent/run
{ system: "<Skill.md 内容>", user_message, context }

→ SSE 流
data: {"type":"text","content":"..."}\n\n
data: {"type":"done"}\n\n
```

## 自定义 Skill.md

晓园目前**只读**显示默认 Skill.md。如需自定义：

- **方法 1**：复制 Skill.md 内容，自己改，发给 Agent（晓园无关）
- **方法 2**：（未来）用 `skillSave(name, content)` API 存自己的版本

## 与现有协议的关系

晓园原本有 WebSocket/HTTP JSON 协议（见 `AGENT_PLUGIN_API.md`），用于自建远端 Agent 服务，**晓园调度工具**。

**新 Skill.md 模式**：
- Agent 自带工具栈（MCP / Claude Code 工具）
- 晓园**不调度**工具
- 协议更简单（HTTP POST + SSE）
- 用户接入门槛低（30 行代码）

**未来方向**：Skill.md 模式成为主推，旧协议作"高级"选项。
