# AGENTS.md — 晓园 Vault 自身开发 Agent 入口

> **本文件用途**：给"开发晓园 Vault 自身代码"的 Agent 阅读（**v1.11.0-free** 视角）。
> **不是**给"用晓园 Vault 管理知识"的最终用户 Agent 阅读——用户侧应把 `src/main/templates/Agents.md` 复制到自己 vault 根的 `AGENTS.md`。
> **最近同步阶段**: v1.9 (两层状态模型) → v1.10 (Preload 重构 + 3 service 测试) → v1.11 (as any 清零 + 2 真实 bug 修复)

## 仓库本质

晓园 Vault = **本地知识库文件系统**（不是后端 service），配合任何 AGENTS.md 兼容的 Agent（Anthropic Claude Code / OpenAI Codex / Cursor / Continue.dev / OpenHands 等）工作。

- **仓库根** `xiaoyuan-vault-free/`：本仓库，存放晓园 Vault 开源版源码
- **vault 根** `~/MyVault/`：用户自己创建的 vault 目录，存放用户的知识库

## 工作流手册

晓园 Vault 的“知识库管理工作流”定义在两个地方（**v1.11.0-free**）：

1. **`src/main/templates/Agents.md` v2.4** —— 完整 7 个场景工作流 + Skill 触发索引
2. **`src/main/templates/skills/*.md`**（v1.6.x 7 个）—— 每个 Skill 一个独立模板：
   - `ingest.md` / `ingest-batch.md` —— 文件摄入
   - `query.md` —— 问答
   - `lint.md` —— 健康检查 (**v1.10+** `maintain.ts` 补测 30 case, **v1.9+** 写到 `_state/lint/SUMMARY.json`)
   - `stats.md` —— 统计
   - `log.md` —— 操作日志（v1.7+ 自动 append）
   - `conversation-summary.md` —— 对话摘要存档

**v1.9+ 新增两层状态模型**：
- `_state/` 目录: 6 个 AI 可读状态文件（VAULT_STATE / FS_CACHE / STATE_MAP / graph/SUMMARY / schemas/INDEX / lint/SUMMARY）
- AI 启动后读 8KB 即全盘了解 vault, 不需递归 ls / 调 IPC / 读完整图谱
- 状态变更触发 SUMMARY 重建: graph save / schema save / lint save

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

## vault 目录结构（v1.11.0-free 完整布局）

```
vault/
├── _raw/{YYYY-MM}/                       ← 原材料（只读）
├── _wiki/{topic}/                        ← 知识库
├── _state/                               ← **v1.9+** AI 可读状态（6 个 JSON/SUMMARY 文件）
│   ├── VAULT_STATE.json                  ← 当前 vault + 切换状态
│   ├── FS_CACHE.json                     ← vault 一级文件树快照
│   ├── STATE_MAP.json                    ← 状态地图（NEW v1.9）
│   ├── graph/SUMMARY.json                ← 图谱健康度（NEW v1.9）
│   ├── schemas/INDEX.json                ← schema 目录索引（NEW v1.9）
│   └── lint/SUMMARY.json                 ← lint 健康度（NEW v1.9）
├── _log/{YYYY-MM-DD}/                    ← **v1.11.0+** post-commit 审计日志（W7+ 套件）
│   └── {actor-safe}-{HHMMSS}.jsonl       ← commit 时自动追加（actor=unknown 红警）
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

> **W7+ 审计**: `_log/` 由 `src/main/templates/hooks/post-commit` 模板自动填充 (首次创建 vault / 老 vault 首次启动 自动安装). UI 通过 `AuditTab` 面板查看 + `AuditNotice` 启动 uncommitted 检查.

## Skill 模板 ↔ UI 面板接口对齐（v1.6.1）

- `conversation-summary.md` frontmatter 5 字段（`date/time/title/topic/sources`）= `MemoryPanel.ConversationSummary`
- `lint.md` 输出 5 类（`totalFiles/orphanPages/deadLinks/stalePages/contradictions`）= `LintPanel.ParsedLintReport.stats`
- `skills-templates.test.ts` 9 个对齐断言锁住

## v1.11.0+ W7+ 审计套件（auto-commit + audit UI）

详见 CHANGELOG.md `## 2026-07-16 — v1.11.0-free` 段。涉及 commit:

