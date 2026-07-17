# 晓园 Vault 开源版 (Free) 路线图

> 最后更新: 2026-07-17 (v1.11.0-free 之后)
> 维护者: xiaoyuan-vault-free 团队

---

## 当前状态 (v1.11.0-free, 2026-07-16)

| 指标 | 数字 |
|------|------|
| HEAD | `415da3c` (7-16) |
| 测试 case | **414 passed** (+63 from v1.9) |
| 测试文件 | 34 (+3 from v1.9) |
| as any 残余 | **52** (-33% from 78, v1.9 起点) |
| 真实 bug 修复 (v1.11) | 2 (ImportApp 拖文件 / handleSaveAIMessage) |

✅ **v1.11.0 关键交付**:

- **W7+ 审计套件** — auto-commit worker (chokidar) + post-commit hook + audit UI + audit IPC
- **三层 as any 清零** — main/preload → renderer types → renderer hooks/widgets
- **Preload 全面重构** — window.d.ts 重写为 15 个 namespace, 暴露 3 个隐藏 bug
- **3 个 service 测试 backport** — backupManager / maintain / graphBuild (+63 case)
- **完全同步 team 仓 v0.14** (Team → Free 落后: 0 commits)

🔗 **跨仓状态**:

- Free 仓: 持续 backport team 仓 v0.14, 已追平
- Team 仓: 领先 Free 1 天 (含 v0.14 后继续开发)
- Pro 仓: **7-9 ~ 7-17 冻结** (b9c3901 最后 commit), 决策 pending Owner 拍板

---

## 短期 (v1.11 → v1.12, 估时 2-4 周)

### 🔴 待办 (从 7-17 audit 升序)

- [ ] **跨平台测试** — chokidar + fs.watch 在 Linux/Windows 验证（macOS 已实测过；Linux inotify / Windows 不一样）
- [ ] **`docs/ENGINEERING_MAP.md` 视角更新** — 当前是 v1.6.1+ 视角（6-5 写的），应同步到 v1.11.0-free
- [ ] **`docs/release-notes/` 补足** — 新增 `v1.9.0-free.md` / `v1.10.0-free.md` / `v1.11.0-free.md`（现只有 `v1.6.1-free.md`）

### 🟡 决策待办 (需要 Owner 拍板)

- [ ] **CHANGELOG gap**: v1.9 → v1.10 中间 22 个 unversioned commits (`1f52c26` / `1bf9f45` / `dc9b4e9` 等) — 是否补独立小版本？
- [ ] **Pro 仓去留**: 7-9 之后 Pro 仓冻结 8 天。决策选项: `frozen` / `mirror-only` / `archived`
- [ ] **PHASE3_PLAN_2026-06-02.md** (6-2 写的 Phase 3 FileTree 虚拟化 + Graph 增量计划) — 是否已 obsolete？应 archive 或重写

### 🔵 探索

- **v1.12 主题**: 延续 "as any 清零" 还是开新方向 (e.g. 错误处理统一 / 类型化 IPC payload)？

---

## 中期 (v1.12 → v2.0, 估时 1-3 个月)

### 路线候选

- **Skill.md 即插即用** — Free 仓是否原生支持 `OpenClaw` / `Claude Code` 自定义 Skill 工作流
- **MCP 集成** — 是否替代 Skill.md 协议层（HTTP POST + SSE → Model Context Protocol）
- **KnowledgeGraph 性能** — 当前 414 case / 估算 5000+ 文件 vault 性能边界，未来是否需要重写
- **Schema 系统重构** — v1.9 INDEX → registry 化，支持 plugin 注入自定义 field

### 跨项目

- **Pro 仓保留**: 决定是否持续维护商业版（取决于 frozen / mirror-only 选择）
- **Team 仓同步**: Free 仓是否继续作 team v0.14+ 的 backport target？或独立演进

---

## 长期 / 不在 Free 范围

### ❌ Pro/Team 专属（Free 不实现）

- 邀请 / 成员 / 权限管理
- PR 系统 + Draft + Code Review
- AI Chat 浮窗 / 剪贴板浮窗
- 内置 AI Agent / `ai/SelfAgentAdapter.ts`
- 双 vault 切换

### 🟡 待评估（不承诺）

- LintPanel 功能丰富化（v1.11 已简化为只读，按需恢复手工触发）
- Brief 输出格式自定义（v1.8 ~ v1.11 稳定，未有新需求）
- 多语言支持（i18n）— 当前仅中文 UI，未确认是否需要

---

## 历史决策 (按时间倒序)

| 日期 | 决策 | 状态 |
|------|------|------|
| 2026-07-17 | **新建 `ROADMAP.md`** — Free 仓顶层路线图 | ✅ 落地 |
| 2026-07-17 | SESSION-STATE 同步 (10 commit 补录) | ✅ 落地 |
| 2026-07-17 | `reports/` gitignore + 删除 2 旧 subagent 调研报告 | ✅ 落地 |
| 2026-07-17 | 补 3 个 tag (v1.9 / v1.10 / v1.11) | ✅ 落地 |
| 2026-07-16 | v1.11.0-free 发布 | ✅ 已发布 |
| 2026-07-09 | Free 仓 W7+ 套件首 backport (`60ef290`) | ✅ 已发布 |
| 2026-07-09 | Pro 仓 `b9c3901` 最后 commit — 当前决策 Pro 冻结 | ⚠️ 待确认 |

---

## 相关文档

| 文档 | 视角 |
|------|------|
| `CHANGELOG.md` | 版本变更细节 (每个 release 段) |
| `AGENTS.md` | 给开发 Free 仓 Agent 的入口 (v1.11.0 视角) |
| `README.md` | 用户视角产品介绍 (不带版本细节) |
| `docs/ENGINEERING_MAP.md` | Free 仓库工程导航 (待更新到 v1.11.0) |
| `docs/SKILL_WORKFLOW.md` | 7 个 Skill 模板 + AGENTS.md 工作流 |
| `docs/PHASE3_PLAN_2026-06-02.md` | ⚠️ 已过期 45 天, Phase 3 详细实施计划 |
| `docs/release-notes/` | ⚠️ 缺 v1.9/1.10/1.11 release notes |

---

*此 ROADMAP 仅反映 Free 仓路线 — 不影响 Pro / Team 仓独立决策*
