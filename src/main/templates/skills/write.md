# Skill write（写作辅助）

> 帮用户写知识页面（提纲 → 全文 → 存档）

## 触发条件
- 帮我写
- 生成一个
- 创建文档

## 执行流程
1. write(_wiki/{topic}/{title}.md, frontmatter + 正文)
2. 等待用户反馈，调整或补充
3. 询问用户是否存档到知识库

## 注意事项
- 先用 [MARKDOWN_CAPABILITIES.md] 了解晓园支持的扩展（WikiLink / Mermaid / Callout / Math / Frontmatter / Task）
- 写完后用 [[页面名]] 引用相关页面（晓园 KnowledgeGraph 自动连线）
