# 晓园 Vault 开源版 变更日志

> 当前版本：v1.6.1-free
> 发布日期：2026-06-05
> 最近更新：2026-06-05（Skill 模板 ↔ UI 接口对齐 + 删 2 个低价值 Skill）

---

## 2026-06-05 — v1.6.1-free Skill 模板 ↔ UI 接口对齐（2 commits）

### 量化成果

| 维度 | v1.6.0 起点 | 现在 | 提升 |
|------|-------------|------|------|
| Skill 模板数 | 9 | **7** | -22%（删 2 个低价值） |
| 模板 ↔ 面板字段脱节 | 2 处 | **0** | -100% |
| skills-templates 测试 | 21 | **24** | +3 项对齐断言 |

### 改动

- **conversation-summary.md** — frontmatter 改 5 字段对齐 MemoryPanel.ConversationSummary（`date/time/title/topic/sources`），移除 `participants/tags`，`relatedFiles` → `sources`（briefing.ts 实际字段名），正文 sections 改 `讨论了什么/关键决策/下一步`，修 markdown 嵌套 bug
- **lint.md** — 加 `## 输出格式` 块（之前缺），5 类汇总对齐 LintPanel stats（`totalFiles/orphanPages/deadLinks/stalePages/contradictions`），移除"字段缺失"（LintPanel 不支持），表格说明每个分类的渲染颜色
- **删 2 个低价值 Skill 模板**：
  - `write.md` — 跟 ingest 重叠度高（同样落 `_wiki/`、同样 write 操作），流程缺"问写啥"+"提纲确认"
  - `list-sessions.md` — 指向 `chat-sessions.json`（Pro 仓库 chat 模块产物），Free 仓库没面板渲染，MemoryPanel 已用 `_briefing/conversations/` 路径承担
- **Agents.md** — 索引表删 2 行，章节号 5/7/8/9 → 4/5/6/7，原 4/6 留废弃说明段
- **测试** — 加 9 个 v1.6.x 对齐断言：frontmatter 5 字段、移除废弃字段、sources 替代 relatedFiles、3 个正文 sections、`## 输出格式` 块、5 类汇总、字段缺失移除、颜色说明；加 2 个废弃断言：write.md / list-sessions.md 不应再存在 + AGENTS.md 不引用废弃名

### Commits

1. `138444d` — Skill 模板 ↔ UI 接口对齐（修 v1.6 commit 留下的脱节）
2. `8da00c5` — 删 2 个低价值 Skill (write + list-sessions), 9 → 7

---

## 2026-06-04 — v1.6.0-free 9 个独立 Skill 模板（1 commit）

### 背景
v1.4 整合时删了 v1.3.1 的 8 个 skill-* 模板（HTTP 协议）改成 AGENTS.md 索引表，但 AGENTS.md 许诺的 9 个 Skill 没真模板 → Agent 触发后自己想办法做。v1.6 补齐。

### 新增

- **9 个独立 Skill 模板**（`src/main/templates/skills/`）：ingest / query / lint / stats / log / ingest-batch / conversation-summary + （v1.6.1 已删 write + list-sessions）
- **skillHandlers 注入层扩展**（`skill:loadDefault` 拼 `skills/` 整个目录）
- **vaultHandlers `writeSkillTemplates`**（vault 创建时递归拷贝 `skills/` 到 vault 根）

### 测试
- 158 → 177（+19 个 skills-templates.test.ts）

### Commits

1. `1e5b406` — 9 个独立 Skill 模板（补齐 AGENTS.md 许诺）

---

## 2026-06-04 — v1.5.0-free UI 性能大爆发（19 commits）

### 量化成果

| 维度 | v1.4.0 起点 | 现在 | 提升 |
|------|-------------|------|------|
| Mermaid 渲染 | 全量重渲染 | **主题 token + ELK + 5 token 缓存** | 显著 |
| CM6 渲染热路径 | 每次重建 extension | **registry + 提到模块顶层 + 6 项优化** | 显著 |
| UI 组件 memo | 4 个 | **22 个** | 5.5x |
| 上次打开文件 | 不记忆 | **重开 vault 自动选中** | 新增 |
| PDF 预览 | 翻页模式 | **连续滚动** | 体验↑ |

### 性能（perf, 10 commits）

