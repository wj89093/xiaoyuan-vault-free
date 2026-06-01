---
name: stats
triggers:
  - 统计
  - 看看知识库
  - 知识库情况
---
# stats — 知识库统计

**目标**：快速了解知识库规模。

## 流程
1. `read index.md` → 获取 topic 列表
2. `bash ls _wiki/*/ | wc -l` → 统计总文件数
3. 可选: `bash ls _wiki/{topic}/ | wc -l` → 特定 topic 文件数
