# AGENTS.md — 晓园 Vault 工作手册入口

> 给 AI Agent 阅读。任何支持 AGENTS.md 标准的 Agent（Anthropic Claude Code / OpenAI Codex / Cursor / Continue.dev / OpenHands 等）进入 vault 根目录会自动加载本文件。

## 工作手册
完整 9 个场景工作流（Ingest / Query / Lint / Write / Stats / ListChatSessions / Log / IngestBatch / ConversationSummary）在 `src/main/templates/Agents.md` v2.4，顶部有 Skill 触发索引（哪个关键词激活哪个场景）。

## 工具约定
4 个原子工具（read / write / edit / bash），**不用 HTTP 协议**。Agent 直接操作文件 + 文件夹。

## 核心规则（详见 `src/main/templates/system.md`）
- `_raw/` 只读，永不修改
- 路径必须 vault 相对，禁止 `..` 和绝对路径
- 产出 → `_output/`，wiki → `_wiki/`，非 .md 附件不散落根目录
- 操作完成后追加 `log.md`（append-only，不重写历史）
- 不确定时诚实说明，不编造信息

## 用户 Skill 扩展
- 用户可在设置面板写自己的 Skill.md（保存到 `~/Library/Application Support/xiaoyuan-vault/skills/`）
- 默认模板 = `src/main/templates/Agents.md` 全文

## 项目结构（详见 `src/main/templates/LLM-wiki.md`）
```
vault/
├── _raw/{YYYY-MM}/         ← 原材料（只读）
├── _wiki/{topic}/          ← 知识库
├── _briefing/conversations/ ← 对话摘要
├── log.md                  ← 操作日志（append-only）
├── index.md                 ← 知识索引
└── LLM-wiki.md             ← AI 控制平面
```

## 更多
- 核心控制平面：`src/main/templates/LLM-wiki.md`
- 系统规则：`src/main/templates/system.md`
- 工作流 + 触发词索引：`src/main/templates/Agents.md`
- 模板工具：`server/tools/fts_search.js`、`server/tools/memory_search.js`
