# Skill lint（健康检查）

> 扫 wiki 健康指标，生成 5 类结构报告，LintPanel 读取并分类展示

## 触发条件
- 健康检查
- 检查知识库
- lint

## 执行流程
1. bash("node server/tools/sys_health.js --scope _wiki/")  → 只检查 wiki 目录
2. 解析输出，按 5 类汇总（见"输出格式"）
3. write(_wiki/Lint报告-{YYYY-MM-DD}.md, 报告内容)  → 写入报告
4. edit(log.md, lastEntry, newEntry)                     → 追加日志

## 输出格式

### 报告 frontmatter + body（被 maintain.ts 生成 + LintPanel 解析）
```yaml
---
date: 2026-06-05
health: 良好 | 待处理 | 需关注   # LintPanel 顶部状态文字
totalFiles: 128                 # _wiki/ 下文件总数（header bar 显示 "N 个 wiki 页面"）
---

## Stats（5 类，LintPanel 按这 5 类渲染）
- 孤立页（orphanPages）: 0      # 无任何 wiki 链接指向的页面
- 死链（deadLinks）: 0          # 链接到不存在的目标
- 过期页面（stalePages）: 3     # 30 天未更新
- 矛盾（contradictions）: 1     # 同一事实在不同页面冲突
- 总问题数 = orphanPages + deadLinks + stalePages
```

### 5 类与 LintPanel 渲染对应
| 类别 | LintPanel 渲染位置 | 颜色 |
|---|---|---|
| `deadLinks` | "死链 N 个" 标题 + 链接列表 | orange |
| `orphanPages` | "孤儿页面 N 个" 标题 + 文件名列表 | tertiary |
| `stalePages` | "过期页面 N 个" 标题 + 文件名列表 | gray |
| `contradictions` | stats 数字显示（**暂无详情列表渲染**——已知缺口） | — |
| `totalFiles` | header bar "{N} 个 wiki 页面" | tertiary |

### 报告 markdown 模板（maintain.ts 写入格式）
```markdown
---
date: 2026-06-05
health: 需关注
totalFiles: 128
---

# Lint 报告 — 2026-06-05

健康状态：⚠️ 1 个矛盾待处理

## 详情
### 死链 (0)
（无）

### 孤儿页面 (0)
（无）

### 过期页面 (3)
- _wiki/old/2024-notes/page1.md
- _wiki/old/2024-notes/page2.md
- _wiki/old/2024-notes/page3.md

### 矛盾 (1)
- 事实冲突: 成立年份 在 _wiki/company-a.md 写 2018，在 _wiki/company-b.md 写 2019
```

## 注意事项
- lint **只扫 _wiki/**，不扫 _raw/（原材料不参与健康度评分）
- log.md / index.md / LLM-wiki.md 由 AI 维护，不需要 lint 检查
- 建议每周跑一次
- **"字段缺失"不计入 lint 5 类**——v1.6 之前模板提到过，但 LintPanel 不支持，已移除；字段缺失可在 log.md 单独标注
