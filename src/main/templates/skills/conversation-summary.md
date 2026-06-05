# Skill conversation-summary（对话摘要存档）

> 把重要对话的结论、决策、偏好存到 _briefing/conversations/，MemoryPanel 读取并渲染卡片

## 触发条件
- 记录一下
- 存档这个对话
- 保存讨论

## 不触发
- 纯闲聊 / 简单问答 / 用户明确表示不需记录

## 执行流程
1. bash("mkdir -p _briefing/conversations/{YYYY-MM-DD}")  → 确保目录存在
2. write(
     "_briefing/conversations/{YYYY-MM-DD}/conv-HHMM.md",
     frontmatter + 摘要内容
   )  → MemoryPanel 通过 briefing:getConversations IPC 读取

## 输出格式

### Frontmatter（被 briefing.ts 解析）
```yaml
---
date: 2026-06-05          # YYYY-MM-DD，必填
time: "09:23"             # HH:MM，必填（用于排序 + 卡片 header 显示）
title: 对话标题           # 必填，渲染为卡片大标题
topic: 主话题             # 单个字符串，渲染为卡片 chip（多个用 topic 数组也行，渲染取第一个）
sources:                  # 必填[]，渲染为"相关文件"段
  - _wiki/foo/bar.md
  - _wiki/baz/qux.md
---
```

### 正文 sections（被 briefing.ts 按行解析）
- `## 讨论了什么` — 自由叙述
- `## 关键决策` — 列表项（`- 决策 1`）渲染为"决策"段，最多展示 2 条 + 展开
- `## 下一步` — 列表项（`- 行动 1`）渲染为"下一步"段，最多展示 2 条 + 展开

**注意**：
- frontmatter **没有** `decisions`/`nextSteps` 字段——这两类从正文 sections 解析（保证长内容不被 frontmatter 截断）
- frontmatter **没有** `tags`/`participants` 字段——topic 已涵盖分类；参与者信息写到 `## 讨论了什么` 段
- `relatedFiles`（旧名）= `sources`（frontmatter 现名）—— briefing.ts 用 `sources` 字段

## 完整示例

```markdown
---
date: 2026-06-05
time: "09:23"
title: v1.6 Skill 模板对齐 MemoryPanel
topic: v1.6 迭代
sources:
  - src/main/services/briefing/briefing.ts
  - src/renderer/components/MemoryPanel.tsx
---

## 讨论了什么
MemoryPanel 实际只解析 frontmatter 的 date/time/title/topic/sources + 正文的 关键决策/下一步。
原模板的 participants/tags 是冗余字段，frontmatter 太长会污染卡片 header。

## 关键决策
- conversation-summary 模板改成 MemoryPanel 期望的 5 字段
- `relatedFiles` 改名为 `sources`（frontmatter 实际字段名）
- `participants`/`tags` 信息合并到 `## 讨论了什么` 段

## 下一步
- 改 lint.md 模板（加 ## 输出格式 块）
- 加 skills-templates.test.ts 覆盖 frontmatter 字段
```
