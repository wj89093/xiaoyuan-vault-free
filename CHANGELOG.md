# 晓园 Vault 开源版 变更日志

> 当前版本：v1.10.0-free
> 发布日期：2026-07-16
> 最近更新：2026-07-16（v1.10.0 Preload 全面重构 + as any 清零 + 3 个 service 测试 backport）

---

## 2026-07-16 — v1.10.0-free Preload 全面重构 + as any 清零（2 commits）

### 主题

backport team 仓 v0.14 (Preload 全面重构 + as any 清零) 到 free 仓，补齐 free 仓与 team 仓的工程实践差距。**free 仓为开源版, team 专属功能不 backport**（跨 vault artifact / 邀请 / 成员 / PR / 权限 / AI 问答）。

### Refactored

- **window.d.ts 全面重写** (`5a780ed`, 4 文件 +275/-223) — backport team `49c6b8e`
  - 删 315 行手工维护的混合 flat+namespace `XyVaultAPI` interface
  - 改为纯 namespace 结构 (15 个 ns: vault/file/schema/lint/url/converter/query/auth/settings/graph/maintenance/clipboard/shortcuts/import/skill/build), 跟 preload `const api` 完全对齐
  - 加全局变量 `__vaultPath` / `__cmView` / `toast` 类型声明
  - 保留 flat aliases (向后兼容, Phase 2 改 renderer 后删)
  - **暴露 3 个隐藏 bug** (之前 any 掩盖): FileTree `deleteFile` 缺 vaultPath 参数 / IconSidebar toast 类型不匹配 / TrashPanel `trashList` 返回 `unknown[]` 类型不匹配

### Added (核心 service 测试)

- **3 个 service 测试 backport** (`6a91e82`, 4 文件 +1432/-1) — backport team `9e8fcb9`
  - `backupManager.test.ts` (25 case, +392): mock fs 覆盖 create/list/preview/restore/delete/backupCount 全路径
  - `maintain.test.ts` (30 case, +700): mock 7 个外部依赖, 覆盖 orphan/stale/deadLinks/missingFields/conceptGap/suggestedLinks/矛盾检测/callAI 容错/wikiHealth 告警
  - `graphBuild.test.ts` (8 case, +299): mock fs+frontmatter+graphStorage+graphTFIDF, 删 5 case (team 专属 `buildCrossVaultArtifacts`)
- **测试覆盖**: 351 → **414 passed** (+63 case), 31 → 34 文件, skipped 5 → 1
- **free↔team 适配**: 加 `// @vitest-environment node` (free 仓 vitest 默认 jsdom, mock fs/promises 缺 default export)
- **test-setup.ts 加 Element 守卫**: scrollIntoView mock 只在 jsdom env 生效 (node env 测试需要)

### Not Backported (team 专属功能)

- **P2 VaultRouter 拆分** (`96f16c7`) — 推迟到下次, 需评估 useVaultSwitch hook 在 free 仓是否适用
- **跨 vault artifact** (`buildCrossVaultArtifacts`) — free 仓无 team vault 概念
- **邀请 / 成员 / PR / 权限 / AI 问答 / 双 vault 切换** — Pro 专属功能
- **as any 剩余 9 个 commit** (`a9c427c`/`c60c8f8`/`c6a1e1f`/`c07eabe`/`cc77409`/`70adf6b`/`31506dc`/`6bd0f1a`/`37a8b15`) — 部分已 backport, 剩余需逐项评估 free↔team 差异

### Verification

- `tsc -b`: 0 errors
- `eslint --max-warnings 0`: 0 errors, 0 warnings
- `vitest`: **414 passed**, 1 skipped (34 files)
- `build`: 5.74s

### Commits (2)

| commit | 内容 | +/- |
|--------|------|-----|
| `5a780ed` | refactor(types): P0 preload/window.d.ts 类型对齐 | +275/-223 |
| `6a91e82` | test: P1 补充 3 个核心 service 测试 | +1432/-1 |

---

---

## 2026-06-12 — v1.9.0-free Obsidian 模式 + 两层状态模型（6 commits）

### 主题

让外部 AI 能以**接近零成本**了解 vault 状态。设计哲学：

