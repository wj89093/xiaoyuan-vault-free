---
name: conversation-summary
triggers:
  - 记录一下
  - 存档这个对话
  - 保存讨论
---

# conversation-summary — 对话存档

**目标**：将重要对话存档到 `_briefing/conversations/`。

## 触发条件

- 对话涉及重要决策、方案选择、偏好确认
- 用户明确要求"记录一下"
- 对话超过 5 轮且有实质性结论

## 不触发

- 纯闲聊、简单问答、用户不需要记录

## 流程

1. `bash mkdir -p _briefing/conversations/{YYYY-MM-DD}`
2. `write _briefing/conversations/{YYYY-MM-DD}/conv-HHMM.md`

## 内容结构

```markdown
# {对话主题}

## 讨论了什么

## 关键决策

## 相关文件

## 下一步
```
