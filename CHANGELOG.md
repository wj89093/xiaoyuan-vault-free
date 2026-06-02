# 晓园 Vault 开源版 变更日志

> 版本：v1.3.0-free
> 发布日期：2026-06-01

---

## 2026-06-02 — v1.3.1-free Skill 插件完整化

### 新增
- **Endpoint 配置 UI** — 设置面板可配 URL + 协议（http/ws/skill）+ 保存 + 测试连接
- **8 个内置 Skill 模板** — ingest / query / recall / lint / write-note / conversation-summary / self-improvement / stats
- **Skill 列表 + 编辑/保存/删除** — 用户可建自己的 Skill
- **全文编辑器** — 直接在设置面板写 Skill.md
- **启用开关** — 整块 Skill 区块可停用

### 修复
- Skill.md 区块在开源版隐藏（README 承诺但实际打不开）
- skillHandlers 未在 index.ts 注册
- skill-plugin-default.md 模板缺失
- Endpoint URL 路径拼接漏洞（改为 URL 解析 + 协议白名单 + 外部 host 二次确认）

### 安全
- Endpoint 测试连接：URL 解析 + 协议白名单 + 本地 host 直连 / 外部 host 确认
- 暂时只支持 HTTP，WS/Skill 协议 UI 上禁用并标 TODO

### 内部
- 移除 Free 版死代码（agent/ 目录）
- 修复 .gitignore 重复行
- 修复 SettingsPanel 9 个 lint errors
- 修复 preload 1 个 lint error
- 删除冗余 IS_OPEN_SOURCE 字段
- 删除 CHANGELOG_DETAIL 不存在的链接

---

## 2026-06-01 — v1.3.0-free 开源版首发

### 🎉 开源版发布
- 完整剥离 Pro 专属代码（内置 AI、bubble、aiChat）
- 保留 vault 主功能（编辑、图谱、搜索、多 vault、简报）
- 新增 **Skill.md 插件** — 让你接自己的 AI

### Skill.md 插件协议
- 协议层：HTTP POST + SSE 流式响应
- 预置 Skill.md 模板（12 章节工作手册）
- 设置面板 → Skill.md → 查看 + 复制

### 修复
- 多种 Pro 专属代码 strip 干净
- Bubble preload 路径修复
- 完善开源版文档