- **`60ef290`** feat(vault): auto-commit worker (chokidar 5min debounce, 跟 `fs.watch` 500ms 共存不互扰)
- **`c6d15e5`** feat(audit): post-commit audit UI (双 tab: 日志 / 审计, `AuditNotice` 启动 uncommitted 检查 5 秒自动消失)
- **`2994e5d`** feat(audit): `AuditNotice.onOpenAudit` 直接跳 audit tab (无 panel registry, `useAppUIState.logInitialTab`)
- **`73c5c82`** feat(vault): 启动自动装 post-commit hook (新建 vault + 老 vault 首次启动 `installPostCommitHookIfMissing`)

详细架构: 详见 `_log/` 目录结构说明 + `src/main/services/vault/autoCommitWorker.ts` 源码 + `src/main/ipc/auditHandlers.ts` IPC 实现 + `src/renderer/components/AuditTab.tsx` 渲染层。

**actor=unknown 红警**: 没设 git config user.name 自动 commit 会在 audit tab 标红，提示用户需 `git config user.name "<n>"`。

## 用户侧接入（v1.11.0-free）

最终用户接入晓园 Vault 的步骤：

1. 安装晓园 Vault 开源版（macOS / Windows / Linux）
2. 创建 vault 目录（如 `~/MyVault/`）
3. 把 **`src/main/templates/Agents.md` 全文**复制到 `~/MyVault/AGENTS.md`（这是给"用晓园的 Agent"读的）
4. 打开任何 AGENTS.md 兼容 Agent，进入 vault 根 → Agent 自动加载 → 用 4 个原子工具工作

> **注意**：Free 仓库的 SettingsPanel 暂未提供 Skill.md 编辑 UI（Pro 仓库的 SkillSection 6 useState 编辑器不在 Free 仓库）。如需自定义 Skill.md，**直接编辑 `src/main/templates/skills/*.md` 然后重新构建**。

## 文档导航

| 文档 | 用途 |
|------|------|
| `AGENTS.md`（本文件）| 给"开发晓园 Vault 自身"Agent 的入口（v1.11.0-free 视角）|
| `docs/ENGINEERING_MAP.md` | Free 仓库工程导航（v1.6.1+，待 v1.11.0 更新）|
| `docs/SKILL_WORKFLOW.md` | 7 个 Skill 模板 + AGENTS.md 工作流（v1.6.x 重写）|
| `docs/DEPLOY.md` | 构建 / 打包指南（v1.3+，部分需更新）|
| `docs/E2E_TESTING.md` | 跨设备手动 E2E 测试手册（v1.6.1 新增）|
| `CHANGELOG.md` | 版本变更记录（**v1.11.0 头部**: 6 commits 三层 as any 清零 + 2 bug fix）|
| `src/main/templates/Agents.md` | 用户侧 vault AGENTS.md 模板（v2.4）|
| `src/main/templates/skills/*.md` | 7 个 Skill 模板（v1.6.x，v1.10 lint 测试补足）|
| `src/main/templates/hooks/post-commit` | **v1.11.0+** post-commit hook 模板（自动装）|
| `src/main/templates/system.md` | 核心规则详细说明 |
| `src/main/templates/LLM-wiki.md` | AI 控制平面 |
| `src/main/services/vault/autoCommitWorker.ts` | **v1.11.0+** auto-commit worker（chokidar 5min debounce）|
| `src/main/ipc/auditHandlers.ts` | **v1.11.0+** audit IPC 处理（gitStatus / readAuditLog）|
