---
name: xiaoyuan-vault
description: 教你的 Agent 怎么管理晓园 Vault 知识库 — 写入、查询、整理 markdown 笔记
triggers:
  # 意图触发词：用户说这些中文 → 启用本 Skill
  intent:
    - 整理
    - 摄入
    - 摄入文件
    - 整理文件
    - ingest
    - 写入 vault
    - 写入知识库
    - 整理笔记
    - 分类
    - 归档
    - 摄入 _raw
    - 写入 _wiki
    - 查一下 vault
    - 找一下 vault
    - vault 搜索
    - vault 查询
    - 检查 vault
    - vault 健康
    - lint
    - 创建 schema
    - 定义 schema
    - schema 确认
    - 应用 schema
    - 生个趋势图
    - 画个图
    - 生成报告
    - 输出 csv
    - 输出 json
    - 输出 html
  # 路径触发词：用户提到这些路径 → 启用本 Skill
  path:
    - _raw/
    - _wiki/
    - _schema/
    - _output/
    - log.md
    - index.md
    - Agents.md
  # 动作触发词：用户说要做的动作 → 启用本 Skill
  action:
    - 写入
    - 读一下
    - 看下
    - 搜一下
    - 查
    - find
    - ls
    - cat
    - grep
  # 不触发的场景（明确排除）
  exclude:
    - 只是聊天
    - 问问题
    - 计算
    - 翻译
    - 总结外部文件
    - 联网搜索
---

# 晓园 Vault 工作手册

你是一个运行在用户本地文件系统上的 Agent，负责管理用户的 **晓园 Vault** 知识库。
这份文档是你的**工作手册**——告诉你 vault 的结构、规则、和常见操作。

---

## 0. 什么时候用这份 Skill

**用户问的**（或任务包含）下面任一项 → 启用本 Skill：

### 意图触发

- 提到「**整理 / 摄入 / 归档 / 分类 / 写入**」 → 走 §2 工作流
- 提到「**查找 / 搜索 / 查一下 vault**」 → 走 §2（查询分支）
- 提到「**创建 / 定义 schema**」 → 走 §5
- 提到「**检查 / lint / 健康**」 → 走 §7
- 提到「**生图 / 画图 / 生成报告 / CSV / JSON / HTML**」 → 走 §6

### 路径触发

- 任务中提到 `_raw/` `_wiki/` `_schema/` `_output/` `log.md` `index.md` `Agents.md` → 启用

### 动作触发

- 用户说「**写 / 读 / 看 / 搜 / 查**」某个文件 → 启用

### 不要触发（明确排除）

- 只是聊天、问答、计算、翻译、总结外部文件、联网搜索 → **不**启用本 Skill
- 原因：这些跟 vault 无关，别乱动文件

### 拿不准时

**默认启用**。先读 `index.md` 看看 vault 有没有相关的，有就接活，没有就告诉用户"vault 里没找到相关资料"。

---

## 1. Vault 是什么

一个普通的本地目录（用户用 `pwd` 看一眼就知道），里面全是 markdown 文件。

```
~/我的知识库/
├── index.md              ← 主题索引（必读）
├── log.md                ← 操作日志（append-only）
├── Agents.md             ← 工作流定义（就是你正在看的）
├── LLM-wiki.md           ← 工具说明 + frontmatter 规范
├── _raw/                 ← 原始资料（只读！）
│   └── 2026-05/          ← 按月份归档
│       └── foo.pdf
├── _wiki/                ← 结构化笔记
│   └── {topic}/
│       └── {title}.md
├── _schema/              ← 知识领域定义
│   └── {topic}/
│       └── confirmed.md
├── _output/              ← AI 生成的非 md 产物（图片/JSON/CSV/HTML）
│   └── {YYYY-MM-DD}/      ← 按日期归档
│       └── chart.png
└── _briefing/            ← 简报（自动生成，别动）
```

---

## 2. 你的工作流（核心 4 步）

收到用户消息后，按这个流程：

### Step 1：读 `index.md`

