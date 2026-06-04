# Agents.md — 晓园 Vault Agent 工作流规范

> 本文件定义 Agent 在不同场景下的行为规范和工作流程。
> 版本：v2.4 | 更新：2026-06-02
>

> **📝 写入前必读** [MARKDOWN_CAPABILITIES.md](./MARKDOWN_CAPABILITIES.md) — 晓园 Vault 支持的编辑器扩展（WikiLink / Mermaid / Callout / Math / Frontmatter / Task / 嵌入），写入时主动用这些语法。

---

## Skill 触发索引

> Agent 根据下表判断用户意图 → 跳到对应章节执行。

| Skill                  | 触发词                             | 自动？                |
| ---------------------- | ---------------------------------- | --------------------- |
| `ingest`               | 帮我整理, 摄入, 导入, ingest       | ❌                    |
| `query`                | 查一下, 搜索, 帮我找, 有没有, 文档 | ❌                    |
| `lint`                 | 健康检查, 检查知识库, lint         | ❌                    |
| `write`                | 帮我写, 生成一个, 创建文档         | ❌                    |
| `stats`                | 统计, 看看知识库, 知识库情况       | ❌                    |
| `list-sessions`        | 看看之前的对话, 列出聊天记录       | ❌                    |
| `log`                  | —                                  | ✅ 任何操作后自动追加 |
| `ingest-batch`         | 导入 \_raw/ 里的所有文件           | ❌                    |
| `conversation-summary` | 记录一下, 存档这个对话, 保存讨论   | ❌                    |

**不触发** `conversation-summary`：纯闲聊 / 简单问答 / 用户明确表示不需记录。

---

## 场景分类

---

## 1. Ingest（文件摄入）

**触发条件：**

- 用户向 `_raw/` 导入新文件
- 用户说"帮我整理这个文件"、"摄入这个文件"

**执行流程：**

```
1. read(index.md)                      → 了解已有哪些 topic（避免重复创建）
2. read(_raw/{YYYY-MM}/{filename})     → 读当月子目录，不扫全 _raw/
3. 分析内容：
   - 判断 topic（优先复用 index.md 中已有 topic，必要时自创）
   - 判断 type（document/note/meeting/email/research/reference/idea）
   - 生成 summary
   - 提取 tags（3-5 个）
4. write(_wiki/{topic}/{title}.md, frontmatter + 正文)
5. edit(index.md)                      → 更新索引（新增/更新 topic 条目 + 页面链接）
6. edit(log.md, lastEntry, newEntry)   → 追加操作日志（append-only，不重写历史）
```

**⚠️ 注意事项：**

- `_raw/` 是只读原材料，**永远不修改**
- ingest 完成后**不要**再调用 bash ingest.js（全量 pipeline 已由 step 2-4 完成）
- 批量 ingest → 逐个 read \_raw/YYYY-MM/，不用 ls \_raw/ 全量列出

**输出格式：**

```
✅ 已摄入：合同模板.docx
   → topic: 合同管理
   → type: document
   → 摘要: 标准化合同模板，含甲乙方信息、条款模板
   → 页面: _wiki/合同管理/合同模板.md
```

---

## 2. Query（问答）

**触发条件：**

- 用户向 AI 提问
- 用户说"查一下"、"帮我找"

**执行流程：**

```
1. read(index.md)                        → 先看库里有哪些 topic（索引文件）
2. 根据关键词匹配已知 topic：
   - 命中已知 topic → 只读 _wiki/{该topic}/ 目录
   - 不确定时才 grep（限定单个 topic，不扫全 _wiki/）
3. read(_wiki/{topic}/{相关文件})         → 读取相关页面内容
4. 综合回答（引用来源用 [[页面名]] 格式）
```

**回答规则：**

- 优先使用知识库内容回答
- 无相关信息时诚实说明
- 引用来源使用 [[文件名]] 格式
- 回答完整
- 有价值的新洞察 → write 存档到知识库

**⚠️ 禁止：**

- `grep -r _wiki/` 全量搜索（按 topic 精准定位到 \_wiki/{topic}/）
- 没有 index.md 先验就盲目全量读文件

---

## 3. Lint（健康检查）

**触发条件：**

- 用户说"健康检查"、"检查知识库"
- Agent 定期自动触发（建议每周一次）

**执行流程：**

```
1. bash("node server/tools/sys_health.js --scope _wiki/")  → 只检查 wiki 目录
2. 分析输出结果，分类汇总：
   - 孤立页（orphan pages）
   - 死链（dead links）
   - 过期页面（stale > 30 天）
   - 字段缺失
3. write(_wiki/Lint报告-{日期}.md, 报告内容)  → 写入报告
4. edit(log.md, lastEntry, newEntry)            → 追加日志
```

**⚠️ 注意：**

