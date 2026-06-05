# AGENTS.md — 晓园 Vault 自身开发 Agent 入口

> **本文件用途**：给"开发晓园 Vault 自身代码"的 Agent 阅读（v1.6.1-free 视角）。
> **不是**给"用晓园 Vault 管理知识"的最终用户 Agent 阅读——用户侧应把 `src/main/templates/Agents.md` 复制到自己 vault 根的 `AGENTS.md`。

## 仓库本质

晓园 Vault = **本地知识库文件系统**（不是后端 service），配合任何 AGENTS.md 兼容的 Agent（Anthropic Claude Code / OpenAI Codex / Cursor / Continue.dev / OpenHands 等）工作。

- **仓库根** `xiaoyuan-vault-free/`：本仓库，存放晓园 Vault 开源版源码
- **vault 根** `~/MyVault/`：用户自己创建的 vault 目录，存放用户的知识库

## 工作流手册

晓园 Vault 的"知识库管理工作流"定义在两个地方（**v1.6.1**）：

1. **`src/main/templates/Agents.md` v2.4** —— 完整 7 个场景工作流 + Skill 触发索引
2. **`src/main/templates/skills/*.md`**（v1.6.x 7 个）—— 每个 Skill 一个独立模板：
   - `ingest.md` / `ingest-batch.md` —— 文件摄入
   - `query.md` —— 问答
   - `lint.md` —— 健康检查
   - `stats.md` —— 统计
   - `log.md` —— 操作日志
   - `conversation-summary.md` —— 对话摘要存档

**已废弃**（v1.6.1 删除）：`write.md`（跟 ingest 重叠）、`list-sessions.md`（无 UI 面板）

## 工具约定

晓园 Vault Agent 用 **4 个原子工具**（read / write / edit / bash）操作 vault 文件 + 文件夹：

- **不用 HTTP 协议**（v1.4 整合时已删 v1.3.1 的 skill-* HTTP 模板）
- Agent 工具栈由 Agent 自身提供（OpenClaw MCP / Claude Code 内置 / 自建），晓园不调度
- Free 仓库**不包含**自研 Agent 实现（Pro 仓库的 `services/agent/` + `ai/SelfAgentAdapter.ts` 不在 Free 仓库）

## 核心规则（晓园 vault 通用）

- `_raw/` 只读，**永不修改**
- 路径必须 vault 相对，**禁止 `..` 和绝对路径**
- 产出 → `_output/`，wiki → `_wiki/`，非 .md 附件不散落根目录
- 操作完成后追加 `log.md`（append-only，不重写历史）
- 不确定时诚实说明，**不编造信息**

## vault 目录结构（v1.6.1 完整布局）

```
vault/
├── _raw/{YYYY-MM}/                       ← 原材料（只读）
├── _wiki/{topic}/                        ← 知识库
├── _briefing/
│   ├── {YYYY-MM-DD}.md                   ← 每日简报
│   └── conversations/{YYYY-MM-DD}/       ← 对话摘要（conv-HHMM.md）
│       └── conv-HHMM.md
├── _schema/                              ← 领域 schema
├── _lint/                                ← Lint 报告
├── _output/                              ← Agent 产出物（非 .md 文件）
├── log.md                                ← 操作日志（append-only）
├── index.md                              ← Agent 导航索引（最重要）
└── LLM-wiki.md                           ← AI 控制平面
```

## Skill 模板 ↔ UI 面板接口对齐（v1.6.1）

- `conversation-summary.md` frontmatter 5 字段（`date/time/title/topic/sources`）= `MemoryPanel.ConversationSummary`
- `lint.md` 输出 5 类（`totalFiles/orphanPages/deadLinks/stalePages/contradictions`）= `LintPanel.ParsedLintReport.stats`
- `skills-templates.test.ts` 9 个对齐断言锁住

## 用户侧接入（v1.6.1）

最终用户接入晓园 Vault 的步骤：

1. 安装晓园 Vault 开源版（macOS / Windows / Linux）
2. 创建 vault 目录（如 `~/MyVault/`）
3. 把 **`src/main/templates/Agents.md` 全文**复制到 `~/MyVault/AGENTS.md`（这是给"用晓园的 Agent"读的）
4. 打开任何 AGENTS.md 兼容 Agent，进入 vault 根 → Agent 自动加载 → 用 4 个原子工具工作

> **注意**：Free 仓库的 SettingsPanel 暂未提供 Skill.md 编辑 UI（Pro 仓库的 SkillSection 6 useState 编辑器不在 Free 仓库）。如需自定义 Skill.md，**直接编辑 `src/main/templates/skills/*.md` 然后重新构建**。

## 文档导航

| 文档 | 用途 |
|------|------|
| `AGENTS.md`（本文件）| 给"开发晓园 Vault 自身"Agent 的入口 |
| `docs/ENGINEERING_MAP.md` | Free 仓库工程导航（v1.6.1）|
| `docs/SKILL_WORKFLOW.md` | 7 个 Skill 模板 + AGENTS.md 工作流（v1.6.x 重写）|
| `docs/DEPLOY.md` | 构建 / 打包指南（v1.3+，部分需更新）|
| `docs/E2E_TESTING.md` | 跨设备手动 E2E 测试手册（v1.6.1 新增）|
| `CHANGELOG.md` | 版本变更记录（v1.6.1 头部已同步）|
| `src/main/templates/Agents.md` | 用户侧 vault AGENTS.md 模板（v2.4）|
| `src/main/templates/skills/*.md` | 7 个 Skill 模板（v1.6.x）|
| `src/main/templates/system.md` | 核心规则详细说明 |
| `src/main/templates/LLM-wiki.md` | AI 控制平面 |
