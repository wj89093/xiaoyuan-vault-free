# 晓园 Vault — 工程地图

> 版本：v1.6.1-free | 更新：2026-06-05 | **Free 仓库视角**
> 用途：开发时快速定位代码、理解模块关系

---

## 一、项目结构

```
xiaoyuan-vault-free/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 入口（createWindow、app lifecycle）
│   │   ├── ipc/           # IPC handler 注册（8 个模块 + 1 个 test）
│   │   ├── services/      # 核心业务逻辑（14 个服务域 + 3 个顶层文件）
│   │   ├── templates/     # vault 初始化模板 + Agent 系统提示（含 skills/ 7 个 Skill）
│   │   └── buildFeatures.ts # IS_PRO 守卫
│   ├── preload/           # contextBridge 暴露 API 给 renderer
│   │   └── index.ts       # window.api.* 的所有定义
│   ├── renderer/          # React 19 UI
│   │   ├── App.tsx        # 根组件
│   │   ├── components/    # UI 组件（37 个 .tsx）
│   │   ├── hooks/         # React hooks（24 个 .ts）
│   │   ├── styles/        # CSS（global / panels / inline-preview）
│   │   └── utils/         # 编辑器工具
│   ├── shared/            # main ↔ renderer 共享类型
│   │   └── window.d.ts    # 窗口类型声明
│   ├── test/              # 单元测试（顶层）
│   └── main/              # 测试（按目录镜像）
│       ├── ipc/           # skillHandlers.test.ts 等
│       └── services/      # operations / graph / frontmatter / chat / search 等
├── docs/                  # 架构文档（3 个活跃）
├── electron.vite.config.ts
└── package.json
```

---

## 二、核心数据流

```
用户操作
    │
    ▼
Renderer（React 19）
    │ ipcRenderer.invoke()
    ▼
Preload（contextBridge）
    │ ipcMain.handle()
    ▼
IPC Handlers（src/main/ipc/）
    │
    ├── fileHandlers/     → 文件 CRUD + 导入 + 垃圾桶
    ├── importHandlers    → 文件导入窗口
    ├── maintainHandlers  → Lint + Schema + 维护任务 + 对话摘要
    ├── vaultHandlers     → vault 创建/打开/生命周期 + Skill 模板递归拷贝
    ├── settingsHandlers  → SkillSection IPC
    ├── skillHandlers     → Skill 默认加载（注入层）
    ├── authHandlers      → 认证（Free 仓库保留入口，auth-gateway 未部署）
    └── miscHandlers      → 图谱/搜索/剪贴板/内容识别/query:vault
    │
    ▼
Services（src/main/services/）
    │
    ├── ai/               → 底层 callAI（Free 仓库无自研 Agent，外部 Agent 接入）
    ├── briefing/         → 每日简报 + 对话摘要（MemoryPanel 数据源）
    ├── chat/             → 会话存储（chat-sessions.json 保留，Pro 仓库模块）
    ├── clipboard/        → 剪贴板监听（Free 仓库保留，浮窗在 Pro 仓库）
    ├── database/         → vault 路径 + 文件索引 DB
    ├── frontmatter/      → YAML frontmatter 解析
    ├── graph/            → 知识图谱构建 + 增量重建
    ├── lint/             → 5 类健康检查（maintain.ts）+ 报告持久化
    ├── memory/           → Agent 记忆系统
    ├── operations/       → 文件 CRUD + 转换 + enrich
    ├── schema/           → Schema 存储
    ├── search/           → FTS5 全文搜索 + RAG
    ├── urlFetch/         → URL 抓取（微信/YouTube/B站等）
    └── utils/            → 工具函数
    │
    ▼
存储
    ├── SQLite（vault DB）
    ├── FTS5 全文搜索索引
    ├── 文件树（_raw/ _wiki/ _briefing/ _schema/ _lint/ _output/）
    └── log.md（append-only 操作日志）
```

---

## 三、模块速查

### IPC Handlers（src/main/ipc/）

