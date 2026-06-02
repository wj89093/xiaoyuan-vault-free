---
name: recall
triggers:
  - 昨天
  - 上次
  - 之前
  - 还记得
  - 帮我回忆
  - 讨论了什么
  - 什么决定
  - 历史
  - 回忆
---

# recall — 记忆回溯

**目标**：从对话记忆中找回过去的讨论、决策、偏好、事实。

## 流程

1. `bash node server/tools/memory_search.js "关键词" [--days 7]` — 搜索最近7天记忆
2. 命中 → 引用关键决策/偏好/事实回答
3. 无命中 → 诚实说明"没有相关记忆"

## 参数

- `--days N`：搜索最近N天（默认7）
- `--date YYYY-MM-DD`：指定日期

## 示例

```
用户: "昨天讨论的那个Agent设计，最后怎么定的？"
Agent: bash node server/tools/memory_search.js "Agent 设计"
       → [2026-05-27] 增量记忆:
         - 决策: 自研AgentLoop，完全剥离pi-agent-core
```
