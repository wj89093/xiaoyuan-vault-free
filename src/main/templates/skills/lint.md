# Skill lint（健康检查）

> 扫死链、孤立页、过期页面，生成结构健康报告

## 触发条件
- 健康检查
- 检查知识库
- lint

## 执行流程
1. bash("node server/tools/sys_health.js --scope _wiki/")  → 只检查 wiki 目录
2. 分析输出结果，分类汇总：
   - 孤立页（orphan pages）
   - 死链（dead links）
   - 过期页面（stale > 30 天）
   - 字段缺失
3. write(_wiki/Lint报告-{日期}.md, 报告内容)  → 写入报告
4. edit(log.md, lastEntry, newEntry)            → 追加日志

## 注意事项
- lint **只扫 _wiki/**，不扫 _raw/（原材料不参与健康度评分）
- log.md / index.md / LLM-wiki.md 由 AI 维护，不需要 lint 检查
- 建议每周跑一次
