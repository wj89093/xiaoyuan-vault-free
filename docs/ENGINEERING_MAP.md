# 晓园 Vault — 工程地图

> 版本：v1.4 | 更新：2026-05-27
> 用途：开发时快速定位代码、理解模块关系

---

## 一、项目结构

```
xiaoyuan-Vault/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── index.ts       # 入口（createWindow、app lifecycle）
│   │   ├── ipc/           # IPC handler 注册（7 个模块）
│   │   ├── services/      # 核心业务逻辑（16 个服务域）
│   │   ├── templates/     # vault 初始化模板 + Agent 系统提示
│   │   └── graphUtils.ts  # 知识图谱 D3 工具
│   ├── preload/           # contextBridge 暴露 API 给 renderer
│   │   └── index.ts       # window.api.* 的所有定义
│   ├── renderer/         # React 19 UI
│   │   ├── App.tsx        # 根组件
│   │   ├── components/   # UI 组件（31 个）
│   │   ├── hooks/         # React hooks（23 个）
│   │   ├── utils/         # 编辑器工具
│   │   └── contexts/      # D3 context provider
│   └── shared/            # main ↔ renderer 共享类型
│       ├── chat.ts        # ChatMessage, ChatSession, AskResult
│       └── window.d.ts    # 窗口类型声明
├── docs/                  # 架构文档（~33 活跃 + 18 归档）
├── auth-gateway/          # 独立认证网关服务
└── electron.vite.config.ts
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
    ├── fileHandlers/     → 文件系统 CRUD + 导入 + 垃圾桶
    ├── conversationHandlers → AI 对话 + Agent Session 路由
    ├── importHandlers    → 文件导入窗口
    ├── maintainHandlers  → Lint + Schema + 维护任务
    ├── vaultHandlers     → vault 创建/打开/生命周期
    ├── authHandlers      → 认证（JWT / OAuth）
    └── miscHandlers      → 图谱/搜索/剪贴板/内容识别
    │
    ▼
Services（src/main/services/）
    │
    ├── agent/            → Agent 工具定义 + Session 管理
    │   ├── tools.ts       → TOOL_DEFS + TOOL_HANDLERS
    │   ├── sessionManager.ts → Agent 会话生命周期
    │   └── types.ts       → 类型定义
    ├── ai/               → AI 调用 + Chat 窗口
    │   ├── SelfAgentAdapter.ts（~109行）
    │   ├── aiService.ts   → callAI / callAIGateway
    │   ├── aiChatTools.ts → AI Chat 工具注册
    │   └── aiChatWindow.ts → AI Chat 窗口管理
    ├── database.ts       → vault 路径 / 文件索引
    ├── operations/crud.ts → 文件 CRUD（InVault + DB-aware）
    ├── graph.ts           → 知识图谱构建
    ├── search/            → 全文搜索 + RAG 检索
    ├── briefing/          → 每日简报生成
    ├── lint/              → Lint 报告 + 维护任务
    └── ...
```

---

## 三、模块速查

### IPC Handlers（src/main/ipc/）

| 文件 | 职责 | 关键 IPC |
|------|------|---------|
| `vaultHandlers.ts` | vault 创建/打开/最近 | `vault:open/create/listDir/getLast` |
| `fileHandlers/index.ts` | 文件 CRUD 总入口 | 委托到 crud/import/misc/trash |
| `fileHandlers/crudHandlers.ts` | 文件读/写/删/移/搜 | `file:read/write/delete/move/rename/list/search` |
| `fileHandlers/importHandlers.ts` | 文件导入 + 拖放 | `file:import/importFromDialog` |
| `fileHandlers/trashHandlers.ts` | 垃圾桶 | `file:trash/list/restore/delete/empty` |
| `fileHandlers/miscHandlers.ts` | 渲染/格式转换 | `file:render/convert/getSupportedExtensions` |
| `conversationHandlers.ts` | AI 对话 + Agent 会话 | `chat:ask/askStream/sessions` |
| `importHandlers.ts` | 导入窗口 + 自动导入 | `import:open/autoTrigger` |
| `maintainHandlers.ts` | 维护+Lint+Schema | `maintain:run/lint` `schema:list/getPending` |
| `authHandlers.ts` | 认证 | `auth:getToken/clear/openLogin` |
| `miscHandlers.ts` | 图谱/搜索/剪贴板 | `graph:load/rebuild` `clipboard:start` `query:vault` |