- `bcef869` CM6 editor registry — 替代 `window.__Xxx` 全局
- `e4a4f0f` CM6 extensions 提到模块顶层
- `995ce4e` CM6 渲染热路径 6 项优化
- `8c0ae10` CM6 扩展 2 项升级（blockDecorationsField 增量更新 + Frontmatter 拆分）
- `148ab9c` Mermaid theme: 'base' + themeVariables 配 app 设计 token
- `d9ba1b7` Mermaid 3 项优化（ELK + 5 token + 主题重渲染）
- `b8f71bf` UI 组件 4 项优化（SearchPanel 防抖 + QuickSwitch deferred + 7 个 memo）
- `b453511` 11 个 UI 组件批量加 memo + 顺手修 VaultRouter 老 bug
- `4a90c0e` 清理 /tmp 临时目录 + 拆分 WelcomeScreen useEffect

### 功能（feat, 3 commits）

- `2b0282a` 上次打开文件记忆 — 重开 vault 自动选中
- `cfa0676` PDFViewer 改连续滚动模式（替代翻页）
- `523e660` Agent 编辑器能力发现机制（A 内容源 + D 注入层 组合）

### 视觉（polish, 2 commits）

- `9f0bfc1` WelcomeScreen + KnowledgeGraphViz 视觉打磨（5 项）
- `79ccbdc` 4 种 preview 视觉打磨（Callout + Table + Math + WikiLink）

### 修复（fix, 5 commits）

- `9f727bc` 删 KnowledgeGraphViz 未用变量 ng（老 lint 错误）
- `f3b50f8` inlinePreviewExtension 漏加 () 括号 — 运行时 crash
- `bbcaa1a` TaskCheckboxWidget 单例定义移到 class 后面（TDZ 错误）
- `92f5bb6` Mermaid SVG 自适应编辑区宽度 + 高度按 vh 上限
- `756b7fe` 修两个边界 — 启动时 auto-select + 二进制文件 native preview

### 测试（test, 1 commit）

- `2c69819` 覆盖上次打开文件记忆两个边界分支

### Commits（按时间倒序）

`cfa0676` · `79ccbdc` · `9f0bfc1` · `8c0ae10` · `523e660` · `b453511` · `4a90c0e` · `b8f71bf` · `d9ba1b7` · `148ab9c` · `92f5bb6` · `bbcaa1a` · `995ce4e` · `f3b50f8` · `e4a4f0f` · `9f727bc` · `bcef869` · `2c69819` · `756b7fe` · `2b0282a`

---

## 2026-06-04 — v1.4.1-free 文档与边界修复（8 commits）

### 文档（docs, 4 commits）

- `57d79f5` AGENTS.md 回答改为「回答完整」，去掉字数限制
- `8942ee2` AGENTS.md 摘要不限制字数
- `75ae108` AGENTS.md 删掉工具约定和 LLM-wiki 引用
- `da0a27c` AGENTS.md ingest 流程增加第 5 步 — 完成后更新 index.md

### 修复（fix, 4 commits）

- `db4563a` 添加 `file:save` IPC handler（自动保存依赖它）
- `85e18ff` Skill.md 打开 — vault 没有时从 templates 复制再打开
- `2d21e8d` Skill.md 打开优先找 AGENTS.md，都没有提示
- `3692a8f` Skill.md 打开按钮用 vaultPath prop 而非异步 API

---

## 2026-06-03 — v1.4.0-free 性能优化（6 commits）

### 量化成果

| 维度 | v1.4.0 起点 | 现在 | 提升 |
|------|-------------|------|------|
| 主 bundle 大小 | 2,650 KB | **521 KB** | **-80%** |
| FileTree DOM 节点（500+ 文件） | 500+ 嵌套 | **~30 虚拟可见** | **-94%** |
| Graph 增量重建 | 全量 5s | **200ms** | **-96%** |
| SettingsPanel | 649 行 / 15 useState | **51 行 / 0** | -92% |
| KnowledgeGraph 首屏 | 同步 2.6MB | **lazy + Suspense** | 首屏不加载 d3 |
| 致命错误防御 | 白屏 app | **ErrorBoundary 降级** | 防白屏 |
| 外部文件变化感知 | 不感知 | **500ms 内自动重建** | 新增 |

### Commits

1. `041417e` — 拆 SettingsPanel (649→51) + ErrorBoundary + Skeleton
2. `e43ac73` — App.tsx ErrorBoundary wrap + KnowledgeGraph lazy
3. `be2ed63` — FileTree 拍平版 + Graph 增量 IPC（`graph:rebuildIncremental`）
4. `a76ccd4` — FileTree 接 react-window FixedSizeList 完整虚拟化
5. `cb6ba97` — Editor memo + Bundle code-split (-80%) + 按钮 active 反馈
6. `dc38909` — Graph 接 `file:changed` IPC 事件（外部 app 修改自动感知）