> **AI 不在乎物理路径，在乎“有什么能 read”**。所以在 `_state/` 下提供一系列 SUMMARY / INDEX 文件，让 AI 启动后读 8KB 就能全盘了解 vault，不需要递归 ls / 调 IPC / 读完整图谱。

### 两层状态模型

```
_state/         ← AI 可见 (摘要 + 索引) [v1.9 完备]
  VAULT_STATE.json          当前 vault (个人/团队) + 切换状态 (v1.8.0)
  FS_CACHE.json             vault 一级文件树快照 (v1.8.0)
  STATE_MAP.json            状态地图 — 列出 vault 所有可读状态 + 用途 (v1.9 NEW)
  graph/SUMMARY.json        图谱健康度 (orphan/broken/topDomains) (v1.9 NEW)
  schemas/INDEX.json        schema 目录索引 (folder/field/confirmed) (v1.9 NEW)
  lint/SUMMARY.json         lint 健康度 (deadLinks/pendingFixes) (v1.9 NEW)

.xiaoyuan/      ← 内部数据 (完整源, AI 也能读但不推荐默认)
  index.db                  SQLite 主索引 (v1.4+)
  graph.json                完整图谱 (drill-down 用)
  schemas/<folder>.json     per-folder schema 源
  lint-reports.json         最近 30 个完整 lint 报告
  folder-map.json           folder→type 映射
  tasks.json                后台任务队列
  chat/ skills/             chat 与 skill 内部数据
```

### 量化成果

| 维度 | v1.8.0 起点 | v1.9.0 | 提升 |
|------|-------------|--------|------|
| 外部 AI 了解 vault 状态 | 递归 ls + 猜路径 + 读完整 graph.json | 读 3 个 SUMMARY/INDEX (共 8KB) | **~95% token** |
| AI 入门步骤 | 0 步 (无手册) | 读 STATE_MAP 一次 | **入门门槛 0 → 1** |
| `_state/` AI 可见文件 | 2 (VAULT_STATE, FS_CACHE) | 6 (加 STATE_MAP, graph/SUMMARY, schemas/INDEX, lint/SUMMARY) | **+200%** |
| 状态变更触发 SUMMARY 重建 | 0 | graph save / schema save / lint save | **实时同步** |

### 6 个 commit

1. `968d74f` fix: typecheck + lint cleanup (tsc -b reveal pre-existing errors)
2. `6faf1e7` test: fix 3 pre-existing test failures
3. `18ef8bf` feat(state): v1.9 STATE_MAP.json — AI 入门手册
4. `eb9cca9` feat(state): v1.9 graph/SUMMARY.json — 图谱健康度摘要
5. `faa4db8` feat(state): v1.9 schemas/INDEX.json — schema 目录索引
6. `9c11ed2` feat(state): v1.9 lint/SUMMARY.json — lint 健康度摘要

### 关键设计决策

- **不统一物理路径** — AI 不在乎路径，在乎"有什么能 read"
- **摘要优于全量** — 不搬完整 graph 到 _state/，只搬数字
- **静默更新** — 所有 SUMMARY/INDEX 写入 `catch {}`，AI 读旧值比报错好
- **低频不污染高频** — STATE_MAP 只在 vault 切换时写，graph/SUMMARY 只在 saveGraph 末尾写
- **渐进迁移** — 按“AI 用得多”逐个加，不一蹴而就
- **动态 import 解循环** — schemaStorage ←→ schemasIndex / graphStorage ←→ graphSummary / lintReports ←→ lintSummary 都用 `await import()` 解初始化竞态

### 单元测试覆盖

- `stateMap.test.ts`: 4 tests
- `graphSummary.test.ts`: 7 tests
- `schemasIndex.test.ts`: 6 tests
- `lintSummary.test.ts`: 6 tests
- **总 +23 新 tests，v1.9 总计 240/241 pass** (+23 from v1.8.0 217/218)

### 外部 AI 启动后推荐读顺序

1. `_state/STATE_MAP.json` (~2KB) — "vault 有什么状态文件"
2. `_state/VAULT_STATE.json` (~0.5KB) — "现在打开的是哪个 vault"
3. `_state/graph/SUMMARY.json` (~1KB) — "图谱健康度"
4. `_state/schemas/INDEX.json` (~1KB) — "哪些 folder 有 schema"
5. `_state/lint/SUMMARY.json` (~1KB) — "vault 整体健康度"
6. 按需 drill-down 到 `.xiaoyuan/*.json`

