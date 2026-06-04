# 晓园 Vault 开源版 变更日志

> 当前版本：v1.5.0-free
> 发布日期：2026-06-04
> 最近更新：2026-06-04（reader UX 5 features）

---

## 2026-06-04 — v1.5.0-free Reader UX（5 features）

### 设计理念

> **文档编辑器主要给 agent 用，用户只看不编辑。** 所有 UI/UX 优化以「读者视角」为导向。

### 新增功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | **滚动位置记忆** | 重开文档回到上次位置（SQLite per-file scroll_y） |
| 2 | **未读/新内容标记** | FileTree 蓝色小圆点标记 agent 新写但用户未看的文件 |
| 3 | **TOC 目录侧栏** | 长文档 heading 树 + scroll spy 高亮 + 点击跳转 |
| 4 | **可调节字体/行距** | 字体 14-24px + 行距 1.4-2.2，localStorage 持久化 |
| 5 | **阅读模式** | 隐藏 markdown 暗纹字符（# * `` [] > -），纯净阅读 |

### 内部

- DB schema: 新增 `scroll_positions` + `last_seen_files` 两张表
- IPC: `scroll:get/set/remove` + `lastSeen:mark/getAll/getForFile/clear`
- EditorTheme: fontSize/lineHeight 改用 CSS variables (`--reader-font-size` / `--reader-line-height`)
- 新组件: `TableOfContents.tsx` + `useScrollMemory.ts` + `useReaderSettings.ts`
- 浮动工具栏: 阅读模式 toggle + TOC toggle + 字体/行距控件

### 测试
- 132 passed (1 skipped)
- Lint: 0 errors / 0 warnings
- Typecheck: clean

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
