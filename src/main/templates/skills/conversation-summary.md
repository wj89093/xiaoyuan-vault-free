# Skill conversation-summary（对话摘要存档）

> 把重要对话的结论、决策、偏好存到 _briefing/conversations/

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
   )

## 日志格式
```
```markdown
---
date: 2026-06-04
title: 对话标题
participants: [你, Agent]
decisions:
  - 决策 1
  - 决策 2
tags: [topic1, topic2]
---

## 背景
...

## 关键决策
1. ...

## 后续行动
- [ ] ...
```
```