```bash
cat {vault_path}/index.md
```

了解 vault 里**已经有哪些 topic**，避免重复创建。

### Step 2：分析 + 决定

根据用户意图，决定：

| 意图                 | 动作                              |
| -------------------- | --------------------------------- |
| "整理 / 摄入 / 写入" | 走 Step 3a（写入）                |
| "查找 / 搜索"        | `grep` / `find` / `read`          |
| "分析 / 总结"        | `read` 文件后输出报告             |
| "创建 schema"        | 写 `_schema/{topic}/confirmed.md` |

### Step 3a：写入新笔记

1. **复用或创建 topic** — 优先用 `index.md` 已有 topic
2. **写文件** — `_wiki/{topic}/{title}.md`，含 frontmatter：

```yaml
---
title: 文章标题
topic: 合成生物学
type: note | document | research | meeting | reference | idea
tags: [tag1, tag2]
created: 2026-06-01
summary: 一句话总结
---
# 正文
```

3. **更新 `index.md`** — 追加新 topic 或新条目
4. **追加 `log.md`** — 一行记录这次操作

### Step 3b：局部编辑

用 `edit` 工具（oldText → newText），不要重写整个文件。

### Step 4：告诉用户做了什么

一句话总结，例：

> "已把 foo.pdf 整理到 `_wiki/合成生物学/xxx.md`，更新了 index.md 和 log.md。"

---

## 3. 关键规则

### ✅ 必须做

- **先读 index.md** — 永远不要跳过
- **遵循 \_schema/** — 已定义的 schema 是真理
- **追加 log.md** — 每次写操作都记录
- **小步前进** — 单次最多处理 3-5 个文件

### ❌ 永远不要

- **修改 `_raw/`** — 原始资料是只读的
- **删除用户文件** — 只能创建/编辑/追加
- **重写 log.md 历史** — append-only
- **创建重复 topic** — 先看 index.md

---

## 4. 工具说明

你**自带**工具栈（OpenClaw MCP、Claude Code 工具、或自建工具），不需要晓园帮你调度。

| 工具                           | 用途       | 晓园路径          |
| ------------------------------ | ---------- | ----------------- |
| `read(path)`                   | 读文件     | 相对 vault 根     |
| `write(path, content)`         | 创建/覆盖  | 同上              |
| `edit(path, oldText, newText)` | 局部编辑   | 同上              |
| `bash(cmd)`                    | shell 命令 | cwd 默认 vault 根 |
| `glob(pattern)`                | 列出文件   | 用 `**/*.md` 等   |

**沙箱规则**：bash 命令白名单（`ls`, `grep`, `cat`, `find`, `wc`, `head`, `tail`, `mkdir`），禁止 `rm`, `mv`, `cp`, `dd`, `sudo`, `curl` 等。

---

## 5. Schema（知识领域定义）

每个 topic 可以在 `_schema/{topic}/confirmed.md` 定义结构化字段。

### Schema 文件格式

```yaml
---
topic: 合成生物学
version: 1.0
confirmed: true
fields:
  - key: type
    label: 类型
    type: select
    options: [研究, 报告, 笔记, 会议, 综述]
    description: 内容类型
    extractHint: 读全文，判断属于哪种类型
  - key: organism
    label: 菌株
    type: text
    description: 提到的工程菌株
    extractHint: 查“菌株”“strain”“宿主”词
  - key: method
    label: 方法
    type: multi-select
    options: [CRISPR, 发酵, 纯化, 表征]
    description: 使用的技术方法
    extractHint: 看 Methods/材料方法部分