| 文件 | 职责 | 关键 IPC |
|------|------|---------|
| `vaultHandlers.ts` | vault 创建/打开/最近 | `vault:open/create/listDir/getLast` |
| `settingsHandlers.ts` | 设置 + SkillSection | `settings:get/set`, `skill:loadDefault` 等 |
| `skillHandlers.ts` | Skill 默认加载（注入层） | `skill:loadDefault` 拼 skills/ 目录 + MARKDOWN_CAPABILITIES |
| `fileHandlers/` | 文件 CRUD 总入口 | 委托到 crud/import/misc/trash |
| `fileHandlers/crudHandlers.ts` | 文件读/写/删/移/搜 | `file:read/write/delete/move/rename/list/search` |
| `fileHandlers/importHandlers.ts` | 文件导入 + 拖放 | `file:import/importFromDialog` |
| `fileHandlers/trashHandlers.ts` | 垃圾桶 | `file:trash/list/restore/delete/empty` |
| `fileHandlers/miscHandlers.ts` | 渲染/格式转换 | `file:render/convert/getSupportedExtensions` |
| `importHandlers.ts` | 导入窗口 + 自动导入 | `import:open/autoTrigger` |
| `maintainHandlers.ts` | 维护+Lint+Schema+对话摘要 | `maintain:run/lint` `schema:list/getPending` `briefing:getConversations` |
| `authHandlers.ts` | 认证入口（Free 仓库未部署 auth-gateway）| `auth:getToken/clear/openLogin` |
| `miscHandlers.ts` | 图谱/搜索/剪贴板/query | `graph:load/rebuild` `clipboard:start` `query:vault` |

### Services（src/main/services/）

