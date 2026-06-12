# 晓园 Vault v1.9 — 外部 AI 入门指南

> 给连接到本 vault 的外部 AI（OpenClaw / Claude Code / Cursor / Continue.dev 等）。
> 读完这个文件 + 3 个 `_state/` JSON，你就能在不读其他文件的前提下全面了解 vault。

---

## 🚀 启动后 5 步

### Step 1: 确认你连上了 vault

读取 `_state/VAULT_STATE.json`：

```json
{
  "currentVault": "personal",  // 或 "team"
  "updatedAt": "...",
  "vault": { "path": "...", "name": "..." }
}
```

如果 `currentVault` 是 `null` 或文件不存在 —— 用户还没打开 vault，先问。

### Step 2: 看状态地图

读取 `_state/STATE_MAP.json`：

```json
{
  "updatedAt": "...",
  "files": [
    { "name": "VAULT_STATE", "path": "_state/VAULT_STATE.json", "exists": true, "sizeBytes": 234 },
    { "name": "GRAPH", "path": ".xiaoyuan/graph.json", "exists": true, "sizeBytes": 12345 },
    { "name": "SCHEMAS_INDEX", "path": "_state/schemas/INDEX.json", "exists": false },
    ...
  ],
  "categories": {
    "AI 入门 (先读这两个)": ["VAULT_STATE", "FS_CACHE"],
    "知识图谱": ["GRAPH_SUMMARY", "GRAPH", "FOLDER_MAP"],
    "文件契约": ["SCHEMAS_INDEX", "SCHEMAS"],
    "健康检查": ["LINT_SUMMARY", "LINT_REPORTS"]
  }
}
```

这张地图告诉你 **vault 还有哪些状态文件 + 路径 + 是否存在**。你不用乱 `ls` —— 看 `STATE_MAP` 就行。

### Step 3: 看 vault 顶层结构

读取 `_state/FS_CACHE.json`：

```json
{
  "totalFiles": 42,
  "totalDirs": 5,
  "roots": [
    { "path": "_wiki", "name": "_wiki", "isDirectory": true, "count": 12 },
    { "path": "README.md", "name": "README.md", "isDirectory": false }
  ]
}
```

这告诉你 vault 一级有哪些目录/文件（不用递归 ls）。

### Step 4: 健康度 3 选 1（或全读）

| 关心什么 | 读什么 |
|---|---|
| 图谱健康度 | `_state/graph/SUMMARY.json` |
| 哪些 folder 有 schema | `_state/schemas/INDEX.json` |
| vault 整体健康度 | `_state/lint/SUMMARY.json` |

每个 ~1KB。

### Step 5: 按需 drill-down

如果你需要看 **完整数据**（不是摘要），按 STATE_MAP 里的 `path` 字段 read 即可：

- `STATE_MAP.files[name="GRAPH"].path` = `.xiaoyuan/graph.json`（完整图谱，可能 MB）
- `STATE_MAP.files[name="LINT_REPORTS"].path` = `.xiaoyuan/lint-reports.json`（最近 30 个完整报告）
- `STATE_MAP.files[name="SCHEMAS"].path` = `.xiaoyuan/schemas/`（per-folder schema 源）

---

## 📁 路径约定速查

| 目录 | 内容 | AI 推荐度 |
|------|------|-----------|
| `_state/` | 摘要 + 索引 | ⭐⭐⭐ 默认读 |
| `.xiaoyuan/` | 完整数据源 | ⭐⭐ drill-down |
| `_briefing/` | Agent 内部数据 | ⭐ 私密 |
| `index.md` / `LLM-wiki.md` | 行为规范 + 导航 | ⭐⭐⭐ 启动读 |
| `AGENTS.md` | 工作流（可选） | ⭐⭐ 用户指定才读 |

---

## 🛠 写入文件前必读

> 写入新文件**之前**，先读 `_state/schemas/INDEX.json` 找目标 folder 的 schema 约束。

```json
// _state/schemas/INDEX.json 摘录
{
  "total": 3,
  "confirmed": 2,
  "pending": 1,
  "entries": [
    {
      "folder": "合同",
      "confirmed": true,
      "fieldNames": ["甲方", "金额", "签订日期"],
      "source": ".xiaoyuan/schemas/合同.json"
    }
  ]
}
```

如果有 schema，**先 read 完整 schema** 确认字段要求，再写。否则写入的文件 frontmatter 不全，lint 会报错。

---

## 🔍 调试 / 查历史

| 想查什么 | 读什么 |
|---|---|
| 我之前说过什么 | `_briefing/memory-facts/` 目录 |
| 工具调用历史 | `_briefing/tool-calls.jsonl` |
| 历史 chat | `.xiaoyuan/chat/messages/<sessionId>.json` |

---

## 💡 提示

- **不要 read `.xiaoyuan/index.db`** —— SQLite 二进制文件，**用 IPC 接口**（search / list）查
- **写入时** 优先复用 vault 自带的工具（writeFile / readFile IPC），别自己 `echo` 到文件
- **遇到 broken link** 在 lint/SUMMARY.json 看到 → 查 `.xiaoyuan/lint-reports.json` 找具体源头，再决定要不要修

---

*本指南生成于 v1.9 (2026-06-12)。如 vault 升级到 v1.10+，AI 入门手册可能会更新。*