总计 **~7KB** 对 AI 几乎无成本，**5 个 read = 全盘了解 vault**。

---



---

## 2026-06-05 — v1.7.0-free Agent 端省 token + 提效接口（5 commits）

### 量化成果

| 维度 | v1.6.3 起点 | 现在 | 提升 |
|------|-------------|------|------|
| `skill:loadDefault` system prompt tokens | ~4K (全拼 7 个 skill) | **可选** `skills=['ingest','query']` | **~3-4K / 启动** |
| `query:vault` 返 source 数 | 50 LIMIT 固定 | `maxResults` (默认 50) + `topic` folder 过滤 | **~50% 搜索 token** |
| `briefing:getConversations` 返摘要数 | 全部当日 | `topic` + `maxResults` | **~60% 记忆读取 token** |
| `kg:queryTopics` 存在性 | **不存在**（Agent 只能视觉截图） | 新增 `(name?, options?)` IPC | **KG 可文本查询** |
| Agent 启动可见 Skill 数 | 7 | 1-2（按触发词） | 上下文 **不被打扰** |

### 主题一：Skill 动态注入（最大 token 节省）

- **`5add481` `composeInjectedSkillText(vaultPath, skills?)` 按需注入**：
  - `undefined`/空数组 → 拼全部 7 个 Skill（v1.5 行为，向后兼容）
  - `string[]` → 只拼列出的 Skill 详情（按文件名匹配，字母序）
  - **caps（编辑器能力）始终拼**：轻量，Agent 都需要
- **`skill:loadDefault(_, skills?)` IPC 接参数**：Agent 启动时传 `['ingest','query']` 只拿 1-2 个 Skill 详情，省 5-6 个无关 Skill 的内容
- 测试覆盖（5 个）：拼全部 / 拼 1 个 / 拼 2 个 / 拼不存在的 Skill / caps 始终拼

### 主题二：query:vault 过滤

- **`79b4596` `query:vault` 接受 `options` 参数**：
  - `searchFiles(query, { limit?, topic? })` — SQL LIMIT 改参数 + `topic` 加 `WHERE folder = ?` 过滤
  - `queryVault(question, { topic?, maxResults?, maxWikiFiles? })` — Step 0（wiki 遍历）只看指定 topic 目录（跳过 `index.md` 全部 topic）；Step 1（FTS5）LIMIT + topic folder 过滤；Step 2（合并截断）到 `maxResults ?? 5`
- Agent 收益：传 `topic='合同管理'` → 跳其他 topic 目录 + Step 1 只扫 `_wiki/合同管理/` 文件

### 主题三：KG 文本查询

- **`00cc793` `kg:queryTopics(name?, options?)` 新增 IPC**（替代 Agent "看 KG 截图猜节点"）：
  - name 不传 → 返所有节点 + 边（LIMIT 500 防暴）
  - name 传 → 按 title / tags 模糊匹，返匹中节点 + 邻接边
  - `maxNeighbors`（默认 10）：限制每个匹中节点最多 N 条边
  - 实现：纯 in-memory 过滤 `loadGraph()` 结果，**不改 graph service**
- preload `graph.queryTopics` 暴露

### 主题四：briefing 过滤

- **`d54893a` + `f34f1c7`**：`briefing:getConversations` 接受 `topic` + `maxResults` 过滤
- `getConversationSummaries(date, options?)` — 循环读完后在末尾过滤 topic + 截断 maxResults（不改循环内 push，保持 v1.6 兼容）
- 跨日期查同 topic 时尤其省（"合同管理 的所有历史决策" → 只返该 topic 摘要）

### 主题五：教训

- **`f34f1c7` briefing.ts 漏实现 options 过滤代码**：前 commit `d54893a` 改了 IPC + preload + briefing.ts 函数签名（接 `options`），但**没**实际实现过滤代码。`@typescript-eslint/no-unused-vars` 报告 `'options' is defined but never used`。教训：**改了函数签名接新参数必须同步实现**，Lint 报 unused args 不算"功能完整"。

### Commits