| 服务域 | 关键文件 | 职责 |
|--------|---------|------|
| **ai/** | `aiService.ts` | callAI 底层（Free 仓库无 SelfAgentAdapter） |
| **briefing/** | `briefing.ts`, `bubbleState.ts` | 每日简报 + 对话摘要（MemoryPanel 数据源）|
| **chat/** | `chat.ts`, `chatSessions.ts` | 会话存储（chat-sessions.json，Pro 仓库模块） |
| **clipboard/** | `clipboard.ts` | 剪贴板监听（Free 仓库保留，浮窗在 Pro 仓库）|
| **database/** | `database.ts` | vault 路径 + 文件索引 DB |
| **frontmatter/** | `parse.ts`, `template.ts`, `links.ts` | YAML frontmatter |
| **graph/** | `graph.ts`, `graphQueries.ts` | 知识图谱（增量重建）|
| **lint/** | `lintReports.ts`, `maintain.ts` | 5 类健康检查 + 报告持久化 |
| **memory/** | `agentMemory.ts` | Agent 记忆系统 |
| **operations/** | `crud.ts`, `converters.ts`, `enrich.ts`, `fileProcessor.ts` | 文件操作 + 转换 + enrich |
| **schema/** | `schemaStorage.ts` | Schema 管理 |
| **search/** | `search.ts`, `query.ts`, `ragService.ts`, `indexService.ts` | FTS5 + RAG |
| **urlFetch/** | `index.ts`, `providers.ts` | URL 抓取 |
| **utils/** | `whisper.ts`, `resolver.ts`, `operationLog.ts` | 工具函数 |

**顶层文件**（不在 services/ 子目录）：
- `backupManager.ts` — vault 备份
- `config.ts` — 配置加载
- `fileWatcher.ts` — `fs.watch` 监听（500ms debounce） → emit `file:changed`

### 7 个 Skill 模板（src/main/templates/skills/，v1.6.x）

| Skill | frontmatter 字段 | UI 渲染 | 验证 |
|-------|------------------|---------|------|
| `ingest.md` | （无）| FileTree + Editor | skills-templates.test.ts |
| `ingest-batch.md` | （无）| FileTree + Editor | ↑ |
| `lint.md` | `date, health, totalFiles` | LintPanel（5 类）| ↑ + briefing.ts 解析 |
| `query.md` | （无）| 无（外部 Agent）| skills-templates.test.ts |
| `stats.md` | （无）| 无（外部 Agent）| ↑ |
| `log.md` | （无）| LogPanel | ↑ |
| `conversation-summary.md` | `date, time, title, topic, sources` | MemoryPanel | ↑ + briefing.ts frontmatter 解析 |

**已废弃**（v1.6.1 删除）：`write.md`, `list-sessions.md`（见 `docs/SKILL_WORKFLOW.md`）

### Agent 工具（4 个原子工具）

> Agent 自身提供工具栈（OpenClaw MCP / Claude Code / 自建），晓园不调度
> Free 仓库**不包含**自研 Agent 实现（Pro 仓库的 `services/agent/` + `ai/SelfAgentAdapter.ts`）

| 工具 | 参数 | 用途 |
|------|------|------|
| `read` | `{path}` | 读取 vault 内文件内容 |
| `write` | `{path, content}` | 写文件（.md 自由路径，非 .md → `_output/`） |
| `edit` | `{path, oldText, newText}` | 精确文本替换编辑 |
| `bash` | `{cmd}` | 执行 shell 命令（安全沙箱，禁止 rm -rf / 路径遍历） |

### Renderer 组件（src/renderer/components/，37 个）

| 组件 | 职责 |
|------|------|
| `VaultRouter.tsx` | 主面板路由（编辑/图谱/设置/Lint/日志） |
| `FileTree.tsx` + `FileTreeFlatRow.tsx` + `FileTreeNode.tsx` + `FileTreeRow.tsx` | 拍平版 + 虚拟化（react-window）+ 递归版 |
| `FileTreeContextMenu.tsx` | 右键菜单（打开/重命名/删除/转化/复制路径） |
| `FileTreeHoverPreview.tsx` | 文件悬停预览 |
| `Editor.tsx` | Markdown/Office 编辑器（CM6） |
| `EditorContextMenu.tsx` | 编辑器右键菜单 |
| `EditorHeader.tsx` | 编辑器顶部栏（文件名/保存/预览切换） |
| `KnowledgeGraph.tsx` + `KnowledgeGraphViz.tsx` | D3 知识图谱 |
| `SearchPanel.tsx` + `SearchResults.tsx` | 浮层搜索 |
| `OutputPanel.tsx` | 产出面板（`_output/README.md`） |
| `MemoryPanel.tsx` | 对话摘要面板（v1.6.1 跟 conversation-summary frontmatter 对齐）|
| `BacklinksPanel.tsx` | 反向链接面板 |
| `LintPanel.tsx` | Lint 结果面板（v1.6.1 跟 lint 模板输出对齐 5 类）|
| `SchemaPanel.tsx` | Schema 管理面板 |
| `SettingsPanel.tsx` + `SettingsSections.tsx` | 设置面板（51 行 + 4 个子组件）|
| `LogPanel.tsx` | 操作日志面板 |
| `TrashPanel.tsx` | 垃圾桶面板 |
| `IconSidebar.tsx` | 左侧图标导航 |
| `Sidebar.tsx` | 文件树侧栏 |
| `QuickSwitch.tsx` | Ctrl+K 快速切换文件 |
| `IndexNav.tsx` + `IndexFloat.tsx` | 索引导航 |
| `ShortcutGuide.tsx` | 快捷键指南 |
| `FloatingPanel.tsx` | 通用浮层面板 |
| `Toast.tsx` | Toast 通知 |
| `WelcomeScreen.tsx` + `VaultCreationWizard.tsx` | 导引 |
| `ErrorBoundary.tsx` + `Skeleton.tsx` | 防御 + 加载占位（v1.4.0）|
| `MermaidTest.tsx` | Mermaid 调试 |

### Renderer Hooks（src/renderer/hooks/，24 个）

> 详见 `src/renderer/hooks/`（按用途分组：useChat / useVault / useEditor / useFileTree / useKnowledgeGraph 等）

---

## 四、关键机制

### 1. Agent 系统（外部接入）
- **入口**：`src/main/templates/AGENTS.md`（仓库根 10 行标准）—— 任何 AGENTS.md 兼容 Agent 自动加载
- **工具**：4 个原子工具（read/write/edit/bash），由 Agent 自身提供
- **系统提示**：`src/main/templates/Agents.md`（v2.4）+ `src/main/templates/skills/*.md`（7 个 Skill）
- **Skill 注入层**（v1.6+）：`skillHandlers.ts:loadDefault` 拼 skills/ 整个目录 + MARKDOWN_CAPABILITIES.md
- **上下文**：Agent 读 `index.md` 理解 vault 结构，不走 RAG 向量检索
- **输出约束**：非 `.md` 文件 → 自动 `_output/`（双层：system prompt + handler）

### 2. 核心动线
```
Agent 收到用户消息 → 匹配触发词 → 激活对应 Skill 模板
  → 读 index.md 了解 vault 结构
  → 读/写/编辑对应文件
  → 追加 log.md
  → 通知用户
```

### 3. Skill 模板 ↔ UI 接口对齐（v1.6.1）
- `conversation-summary.md` frontmatter 5 字段 = `MemoryPanel.ConversationSummary` 接口
- `lint.md` 输出格式 5 类 = `LintPanel.ParsedLintReport.stats` 5 项
- `skills-templates.test.ts` 用 9 个对齐断言锁住

### 4. 文件监听（v1.4.0+）
- `services/fileWatcher.ts` 用 `fs.watch` 监听 vault 目录
- 500ms debounce → emit `file:changed` 事件
- Graph 增量重建（`graph:rebuildIncremental`）只重算相关边

### 5. IPC 通信约定
- **renderer → main**：`ipcRenderer.invoke('channel', ...args)`
- **main → renderer**：`webContents.send('channel', data)`
- preload 用 `contextBridge` 安全暴露 `window.api`

### 6. vault 目录结构
```
vault/
├── _raw/{YYYY-MM}/         # 原材料（只读，AI 不修改）
├── _wiki/{topic}/          # AI 生成的知识页面
├── _briefing/
│   ├── {date}.md           # 每日简报
│   └── conversations/{YYYY-MM-DD}/conv-HHMM.md  # 对话摘要
├── _schema/                # 领域 schema
├── _lint/                  # Lint 报告
├── _output/                # Agent 产出物（非 .md 文件）
├── log.md                  # 操作日志（append-only）
├── index.md                # Agent 导航索引（最重要）
└── LLM-wiki.md             # AI 控制平面
```

---

## 五、开发常用命令

```bash
# 开发
npm run dev                    # 启动 dev server
npm run build                  # 构建到 out/ (5.6s)

# 测试
npm test                       # 单元测试（17 files, 187 tests, 1 skipped, 1.5s）
npx vitest run path/to/file    # 单文件测试
npx vitest --ui                # 启动测试 UI

# 质量
npm run lint                   # ESLint（0 errors）

# 打包（仅 Free 仓库）
./scripts/build-free.sh        # 输出 dist/*.dmg / *.exe / *.AppImage
```

---

## 六、文档导航

| 文档 | 用途 |
|------|------|
| `ENGINEERING_MAP.md` | 本文档：Free 仓库工程导航（v1.6.1）|
| `SKILL_WORKFLOW.md` | 7 个 Skill 模板 + AGENTS.md 工作流（v1.6.x 重写）|
| `DEPLOY.md` | 构建 / 打包指南（v1.3+，部分需更新）|
| `CHANGELOG.md` | 版本变更记录（v1.6.1 头部已同步）|

> Pro 仓库有更多文档（`API.md` / `ARCHITECTURE_REVIEW_V4.md` / `QA_TEST_CASES.md` / `CODING_STANDARDS.md` / `pre-launch-checklist.md` / `SKILLS.md`），Free 仓库不复制。

---

## 七、常见任务对照

| 任务 | 改哪里 |
|------|--------|
| 新增 UI 组件 | `src/renderer/components/` |
| 新增 IPC handler | `src/main/ipc/` + `preload/index.ts` |
| 新增 / 改 Skill 模板 | `src/main/templates/skills/*.md`（v1.6.x 7 个）|
| 修改 Agent system prompt | `src/main/templates/Agents.md`（v2.4）|
| 修改 vault 初始化结构 | `src/main/templates/`（含 skills/）|
| 新增 Lint 检查项 | `src/main/services/lint/maintain.ts`（记得同步 LintPanel 渲染）|
| 修改文件导入逻辑 | `fileHandlers/importHandlers.ts` + `operations/fileProcessor.ts` |
| 修改文件树 | `FileTree.tsx` + `FileTreeNode.tsx` + `FileTreeFlatRow.tsx` |
| 修改 WikiLink 跳转 | `src/renderer/App.tsx`（handleEditorWikiLink）|
| 修改 briefing 字段 | `briefing.ts:ConversationSummary` + MemoryPanel + conversation-summary.md 三方对齐 |
| 修改 Lint 报告字段 | `maintain.ts:MaintainReport` + LintPanel + lint.md 三方对齐 |