### 新增 / 改进

- **FileTree 完整虚拟化**（`react-window@1.8.10`）：500+ 文件 vault 流畅滚动
- **ErrorBoundary**：子组件 throw 不再白屏整个 Electron app
- **Skeleton 组件**：统一加载占位（text / block / circle）
- **KnowledgeGraph lazy**：首屏不加载 d3（691KB chunk）
- **Bundle 手动 chunk 拆分**：vendor-d3 / vendor-pptx / vendor-pdf / vendor-codemirror / vendor-xlsx / vendor-katex / vendor-react 独立 chunk
- **Graph 增量 IPC**：`graph:rebuildIncremental(changedFiles)` 只重算相关边
- **fileWatcher 服务**：`fs.watch` 监听 vault 目录，emit `file:changed` 事件（500ms debounce）
- **FileTree useMemo 位置 bug 修复**：移至所有 early return 之前，遵守 React Hooks 顺序规则

### 内部 API 变更

- `preload`：新增 `graphOnFileChange(cb)` 订阅 API
- `preload`：新增 `graph.rebuildIncremental(files)` / `graph.onFileChange(cb)` 命名空间 API
- `main/ipc/miscHandlers.ts`：新增 `graph:rebuildIncremental` IPC handler
- `main/services/fileWatcher.ts`：新增文件监听服务（105 行）
- `shared/window.d.ts`：新增 `graphOnFileChange` 类型 + `graphRebuildIncremental` 类型
- `components/ErrorBoundary.tsx`：新增（102 行）
- `components/Skeleton.tsx`：新增（62 行）
- `components/FileTreeFlatRow.tsx`：新增（99 行，FileTree 拍平版单行渲染）
- `components/FileTreeRow.tsx`：新增（64 行，react-window 包装）
- `utils/flattenTree.ts`：新增（67 行，拍平树工具）

### 配置变更

- `package.json`：
  - + `react-window@^1.8.10`（dependencies）
  - + `@types/react-window@^1.8.8`（devDependencies）
- `electron.vite.config.ts`：renderer 段加 `manualChunks`（vendor 拆分）

### 验证

- ✅ `npm run build`：5.6s
- ✅ `npm test`：132/133 pass（1 skipped pre-existing）
- ✅ `npx eslint src --max-warnings 0`：0 errors / 0 warnings
- ✅ TypeScript 编译：无新增错误（vite build 不全 typecheck，pre-existing issues 不影响）

---

## 2026-06-02 — v1.4.0-free 定位修正：文件系统优先

### 定位修正
- 晓园 Vault = **本地知识库文件系统**（不是后端 service）
- Agent 本地直接操作文件 + 文件夹（4 个原子工具：read / write / edit / bash）
- **不用 HTTP 协议**（v1.3.1 的 Skill HTTP 协议删除）
- Skill.md 协议改为 **AGENTS.md 通用约定**（Anthropic / OpenAI 标准）

### 新增
- 仓库根 `AGENTS.md`（Anthropic / OpenAI / Cursor / Claude Code / Codex 等都自动加载）
- `src/main/templates/Agents.md` v2.4：顶部加 9 场景 Skill 触发索引表

### 删除
- `src/main/templates/skill-plugin-default.md`（已合并到 `Agents.md` 索引）
- `src/main/templates/skills/*.md`（8 个，已合并到 `Agents.md` 索引）
- `skillHandlers.ts`：删 `listTemplates` / `loadTemplate` / `getEndpoint` / `setEndpoint` IPC
- `preload/index.ts`：删对应 API
- `shared/window.d.ts`：删对应类型
- `SettingsPanel.tsx`：删 endpoint 配置 + 8 预设按钮 + 启用开关（v1.3.1 加的 HTTP UI）
- `skillHandlers.test.ts`：从 13 个测试减到 7 个（删端点 / 模板相关）

### 保留
- 用户 Skill CRUD（list / loadDefault / save / read / delete）— 写自己的 Skill.md
- 默认模板 = `Agents.md` 全文（v1.3.1 是 skill-plugin-default.md）

### 不变
- `src/main/templates/LLM-wiki.md`（控制平面）
- `src/main/templates/system.md`（系统规则）
- vault 目录结构（`_raw/ _wiki/ _briefing/ log.md index.md`）
- 4 工具约定（read / write / edit / bash）

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