1. `5add481` — Skill 动态注入
2. `79b4596` — query:vault 接受 topic + maxResults
3. `00cc793` — kg:queryTopics 新增 IPC
4. `d54893a` — briefing:getConversations 接受 topic + maxResults（**参数化，但漏实现**）
5. `f34f1c7` — briefing.ts 加实际过滤代码（前 commit 漏实现）

### v1.7.0 末尾增量（2 commits）

| Commit | 主题 |
|---|---|
| `e461695` | refactor(v1.7): 抽 `queryTopicsFromGraph` 纯函数（kg:queryTopics 从理论到实证）|
| `660342c` | feat(v1.7 P1-2): conversation-summary 按 topic 跨日累积（跨 session 知识连续）|

---

## 2026-06-05 — v1.6.3-free dmg 启动闪退 + UI 设计契约 + pre-commit 防御（10 commits）

### 量化成果

| 维度 | v1.6.2 起点 | 现在 | 提升 |
|------|-------------|------|------|
| dmg 启动闪退（macOS 26 + Apple Silicon） | 是 (Squirrel.framework 触发 c-ares 链) | **修** | dmg 可正常启动 |
| UI 设计契约符合度 | 0% | 100% | 颜色 / 间距 / 阴影 / 动效全 token 化 |
| memo bug 防御 | 手动 | **自动化** | pre-commit hook + check-memo-import.sh |
| 重复 inline style（3 处共享） | 是 | **抽** ThemeToggleButton | DRY + 维护性 |
| CSS gap 失效（30 处 sed 残留前导逗号） | 是 | **修** | gap 全部生效 |
| 内部 `'<button>' 内联 'color: #fff' 硬编码 | 2 处 | 0 处 | 走 `var(--color-text-inverse, #fff)` |

### 主题一：dmg 启动闪退修复（最关键，用户可感知）

- **`3cf79ed` dmg 启动闪退 - 删 Squirrel.framework**：用户报告 v1.6.1-free dmg 在 Mac mini M4 / macOS 26.5.1 / ARM-64 上启动后 0.2 秒崩溃（EXC_BREAKPOINT / SIGTRAP，code 5）。崩在 `ares_llist_replace_destructor` + c-ares DNS 解析链。**根因**：Squirrel.framework（Electron 模板自带的 Mac 自动更新器）在 macOS 26 + Apple Silicon 启动时崩 c-ares 链路。Squirrel 1.0 是 32-bit Mach-O 时代设计，现代 macOS 26 已不兼容。Free 仓库**不用 autoUpdater**（不调 Squirrel 任何 API），删后启动正常。修法：`scripts/after-pack.js` 新建（electron-builder afterPack hook，递归找 Squirrel.framework 删）+ `electron-builder.json` 加 `afterPack: scripts/after-pack.js` + 顺手修 v1.6.2 commit `4ed7ae8` 留下的 `resources/whisper` extraResources 配置 bug。

### 主题二：UI 设计契约一致性（对照 Pro 仓库 `docs/UI.md` v2.0）

- **`55e2570` UI 设计契约一致性**（focus-visible + 阴影 token + 4px 网格间距）：21 个文件，187 insertions / 260 deletions
  - 颜色契约：656 处 `var(--color-*)` 引用，**0 处**硬编码 hex
  - 间距契约：85 处 `var(--space-*)` 引用，4px 网格统一（`6px → var(--space-2)` / `10px → var(--space-2)` 等）
  - 动效契约：28 处 `var(--transition-*)` 引用
  - 阴影契约：1 处 `var(--shadow-sm)` 修复（KnowledgeGraphViz）
  - **focus-visible 契约**（UI.md 设计契约 #8）：`global.css` 末尾加全局 `*:focus-visible { outline: 2px solid var(--color-primary) }` fallback，覆盖除 `.btn / .btn-icon / .editor-header-crumb` 之外的可聚焦元素；`input / textarea / contenteditable` 排除（用户已在输入，不需要 Tab 聚焦轮廓）
- **`9f416ab` 面板 transition 统一**（3 个面板）：LintPanel 健康检查/刷新按钮 + MemoryPanel 刷新按钮 + BacklinksPanel `.backlinks-item` hover，加 `transition: var(--transition-base)`，条件状态切换时 background / cursor / color 平滑过渡（150ms ease）
- **`0d5eb53` 2 处主按钮 `'#fff'` → `var(--color-text-inverse, #fff)`**：VersionHistoryPanel + ErrorBoundary 重试按钮

### 主题三：CSS gap 失效真因修复

- **`9373099` 30 处 sed 残留前导逗号 bug**（CSS gap 失效）：v1.6.3 commit `1d2f1f8` 修缺逗号时**同时产生新 bug**——sed 把 `gap: 4,fontSize: 12` 中的 `4` 替换成 `'var(--space-1)'` 时，原始 `,` 残留成前导逗号：`gap: ',var(--space-1)'`（字符串值是 `,var(--space-1)`）。React 渲染时 CSS 收到 `gap: ,var(--space-1)`（前导逗号）—— CSS 无效，**gap 完全不生效**。**30 处组件 UI 间距全错**。测试 196/196 + Lint 0 errors 都过了（没真测 CSS 渲染）。修：直接字符串替换 `gap: ',var(--space-` → `gap: 'var(--space-`，30 处一次性清。13 个文件涉及。

### 主题四：防御自动化

- **`1b6e266` pre-commit hook 自动跑 check-memo-import.sh**：防御 v1.5 commit `b453511` 那种"批量加 memo 漏 import" bug 再犯（v1.5 漏 10 个文件，dev 跑 ReferenceError）。方案：`.githooks/pre-commit` + `scripts/install-hooks.sh`（git 社区标准，**不依赖 husky** npm 包）。用户首次使用：`npm run precommit:install`。改 .tsx 提交时自动跑 hook，漏 memo import 时 commit 会被拒绝。
- **`585cd7c` `precommit:install` npm 脚本**：加到 package.json scripts。

### 主题五：重构

- **`6364dd0` 抽 ThemeToggleButton 小组件**：ThemeSection 内 3 个主题切换按钮（浅色/深色/自动）共享完全相同的 inline style（`display/alignItems/gap/fontSize/padding` 5 个属性）。抽 ThemeToggleButton 内部组件（不抽通用 Button——那个范围太广，10 个 button 都已用 className + CSS 抽好的，**只有** 3 处 ThemeSection 重复值得抽）。
- **`1d2f1f8` 30 处 sed 残留缺逗号**（**产生了新 bug，见主题三**）：eslint 和 vitest 都没抓到这个 bug 的"修复"，下一次类似 sed 改字符串要更稳——加 `re.sub(r"(\1,)", r"\1',")` 这种保留逗号的方式，或者直接字符串替换不用 regex。

### Commits

1. `3cf79ed` — dmg 启动闪退 - 删 Squirrel.framework
2. `1d2f1f8` — sed 残留 sed 改 gap 后的缺逗号（**产生新 bug**，见 9373099）
3. `9f416ab` — 面板 transition 统一
4. `55e2570` — UI 设计契约一致性（focus-visible + 阴影 token + 4px 网格）
5. `1b6e266` — pre-commit hook 自动跑 check-memo-import.sh
6. `585cd7c` — npm run precommit:install 加 package.json
7. `0d5eb53` — 2 处主按钮 color '#fff' → var
8. `9373099` — 30 处 sed 残留前导逗号 bug（CSS gap 失效真因）
9. `6364dd0` — 抽 ThemeToggleButton 小组件
10. `46bbd9a` — E2E_TESTING.md 修路径残留（test-vault-e2e → tests/e2e-vault，**v1.6.2 末尾遗留**）

---

## 2026-06-05 — v1.6.2-free dmg 优化 + 测试补全 + 仓库整理（4 commits）

### 量化成果

| 维度 | v1.6.1 起点 | 现在 | 提升 |
|------|-------------|------|------|
| x64 dmg | 151M | **117M** | **-23%**（累积 -45%）|
| arm64 dmg | 146M | **112M** | **-23%**（累积 -46%）|
| app.asar | 137M | **49M** | **-64%**（累积 -87%）|
| 注入层测试 | 4 个 | **13 个** | +9 |
| 根目录项 | ~24 | **~22** | 去 2 个子目录 |

### dmg 优化（3 轮排除）

- **第一轮**（commit `c24c33b`）—— 排除 9 个 main 0 import 的包（lucide-react 28M / @napi-rs 23M / pdf-parse 20M / react-dom 7M / cytoscape 5M 等），**dmg 151M → 123M**
- **第二轮**（commit `e2293fb`）—— 排除 5 个 vendor 替代明确的包（katex 4M / d3 4M / react-router 3M / codepage 6M / zrender 4M），**123M → 118M**
- **第三轮**（commit `8e8427d`）—— 依赖链排查后排除 4 个链尽头包（es-toolkit 9M / zlibjs 4M / underscore 3M / lodash-es 3M），**118M → 117M**
- **根因**：webpack 把 mermaid/echarts/xlsx 等打进了 vendor chunks，但 electron-builder 仍把原始 node_modules 装进 asar——**重复装**。三波排除共 25+ 个包。

### 测试

- **注入层测试**（commit `255d501`）—— 抽出 `composeInjectedSkillText(vaultPath)` 纯函数，加 9 个测试覆盖 v1.5 commit 523e660 的 A 内容源 + D 注入层。4 个场景（vault 无 cap/skills/两者都有/排序/静默失败）

### 仓库整理

- commit `c42a167` —— `test-vault-e2e/` → `tests/e2e-vault/`，`release-notes/` → `docs/release-notes/`，根目录减少 2 个子目录

### Commits

1. `255d501` — 注入层测试覆盖（+9 测试）
2. `c24c33b` — 排除 9 个 main 0 import 的包（dmg -19%）
3. `e2293fb` — 排除 5 个 vendor 替代明确的包（dmg -4%）
4. `8e8427d` — 排除 4 个依赖链尽头包（dmg -1%）
5. `c42a167` — 仓库整理（move 2 个子目录）

---

## 2026-06-05 — v1.6.1-free Skill 模板体系完整 + 文档同步 + dmg -29%（16 commits）

### 量化成果

| 维度 | v1.6.0 起点 | 现在 | 提升 |
|------|-------------|------|------|
| Skill 模板数 | 9 | **7** | -22%（删 2 个低价值） |
| 模板 ↔ 面板字段脱节 | 2 处 | **0** | -100% |
| skills-templates 测试 | 21 | **24** | +3 项对齐断言 |
| 组件漏 `import memo` | 10 | **0** | -100%（2 波修复） |
| Pro 仓库残留 | 3 文件 660K | **0** | -100% |
| 安装包 x64 dmg | 212M | **151M** | **-29%**（-61M） |
| 安装包 arm64 dmg | 207M | **146M** | **-29%**（-61M） |

### 主题一：Skill 模板体系

- **conversation-summary.md** — frontmatter 改 5 字段对齐 MemoryPanel.ConversationSummary（`date/time/title/topic/sources`），移除 `participants/tags`，`relatedFiles` → `sources`（briefing.ts 实际字段名），正文 sections 改 `讨论了什么/关键决策/下一步`，修 markdown 嵌套 bug
- **lint.md** — 加 `## 输出格式` 块（之前缺），5 类汇总对齐 LintPanel stats（`totalFiles/orphanPages/deadLinks/stalePages/contradictions`），移除"字段缺失"（LintPanel 不支持），表格说明每个分类的渲染颜色
- **删 2 个低价值 Skill 模板**（`write.md` / `list-sessions.md`）—— 跟 ingest 重叠 / 无面板渲染

### 主题二：全文搜索升级

- **SearchPanel 加 snippet + 高亮**（commit `e0f6f14`）—— search.ts SQL 用 SQLite FTS5 `snippet()` 函数，前后 16 tokens 上下文 + `<mark>关键词</mark>` 包裹；SearchPanel 用 React 组件化拆 mark 段（**不用** `dangerouslySetInnerHTML`，React 自动 escape 文本段，**安全**）
- **ShortCutGuide 措辞改精确**（commit `e0f6f14`）—— `Cmd+F` 改"搜索文档内容 (SearchPanel FTS5)" / `Cmd+P` 改"按名快速切换文件 (QuickSwitch)"

### 主题三：v1.5 memo bug 清零（10 个组件）

- **fb70e08** — 5 个组件漏 import `memo`（EditorHeader / FileTreeContextMenu / IndexNav / LintPanel / LogPanel）—— v1.5 批量加 memo 时漏 import
- **32e4bf5** — 第二波 5 个（MemoryPanel / OutputPanel / **Sidebar** / TrashPanel / VersionHistoryPanel）—— 第一次 `head -5` 截断漏的
- **防御脚本** `scripts/check-memo-import.sh`（32e4bf5 一起加）—— 扫所有 .tsx 找用 `memo(` 但漏 import 的文件，兼容 4 种 import 形式（含 `import React, { memo }` 复合）

### 主题四：开发工具

- **scripts/build-free.sh** 修 2 个 bug（`79fbc8d`）—— ① 双重 `-free` 后缀（v1.6.1 package.json 已带 `-free`，脚本不应再拼）；② `set -e` 异常时 `trap` 恢复 package.json
- **scripts/dev-restart.sh** 新建（`9d3fa7d`）—— 一键 kill 老 dev + 启新，解决 vite HMR 对 import 头变更不生效
- **scripts/check-memo-import.sh** 新建（`32e4bf5`）—— 同上

### 主题五：仓库清理（Pro 残留）

- `4ed7ae8` — 删 Pro 残留（`resources/whisper/` 3 tracked 656K + `resources/scripts/postinstall.sh` 4K + 2 traineddata 7.4M，**untracked**）+ 临时测试目录（`test-tmp-*` 16K）
- `2b6e982` — `.gitignore` 加 `resources/whisper/` + `resources/scripts/` 防御

### 主题六：文档同步

- `64c2c51` — 元数据（package.json / README / CHANGELOG 头部）同步 v1.6.1
- `35cc184` — docs/ 同步 v1.6.1：SKILL_WORKFLOW 重写（删 HTTP 协议描述、改 AGENTS.md 工作流）、ENGINEERING_MAP Free 视角（更新组件/hooks/services 数字 + 删 Pro 专属章节）
- `cbec9b6` — E2E 测试套件（`test-vault-e2e/` 8 文件 + `docs/E2E_TESTING.md` 5 步流程 + 6 项验收清单）—— 跨设备手动验证接口对齐
- `816a724` — DEPLOY.md 同步：删 v1.3 AI key（QWEN/MINIMAX/DEEPSEEK）、改 CI/CD 段（描述 release.yml 实际行为 + 5 步发布流程）、加 arm64 dmg 优先提示、加故障排查 4 行
- `625bd5a` — README 重写为产品视角（删头部版本号/日期 + version badge，加 📝 导航 CHANGELOG）

### 主题七：dmg 体积优化（commit `0ae9959`）

- **排除已 webpack 处理的包**（`electron-builder.json` `files` 加 `!**/node_modules/{mermaid,@mermaid-js,tesseract.js,tesseract.js-core,pdfjs-dist,exceljs,xlsx,mammoth,docx-preview,pptx-preview,echarts,@antfu,@babel}/**`）
- 根因：`node_modules/mermaid` 74M **+** `out/vendor-mermaid.js` 5.1M = **重复装**（webpack 已把 mermaid 打进 vendor chunk，但 asar 仍装原包）
- 收益：x64 dmg 212M → 151M（-61M，-29%），arm64 dmg 207M → 146M（-61M，-29%），app.asar 382M → 137M（-245M，-64%）

### Commits

1. `138444d` — Skill 模板 ↔ UI 接口对齐
2. `8da00c5` — 删 2 个低价值 Skill
3. `64c2c51` — 元数据同步 v1.6.1
4. `35cc184` — docs/ 同步 v1.6.1
5. `cbec9b6` — E2E 测试套件
6. `79fbc8d` — build-free.sh 双重 -free + trap
7. `fb70e08` — 5 个组件漏 import memo (第一波)
8. `9d3fa7d` — dev-restart.sh
9. `32e4bf5` — 5 个组件漏 import memo (第二波) + 防御脚本
10. `4ed7ae8` — 清理 Pro 仓库残留
11. `2b6e982` — .gitignore 加 Pro 残留规则
12. `625bd5a` — README 改为产品视角
13. `8618e2b` — release notes
14. `e0f6f14` — SearchPanel snippet + 高亮
15. `816a724` — DEPLOY.md 同步
16. `0ae9959` — 排除已 webpack 处理的包 (dmg -29%)

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