- lint **只扫 \_wiki/**，不扫 `_raw/`（原材料不参与健康度评分）
- log.md / index.md / LLM-wiki.md 由 AI 维护，不需要 lint 检查

**输出格式：**

```
📊 知识库健康检查报告

总笔记：{n} 个
孤立页面：{n} 个
死链：{n} 个
过期页面(>30天)：{n} 个
字段缺失：{n} 个

详情：
- [[页面A]] → 孤立页
- [[页面B]] → 死链 [[不存在的页面]]
```

---

## 4. Write（写作辅助）

**触发条件：**

- 用户说"帮我写"、"生成一个"
- 用户提供提纲或主题

**执行流程：**

```
1. write(_wiki/{topic}/{title}.md, frontmatter + 正文)
2. 等待用户反馈，调整或补充
3. 询问用户是否存档到知识库
```

---

## 5. Stats（统计）

**触发条件：**

- 用户说"统计"、"看看知识库情况"

**执行流程：**

```
1. read(index.md)                          → 从索引获取 topic 列表
2. bash("ls _wiki/*/ | wc -l")             → 统计 topic 数量（不扫全量）
3. 可选：bash("ls _wiki/{topic}/ | wc -l")  → 特定 topic 下的文件数
```

---

## 6. List Chat Sessions（列出对话记录）

**触发条件：**

- 用户说"看看之前的对话"、"列出聊天记录"

**执行流程：**

```
read(chat-sessions.json 或 vault/sessions/chat-sessions.json)
```

**输出格式：**

```
📋 AI 对话记录
[abc12345] 合同模板分析 (2026-05-15)
[def67890] 帮我整理会议记录 (2026-05-14)
...
```

---

## 7. Log（追加操作日志）

**触发条件：**

- 任何操作完成后自动追加

**执行流程：**

```
1. read(log.md)                    → 读取现有日志
2. edit(log.md, lastEntry, newEntry)  → 在文件末尾追加新条目
```

**日志格式：**

```
## [2026-05-19 09:15] ingest | 合同模板.docx → 合同管理/合同模板.md
## [2026-05-19 09:20] lint | 健康检查，孤立页 3 个，死链 1 个
## [2026-05-19 09:25] write | 新建 客户管理/index.md
```

---

## 8. Ingest Batch（批量导入）

**触发条件：**

- 用户说"导入 \_raw/ 里的所有文件"

**执行流程：**

```
1. read(index.md)                        → 了解已有 topic
2. bash("ls _raw/{YYYY-MM}/")           → 按月份列待处理文件（不扫全 _raw/）
3. read(_raw/{YYYY-MM}/{filename})      → 逐个读取
4. write(_wiki/{topic}/{title}.md)        → 逐个写入 wiki
5. edit(log.md, ...)                      → 批量追加日志
```

**⚠️ 禁止：**

- `ls _raw/` 全量列出（按月份分批处理）
- ingest 后再调用 bash ingest.js（全量 pipeline 已由 step 2-4 完成）

---

## 9. ConversationSummary（对话摘要存档）

**触发条件：**

- 对话涉及重要决策、方案选择、偏好确认
- 用户明确要求"记录一下"
- 对话超过 5 轮且有实质性结论

**不触发：**

- 纯闲聊 / 简单问答 / 用户明确表示不需要记录

**执行流程：**

```
1. bash("mkdir -p _briefing/conversations/{YYYY-MM-DD}")  → 确保目录存在
2. write(
     "_briefing/conversations/{YYYY-MM-DD}/conv-HHMM.md",
     frontmatter + 摘要内容
   )
```

**摘要内容结构（4 部分）：**

```markdown
# {对话主题}

## 讨论了什么

- 话题1的要点
- 话题2的要点

## 关键决策

- 决定1：...（原因）
- 决定2：...

## 相关文件

- 涉及的页面（\_wiki/...）

## 下一步

- 待完成项
- 待用户确认项
```

**输出格式：**

```
✅ 已存档：_briefing/conversations/2026-05-23/conv-2248.md
```

---

## Tool Calling 优先级

1. **read** — 了解当前状态（先读 index.md 获取上下文）
2. **write** — 创建知识内容
3. **edit** — 追加日志 / 修正内容
4. **bash** — 运行脚本（**必须带 scope 参数，禁止全量操作**）
5. **web_fetch** — 抓取网页内容为 Markdown

---

## 目录结构（晓园 Vault 固定布局）

```
vault/
├── _raw/{YYYY-MM}/         ← 原材料（只读，AI 不修改）
├── _wiki/{topic}/          ← 知识库（按 topic 分类）
├── _briefing/conversations/ ← 对话摘要存档
├── log.md                  ← 操作日志（append-only）
├── index.md                 ← 知识索引（topic 列表）
└── LLM-wiki.md             ← AI 控制平面（本文件）
```

---

## 错误处理

| 错误类型     | 处理方式                         |
| ------------ | -------------------------------- |
| read 失败    | 诚实说明，尝试其他方式           |
| 搜索无结果   | 说明"知识库中没有相关信息"       |
| 工具执行失败 | 记录错误，尝试替代方案或汇报用户 |
| topic 冲突   | 询问用户确认                     |

---

## 退出条件

- 用户明确表示"够了" → 立即停止
- 连续 3 次工具调用无有效产出 → 汇报状态并询问下一步
- 操作完成 → 自动追加日志

---

_本文件由 AI 自动维护，当工作流变更时更新。_
