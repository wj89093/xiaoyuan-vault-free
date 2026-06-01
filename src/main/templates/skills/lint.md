---
name: lint
triggers:
  - 健康检查
  - 检查知识库
  - lint
---
# lint — 知识库健康检查

**目标**：检查知识库健康度，发现孤立页、死链、过期内容。

## 流程
1. `bash node server/tools/sys_health.js --scope _wiki/`
2. 分析输出 → 孤立页 / 死链 / 过期 / 字段缺失
3. `write _wiki/Lint报告-{日期}.md`
4. `edit log.md` → 追加日志

## 规则
- 只扫 `_wiki/`，`_raw/` 原材料不参与健康评分
- log.md / index.md 由 AI 维护，不需要 lint

## 输出格式
```
📊 知识库健康检查报告
总笔记：{n} 个
孤立页面：{n} 个
死链：{n} 个
过期页面(>30天)：{n} 个
```
