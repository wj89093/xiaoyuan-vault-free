# Skill stats（统计）

> 统计知识库规模（topic 数、文档数、KnowledgeGraph 节点/边）

## 触发条件
- 统计
- 看看知识库
- 知识库情况

## 执行流程
1. read(index.md)                          → 从索引获取 topic 列表
2. bash("ls _wiki/*/ | wc -l")             → 统计 topic 数量（不扫全量）
3. 可选：bash("ls _wiki/{topic}/ | wc -l")  → 特定 topic 下的文件数

## 注意事项
- 统计数据是**估算**（不扫全 _wiki/，按 topic 边界统计）
- 精确统计可以用 SQLite 数据库查询（files 表 + KnowledgeGraph 重建计数）