---
# 合成生物学 Schema
...
```

**5 种字段类型**：`text` / `select` / `multi-select` / `date` / `number`

**每个字段的必备**：

- `key` — 英文小驼峰（会写入 frontmatter）
- `label` — 中文（给用户看）
- `type` — 字段类型
- `description` — 用途
- `extractHint` — 提示 Agent 怎么提取这个字段

### Schema 的作用

- **写入时**：按 schema 补全 frontmatter（必须）
- **查询时**：可按 schema 字段过滤
- **lint 时**：检查 wiki 页面是否符合 schema

### 创建 Schema

收到 "创建 {topic} schema" 指令后：

```bash
# 1. 看看同 topic 有什么
bash ls _wiki/{topic}/
read _wiki/{topic}/*.md  # 抽几篇看结构

# 2. 推断共同字段
# - type (类型)
# - 几个专业术语字段
# - 几个分类字段

# 3. 写 _schema/{topic}/confirmed.md
write _schema/{topic}/confirmed.md "..."

# 4. 告诉用户
"已为 {topic} 创建 schema：...，接下来用这个 schema 重新整理已有页面吗？"
```

### 应用 Schema 到页面

写入新页面时，按 schema 在 frontmatter 里添加所有字段：

```yaml
---
title: 工程菌株改造
topic: 合成生物学
type: 研究 # ← schema 字段
organism: 大肠杆菌 # ← schema 字段
method: [CRISPR, 表征] # ← schema 字段
created: 2026-06-01
---
```

**不存在 schema 的 topic** — 只用基础字段（title/topic/type/tags/created/summary）。

---

## 6. Output（非 md 产物）

你生成的**不是 .md 的文件**（图片/JSON/CSV/HTML/YAML 等）必须写入 `_output/`，不允许散落在根目录或 `_wiki/`。

### 适用场景

| 产物          | 例子                                |
| ------------- | ----------------------------------- |
| **图表**      | 趋势图、流程图、思维导图（PNG/SVG） |
| **数据文件**  | CSV、JSON、YAML（用于后续工具读取） |
| **HTML 报告** | 交互式可视化、可分享报告            |
| **附件**      | 生成的 PDF、Excel、Word             |
| **中间产物**  | LLM 临时输出（草稿、变体）          |

### 路径规则

```
_output/
├── {YYYY-MM-DD}/          ← 按日期归档（一次任务一个目录）
│   ├── chart.png
│   ├── analysis.csv
│   └── report.html
└── 2026-05-30/
    └── draft-v2.md
```

**why 按日期**：同一天可能生成多个文件，单独目录避免散乱。

### 怎么写

```bash
write _output/2026-06-01/chart.png "<binary data>"

# 多文件用同一目录
write _output/2026-06-01/data.csv "..."
write _output/2026-06-01/report.html "..."
```

### 关键规则

- **永远不在 vault 根目录**生成非 md 文件
- **永远不在 `_wiki/` 里放非 md** — `_wiki/` 是给人类看的结构化笔记
- **不要放 `_raw/`** — 那是用户原始资料区
- **大文件要提酷** — 比如 1 MB 以上的 CSV，别在 chat 里全文显示

### 例外

**生成的 markdown**——是 wiki 笔记 → 写 `_wiki/{topic}/`，不是 `_output/`
**复制 / 转载的文件**——是参考资料 → 写 `_raw/{YYYY-MM}/`，不是 `_output/`

判断标准：这是不是 _AI 生成的中间产物_？是 → `_output/`。

---

## 7. Lint（健康检查）

收到 "检查 vault"、"lint" 指令时，跑健康扫描。

### 检查 2 件事

#### A. 孤儿页面（orphan）

**定义**：没有任何其他页面用 `[[wiki-link]]` 链接到它的页面。

```bash
# 1. 收集所有 [[wiki-link]] 引用
bash grep -rh '\[\[[^]]*\]\]' _wiki/ | sort -u
# → 得到被引用的标题列表

# 2. 收集所有页面标题
bash find _wiki -name "*.md" -exec head -1 {} \;   # 读每页的 title

# 3. 差集 = 孤儿
# 没在引用列表里、且不是 index.md 的页面 → 孤儿
```

**处理**：

- 有内容但孤儿的 → 告诉用户 "这 3 个页面没人链：xxx, yyy, zzz"
- 用户决定：合并 / 重新分类 / 删除

#### B. 缺 frontmatter 字段

**必须有的字段**：`title` / `type` / `status`

```bash
# 读每页 frontmatter，检查 3 个字段是否齐
# 缺的记录到报告
```

**处理**：补全或标记为 `draft`。

### 输出格式

写入 `log.md`：

```markdown
## Lint 报告 (2026-06-01)

- 孤儿页面：3 个
  - \_wiki/合成生物学/foo.md
  - \_wiki/政策/2023-old.md
  - \_wiki/其它/孤立.md
- 缺字段：1 个
  - \_wiki/合成生物学/bar.md 缺 status
```

### 触发方式

| 场景                     | 动作                       |
| ------------------------ | -------------------------- |
| "检查 vault"             | 跑完整 lint（孤儿 + 字段） |
| "找一下孤立页面"         | 只查孤儿                   |
| "哪些页面缺字段"         | 只查字段                   |
| 用户在 UI 点了"立即检查" | 完整 lint，写到 `log.md`   |

---

## 8. 触发场景速查

| 用户说                         | 你做                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| "整理这个文件"                 | read 文件 → 分析 → 写到 `_wiki/{topic}/`（按 schema 补全字段） |
| "查找 \_raw 里的 X"            | `bash grep -r X _raw/`                                         |
| "列出所有 topic"               | `cat index.md`                                                 |
| "创建 {topic} schema"          | 抽几页 → 写 `_schema/{topic}/confirmed.md`（见 §5）            |
| "检查 vault" / "lint"          | 跑健康扫描（孤儿 + 字段，写到 `log.md`，见 §7）                |
| "找一下孤立页面"               | 只查孤儿                                                       |
| "应用 schema 重新整理"         | 读 schema → 重新补全所有页面的 frontmatter                     |
| "生个趋势图 / CSV / 报告"      | 输出到 `_output/{YYYY-MM-DD}/`（见 §6）                        |
| "看一下 \_wiki/synbio/ 有什么" | `bash ls _wiki/synbio/`                                        |
| "log 一下"                     | 追加到 `log.md`                                                |
| "分析 vault 现状"              | 抽样读 + 输出报告（不改文件）                                  |

---

## 9. 输出风格

- **流式** — 边思考边写
- **中文**为主，技术术语保留英文
- **完成后总结** — 一句话告诉用户做了什么
- **出错了** — 立刻说，不要闷头重试

---

## 10. 完整示例

**用户：** "整理 `_raw/2026-05/foo.pdf`"

**你的行动：**

```bash
# 1. 读 index.md 了解 topic
cat index.md
# → 看到有 "合成生物学" topic

# 2. 检查 schema 是否存在
bash ls _schema/合成生物学/ 2>/dev/null
# → confirmed.md 存在

# 3. 读 schema 知道要填什么字段
read _schema/合成生物学/confirmed.md
# → fields: type, organism, method

# 4. 读原始文件
read _raw/2026-05/foo.pdf
# → 内容是关于"工程菌株改造"的研究报告

# 5. 按 schema 写 _wiki/
write _wiki/合成生物学/工程菌株改造-2026-05.md
"""
---
title: 工程菌株改造
topic: 合成生物学
type: research
status: confirmed
tags: [菌株, 改造, 报告]
organism: 大肠杆菌
method: [CRISPR, 表征]
created: 2026-06-01
summary: foo.pdf 中的工程菌株改造研究总结
---

# 正文...
"""

# 6. 更新 index.md
edit index.md
  old: "## 合成生物学"
  new: "## 合成生物学\n- 工程菌株改造-2026-05"

# 7. 追加 log
edit log.md
  old: "(最后一行)"
  new: "(最后一行)\n- 2026-06-01 12:00 写入 _wiki/合成生物学/工程菌株改造-2026-05.md"

# 8. 告诉用户
"已按 schema 整理 foo.pdf 到 _wiki/合成生物学/工程菌株改造-2026-05.md（type=research, organism=大肠杆菌），更新了 index.md 和 log.md。"
```

---

**记住：你不是聊天机器人——你是给用户**管理知识库的管家**。做完了才算完。**
