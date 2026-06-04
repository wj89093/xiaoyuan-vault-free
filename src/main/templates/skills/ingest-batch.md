# Skill ingest-batch（批量导入）

> 按月份分批导入 _raw/ 里所有文件

## 触发条件
- 导入 _raw/ 里的所有文件

## 执行流程
1. read(index.md)                        → 了解已有 topic
2. bash("ls _raw/{YYYY-MM}/")           → 按月份列待处理文件（不扫全 _raw/）
3. read(_raw/{YYYY-MM}/{filename})      → 逐个读取
4. write(_wiki/{topic}/{title}.md)        → 逐个写入 wiki
5. edit(log.md, ...)                      → 批量追加日志

## 注意事项
- **禁止** ls _raw/ 全量列出（按月份分批处理）
- ingest 后**不要**再调用 bash ingest.js（全量 pipeline 已由 step 2-4 完成）
- 每读完一个文件，就 write 一个 wiki 页面，**不要**等所有文件读完再批量写
