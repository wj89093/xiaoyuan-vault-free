---
name: query
triggers:
  - 查一下
  - 搜索
  - 帮我找
  - 有没有
  - 文档
noTriggers:
  - 昨天
  - 上次
  - 之前讨论
  - 还记得
  - 帮我回忆
---

# query — 知识库全文搜索

**目标**：在 \_wiki/ 知识库中找到与用户问题最相关的文档。

## 流程

1. `bash node server/tools/fts_search.js "关键词"` → 全文搜索 \_wiki/，BM25 排序，返回高亮片段
2. `read` top 1-2 匹配页面 → 获取完整内容
3. 综合回答，引用 `[[来源页面]]`

## 参数

- `fts_search.js` 可选 `--topic` 限定范围，`--limit` 控制数量（默认5）
- 无结果时：诚实说明，建议用户换个关键词

## 示例

```
用户: "查一下合同模板"
Agent: bash node server/tools/fts_search.js "合同 模板"
       → 找到 3 条...
       → read _wiki/合同管理/合同模板规范.md
       → 回答引用 [[合同模板规范]]
```
