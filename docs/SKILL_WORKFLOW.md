# Skill.md 工作流

> 适用：晓园 Vault v1.4+
> 目的：教用户的 Agent 怎么管理晓园 Vault 知识库
> 更新：v1.6.x（删 HTTP 协议、9 → 7 Skill、接口对齐 UI）

## 概述

晓园 Vault **不再用 HTTP 协议**——v1.4 整合时删了 v1.3.1 的 skill-* HTTP 模板，v1.6 起统一走 **AGENTS.md 通用约定**（Anthropic Claude Code / OpenAI Codex / Cursor / Continue.dev / OpenHands 等都兼容）。

**Skill.md 不是协议文档**——它是**教 Agent 怎么干活的工作手册**。Agent 直接用 4 个原子工具（read / write / edit / bash）操作 vault 文件 + 文件夹，**不走网络协议**。

## Skill.md 体系

### 入口

晓园在两个地方暴露 Skill.md：

1. **仓库根 `AGENTS.md`**（10 行）—— 任何 AGENTS.md 兼容 Agent 自动加载
2. **vault 内 `src/main/templates/Agents.md`**（v2.4）—— 默认工作流模板

### 7 个 Skill 模板（v1.6.x）

晓园把"工作流"拆成 7 个独立 Skill 模板（`src/main/templates/skills/`），Agent 按触发词激活：

| Skill | 触发词 | 输出位置 | UI 渲染 |
|-------|--------|----------|---------|
| `ingest` | 帮我整理 / 摄入 / 导入 | `_wiki/{topic}/{title}.md` | FileTree + Editor |
| `query` | 查一下 / 搜索 / 帮我找 | （回复用户）| 无（外部 Agent 处理）|
| `lint` | 健康检查 / 检查知识库 | `_wiki/Lint报告-{日期}.md` | LintPanel（5 类）|
| `stats` | 统计 / 看看知识库 | （回复用户）| 无（外部 Agent 处理）|
| `log` | 自动追加（任何操作后）| `log.md`（append-only）| LogPanel |
| `ingest-batch` | 导入 `_raw/` 里的所有文件 | `_wiki/{topic}/{title}.md` × N | FileTree + Editor |
| `conversation-summary` | 记录一下 / 存档这个对话 | `_briefing/conversations/{YYYY-MM-DD}/conv-HHMM.md` | MemoryPanel（卡片）|

### 已废弃（v1.6.x 删除）

- ~~`write`~~ — 跟 ingest 重叠度高（同样落 `_wiki/`、同样 write 操作），流程缺"问写啥"+"提纲确认"
- ~~`list-sessions`~~ — 指向 `chat-sessions.json`（Pro 仓库 chat 模块产物），Free 仓库无面板渲染

### 注入层（v1.6.0+）

`skill:loadDefault` IPC 把 7 个 Skill 模板 + MARKDOWN_CAPABILITIES.md 拼成 Agent system prompt：

```
<MARKDOWN_CAPABILITIES.md>

---

<ingest.md>

---

<query.md>

...

<conversation-summary.md>
```

Agent 启动时一次性拿到所有 Skill 模板，按触发词匹配激活。

### 接口对齐（v1.6.1）

Skill 模板的"输出格式"必须跟实际 UI 面板渲染字段一致：

| Skill | 对齐面板 | 验证方式 |
|-------|----------|----------|
| `conversation-summary` | `MemoryPanel.ConversationSummary` | briefing.ts frontmatter 解析 |
| `lint` | `LintPanel.ParsedLintReport` | maintain.ts 5 类生成 |

`skills-templates.test.ts` 用 9 个对齐断言锁住这个不变量。

## 怎么用

### 用户侧

1. 打开 **设置 → Skill.md**（v1.6+ 提供的 UI 在 Pro 仓库，Free 仓库暂未做编辑面板）→ 查看默认模板
2. 复制 `src/main/templates/Agents.md` 全文，发给 Agent（Claude Code / OpenClaw / 自建服务）
3. **或者**——把 vault 根 `AGENTS.md` 路径告诉 Agent（任何 AGENTS.md 兼容 Agent 自动加载）

### Agent 接入（4 个原子工具）

```typescript
// read
read({ path: 'index.md' })  // → 文件内容
// write
write({ path: '_wiki/foo/bar.md', content: '...' })  // → 写入文件
// edit
edit({ path: 'log.md', oldText: '...', newText: '...' })  // → 精确替换
// bash
bash({ cmd: 'node server/tools/sys_health.js --scope _wiki/' })  // → 命令输出
```

Agent 工具栈由 Agent 自身提供（OpenClaw MCP / Claude Code 内置 / 自建），晓园不调度。

### 关键规则（详见 `src/main/templates/system.md`）

- `_raw/` 只读，**永不修改**
- 路径必须 vault 相对，**禁止 `..` 和绝对路径**
- 产出 → `_output/`，wiki → `_wiki/`，非 .md 附件不散落根目录
- 操作完成后追加 `log.md`（append-only，不重写历史）
- 不确定时诚实说明，**不编造信息**

## 自定义 Skill.md

晓园预置 7 个 Skill 模板**覆盖常见工作流**。如需自定义：

1. **覆盖默认模板** — 修改 `src/main/templates/Agents.md`（v2.4）+ `src/main/templates/skills/*.md`
2. **用户级 Skill** — Pro 仓库 `SettingsPanel` → SkillSection 可写自己的 Skill.md，存 `~/Library/Application Support/xiaoyuan-vault/skills/`
3. **vault 级 Skill** — 在 vault 根放自定义 `AGENTS.md`（覆盖默认）

## 测试覆盖

- `src/test/skills-templates.test.ts` —— 24 个断言
  - 9 个模板文件存在 + 头格式
  - 4 个 skillHandlers 注入层断言
  - 3 个 vaultHandlers writeSkillTemplates 断言
  - 9 个 v1.6.x 接口对齐断言（frontmatter 字段、移除废弃、sources 替代 relatedFiles、3 个 sections、输出格式块、5 类汇总、字段缺失移除、颜色说明）
  - 2 个 v1.6.x 废弃断言（write.md / list-sessions.md 不应再存在 + AGENTS.md 不引用废弃名）

---

> 历史：v1.3.1 用 HTTP POST + SSE 协议，v1.4 整合时删除并改 AGENTS.md 通用约定。本文档 v1.6.x 重写。
