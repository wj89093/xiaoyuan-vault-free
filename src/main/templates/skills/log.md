# Skill log（追加操作日志）

> 任何操作完成后自动追加日志（无需手动触发）

## 触发条件
- 任何操作后自动追加

## 执行流程
1. read(log.md)                    → 读取现有日志
2. edit(log.md, lastEntry, newEntry)  → 在文件末尾追加新条目

## 日志格式
```
## [YYYY-MM-DD HH:MM] {action} | {details}
```
**例子：**
- `## [2026-05-19 09:15] ingest | 合同模板.docx → 合同管理/合同模板.md`
- `## [2026-05-19 09:20] lint | 健康检查，孤立页 3 个，死链 1 个`
- `## [2026-05-19 09:25] write | 新建 客户管理/index.md`
