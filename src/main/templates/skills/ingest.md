# Skill ingest（文件摄入）

> 把 _raw/YYYY-MM/ 的原始文件整理成 _wiki/ 知识页面

## 触发条件
- 帮我整理
- 摄入
- 导入
- ingest

## 执行流程
1. read(index.md)                      → 了解已有哪些 topic（避免重复创建）
2. read(_raw/{YYYY-MM}/{filename})     → 读当月子目录，不扫全 _raw/
3. 分析内容：
   - 判断 topic（优先复用 index.md 中已有 topic，必要时自创）
   - 判断 type（document/note/meeting/email/research/reference/idea）
   - 生成 summary（30-60 字）
   - 提取 tags（3-5 个）
4. write(_wiki/{topic}/{title}.md, frontmatter + 正文)
5. edit(index.md)                      → 更新索引（新增/更新 topic 条目 + 页面链接）
6. edit(log.md, lastEntry, newEntry)   → 追加操作日志（append-only，不重写历史）

## 注意事项
- _raw/ 是只读原材料，**永远不修改**
- ingest 完成后**不要**再调用 bash ingest.js（全量 pipeline 已由 step 2-4 完成）
- 批量 ingest → 逐个 read _raw/YYYY-MM/，不用 ls _raw/ 全量列出

## 输出格式
```
✅ 已摄入：{filename}
   → topic: {topic}
   → type: {type}
   → 摘要: {summary}
   → 页面: _wiki/{topic}/{title}.md
```
