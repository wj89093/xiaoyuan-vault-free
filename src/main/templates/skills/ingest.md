---
name: ingest
triggers:
  - 帮我整理
  - 摄入
  - 导入
  - ingest
---

# ingest — 文件摄入

**目标**：读取 \_raw/ 中的原材料，分析内容，创建知识库页面。

## 流程

1. `bash ls _raw/` → 确认文件位置和路径（可能含月份子目录）
2. `read index.md` → 了解已有 topic（避免重复创建）
3. `read _raw/{YYYY-MM}/{文件名}` → **总是 read 完整文件**，即使 question 含嵌入内容
4. 分析 → 判断 topic/type/summary/tags
5. `write _wiki/{topic}/{标题}.md` → 含完整 frontmatter + 正文
6. `edit log.md` → 追加操作日志

## 关键规则

- **始终 read 完整文件**：question 中嵌入的内容最多 2000 字符，read 才能拿到全文
- `_raw/` 是只读原材料，永不修改
- 批量 ingest → 逐个 read \_raw/YYYY-MM/，不用 ls \_raw/ 全量列出

## 边缘情况

- **空文件**：read 返回空 → 跳过，告知用户 "文件无内容，请检查"，不写入 \_wiki/
- **无法解析**：read 返回错误 → 跳过，报 error，继续下一个
- **已摄入**：检查 \_wiki/ 是否有同名页面 → 跳过，告知用户 "已存在，如需覆盖请先删除"
- **无明确 topic**：按文件类型归类为 reference，用文件扩展名推断 topic

## 输出格式

```
✅ 已摄入：合同模板.docx → _wiki/合同管理/合同模板.md
⏭️ 空文件：财务数据.xlsx → 无内容，跳过
⏭️ 重复：会议纪要.pdf → _wiki/会议/会议纪要.md 已存在
❌ 失败：损坏文档.doc → 无法解析
```