### Services（src/main/services/）

| 服务域 | 关键文件 | 职责 |
|--------|---------|------|
| **agent/** | `tools.ts`, `sessionManager.ts`, `types.ts` | Agent 工具定义 + 会话管理 |
| **ai/** | `SelfAgentAdapter.ts`, `aiService.ts`, `aiChatTools.ts`, `aiChatWindow.ts` | AI 调用 + Chat UI |
| **database** | `database.ts` | vault 路径 + 文件索引 DB |
| **operations** | `crud.ts`, `converters.ts`, `enrich.ts`, `fileProcessor.ts` | 文件操作 + 转换 |
| **graph** | `graph.ts` | 知识图谱（TF-IDF + 边构建）|
| **search** | `search.ts`, `query.ts`, `ragService.ts`, `indexService.ts` | 搜索 + RAG |
| **frontmatter** | `parse.ts`, `template.ts`, `links.ts` | YAML frontmatter |
| **chat** | `chat.ts`, `chatSessions.ts` | 会话管理 + askQuestionStream |
| **briefing** | `briefing.ts`, `bubbleState.ts` | 每日简报 |
| **lint** | `lintReports.ts`, `maintain.ts` | Lint + 维护 |
| **schema** | `schemaStorage.ts` | Schema 管理 |
| **clipboard** | `clipboard.ts` | 剪贴板 + Bubble 窗口 |
| **urlFetch** | `index.ts`, `providers.ts` | URL 抓取（微信/YouTube/B站等）|
| **memory** | `agentMemory.ts` | Agent 记忆系统 |
| **utils** | `whisper.ts`, `resolver.ts`, `operationLog.ts` | 工具函数 |

### Agent 工具（Agent Tools）

> 定义位置：`src/main/services/agent/tools.ts`

| 工具 | 参数 | 用途 |
|------|------|------|
| `read` | `{path}` | 读取 vault 内文件内容 |
| `write` | `{path, content}` | 写文件（.md 自由路径，非 .md → `_output/`） |
| `edit` | `{path, oldText, newText}` | 精确文本替换编辑 |
| `bash` | `{cmd}` | 执行 shell 命令（安全沙箱，禁止 rm -rf / 路径遍历） |

### AI Chat 工具（aiChatTools）

> 定义位置：`src/main/services/ai/aiChatTools.ts`

| 工具 | 用途 |
|------|------|
| `listFiles` | 列出 vault 文件树 |
| `readFile` | 读文件内容 |
| `searchFiles` | 全文搜索 |
| `writeWiki` | 创建/更新 wiki 页面 |
| `renameFile / moveFile / deleteFile` | 文件操作 |
| `createFolder / deleteFolder` | 文件夹操作 |
| `importFiles / importFilesFromDialog` | 文件导入 |
| `runLint` | 触发 Lint 健康检查 |

### Renderer 组件（src/renderer/components/）

| 组件 | 职责 |
|------|------|
| `VaultRouter.tsx` | 主面板路由（编辑/图谱/设置/Lint/日志） |
| `FileTree.tsx` + `FileTreeNode.tsx` | 递归文件树 |
| `FileTreeContextMenu.tsx` | 右键菜单（打开/重命名/删除/转化/复制路径） |
| `FileTreeHoverPreview.tsx` | 文件悬停预览 |
| `Editor.tsx` | Markdown/Office 编辑器 |
| `EditorContextMenu.tsx` | 编辑器右键菜单 |
| `EditorHeader.tsx` | 编辑器顶部栏（文件名/保存/预览切换） |
| `KnowledgeGraph.tsx` + `KnowledgeGraphViz.tsx` | D3 知识图谱 |
| `SearchPanel.tsx` + `SearchResults.tsx` | 浮层搜索 |
| `OutputPanel.tsx` | Agent 产出面板（`_output/README.md`） |
| `MemoryPanel.tsx` | 对话摘要面板 |
| `BacklinksPanel.tsx` | 反向链接面板 |
| `LintPanel.tsx` | Lint 结果面板 |
| `SchemaPanel.tsx` | Schema 管理面板 |
| `SettingsPanel.tsx` | 设置面板 |
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

---

## 四、关键机制

### 1. Agent 系统
- **入口**：`SelfAgentAdapter.ts（~109行），自研实现，不依赖 pi-agent-core
- **工具**：4 个原子工具（read/write/edit/bash），由 `agent/tools.ts` 定义
- **会话**：`agent/sessionManager.ts` 管理生命周期
- **系统提示**：`templates/LLM-wiki.md` + `templates/Agents.md`
- **上下文**：读 `index.md` 理解 vault 结构，不走 RAG 向量检索
- **输出约束**：非 `.md` 文件 → 自动 `_output/`（双层：system prompt + handler）

### 2. 核心动线
```
拖文件到 _raw/ → 右键「转化」→ Agent 读 index.md 
  → 分析 topic → 生成 _wiki/{topic}/xxx.md → 更新 index.md
```

### 3. Bubble 剪贴板
- 悬浮窗口，拖放/粘贴内容
- IPC：`bubble:expand/drop/save/move`
- 文件：`services/clipboard/clipboard.ts` + `main/bubble.html`

### 4. IPC 通信约定
- **renderer → main**：`ipcRenderer.invoke('channel', ...args)`
- **main → renderer**：`webContents.send('channel', data)`
- preload 用 `contextBridge` 安全暴露 `window.api`

### 5. vault 目录结构
```
_vault/
├── _raw/       # 原材料（用户导入的文件）
├── _wiki/      # AI 生成的知识页面
├── _briefing/  # 每日简报 + 对话摘要
│   └── conversations/
├── _schema/    # 领域 schema
├── _lint/      # Lint 报告
├── _output/    # Agent 产出物（非 .md 文件）
└── index.md    # Agent 导航索引（最重要）
```

---

## 五、开发常用命令

```bash
# 开发
npm run dev          # 启动开发模式
npm run build        # 构建生产版本

# 测试
npm test             # 单元测试（18 files，273 tests）

# 打包
npm run package      # 打包安装包
```

---

## 六、文档导航

| 文档 | 用途 |
|------|------|
| `ENGINEERING_MAP.md` | 本文档：工程导航地图 |
| `API.md` | IPC handler 接口参考（95+ handlers） |
| `ARCHITECTURE_REVIEW_V4.md` | 架构审查报告 |
| `CHANGELOG.md` | 版本变更记录 |
| `QA_TEST_CASES.md` | QA 测试用例 |
| `CODING_STANDARDS.md` | 编码规范 |
| `SKILLS.md` | 技能文档 |
| `pre-launch-checklist.md` | 上线检查清单 |

---

## 七、常见任务对照

| 任务 | 改哪里 |
|------|--------|
| 新增 UI 组件 | `src/renderer/components/` |
| 新增 IPC handler | `src/main/ipc/` + `preload/index.ts` |
| 新增 Agent 工具 | `src/main/services/agent/tools.ts`（TOOL_DEFS + TOOL_HANDLERS） |
| 修改 Agent 会话 | `src/main/services/agent/sessionManager.ts` |
| 修改 system prompt | `src/main/templates/LLM-wiki.md` |
| 修改 AI Chat 工具 | `src/main/services/ai/aiChatTools.ts` |
| 修改 Bubble 行为 | `services/clipboard/clipboard.ts` + `bubble.html` |
| 修改文件树 | `FileTree.tsx` + `FileTreeNode.tsx` |
| 修改右键菜单 | `FileTreeContextMenu.tsx` / `EditorContextMenu.tsx` |
| 修改 vault 初始化结构 | `src/main/templates/` |
| 新增 Lint 检查项 | `src/main/services/lint/maintain.ts` |
| 修改文件导入逻辑 | `fileHandlers/importHandlers.ts` + `operations/fileProcessor.ts` |
| 修改 AI 服务调用 | `services/ai/aiService.ts` |
| 修改 Schema 系统 | `maintainHandlers.ts` + `services/schema/schemaStorage.ts` |
| 修改 WikiLink 跳转 | `src/renderer/App.tsx`（handleEditorWikiLink） |
