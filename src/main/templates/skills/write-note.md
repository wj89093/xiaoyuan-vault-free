---
name: write-note
triggers:
  - 帮我写
  - 生成一个
  - 创建文档
---
# write-note — 写作辅助

**目标**：根据提纲或主题生成 Markdown 文档。

## 流程
1. `write _wiki/{topic}/{标题}.md` → 含完整 frontmatter + 正文
2. 等待用户反馈，调整或补充
3. 询问用户是否存档到知识库

## 规则
- 所有页面含完整 frontmatter（title/topic/type/summary/tags）
- 非 .md 产出写入 `_output/`
