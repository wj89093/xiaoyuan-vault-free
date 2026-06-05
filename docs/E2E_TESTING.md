# 跨设备 E2E 测试手册

> 适用：晓园 Vault v1.6.1-free
> 目的：在另一台设备上**手动**验证 v1.6.1 接口对齐（Skill 模板 ↔ UI 面板）
> 创建：2026-06-05

## 为什么需要这个

v1.6.1 修了 2 个 Skill 模板跟 UI 面板的字段脱节：
- `conversation-summary` frontmatter 5 字段 ↔ `MemoryPanel.ConversationSummary`
- `lint` 输出 5 类 ↔ `LintPanel.ParsedLintReport.stats`

`skills-templates.test.ts` 24 个断言锁住了"模板字符串"层面，但**没验证真实 Agent 触发 Skill 后 UI 渲染**——需要跨设备手动跑。

## 前置准备

### 1. 选 Agent

晓园 Vault 兼容任何 AGENTS.md 标准的 Agent：
- **Anthropic Claude Code**（推荐）
- **OpenAI Codex**
- **Cursor**（设置 → 启用 AGENTS.md）
- **Continue.dev**
- **OpenHands**

任选一个，**确保在另一台设备上已安装并能用 4 个原子工具**（read / write / edit / bash）。

### 2. 复制测试 vault

把 `test-vault-e2e/` 整个目录复制到另一台设备的某个路径（建议放在用户主目录，路径短一点方便输入）：

```bash
# macOS / Linux
cp -r ~/Desktop/xiaoyuan-vault-free/test-vault-e2e ~/MyTestVault

# Windows
xcopy /E /I C:\path\to\xiaoyuan-vault-free\test-vault-e2e %USERPROFILE%\MyTestVault
```

**结构**（已预生成）：
```
MyTestVault/
├── AGENTS.md               ← 用户侧 vault AGENTS.md（从 src/main/templates/Agents.md 复制）
├── LLM-wiki.md             ← AI 控制平面
├── system.md               ← 核心规则
├── index.md                ← 预生成 4 个占位 topic
├── log.md                  ← 空文件
├── _raw/2026-06/
│   ├── sample-contract.md  ← 合同样本
│   └── sample-meeting.md   ← 会议纪要样本
└── .gitignore              ← 排除 _wiki/_briefing/_lint/_output/_schema
```

### 3. 启动 Agent 加载 vault

在 Agent 里**进入 vault 根目录**（不是晓园 Vault 仓库根），让 Agent 加载 `AGENTS.md`：

- **Claude Code**：`cd ~/MyTestVault && claude`
- **Cursor**：File → Open Folder → 选 `~/MyTestVault`
- **Codex / Continue.dev**：类似，指向 vault 根

确认 Agent 报告"已加载 AGENTS.md"（每个 Agent 显示方式不同）。

---

## 5 步测试流程

### Step 1: 验证 Agent 上下文

**用户说**：`介绍一下这个 vault`

**期望**：
- Agent 回答中提到 4 个 topic（合同管理 / 会议纪要 / 技术方案 / 项目管理）
- Agent 提到 2 个原始文件（sample-contract.md / sample-meeting.md）
- 引用 `[[index]]` 或 `[[合同管理]]` 等

**验收**：
- [ ] Agent 提到 4 个 topic
- [ ] Agent 提到 2 个 _raw 文件
- [ ] 引用格式是 `[[页面名]]`

### Step 2: 触发 ingest（核心：v1.6.1 验证点 1）

**用户说**：`帮我整理 _raw/2026-06/sample-contract.md`

**期望**（按 ingest.md 模板）：
- Agent 读 `index.md` 了解 topic
- 读 `_raw/2026-06/sample-contract.md`
- 分析 topic = `合同管理`，type = `合同`，summary = "ABC 科技本地知识库定制合同 128 万"
- 写 `_wiki/合同管理/2026-06-12-ABC科技本地知识库定制合同.md`（含 frontmatter + 正文）
- 更新 `index.md`（合同管理文件数 0→1）
- 追加 `log.md`（`## [2026-06-XX HH:MM] ingest | sample-contract.md → 合同管理/2026-06-12-ABC科技本地知识库定制合同.md`）

**验收**：
- [ ] `_wiki/合同管理/` 目录下有 1 个新 .md 文件
- [ ] `index.md` 合同管理文件数变 1
- [ ] `log.md` 末尾追加 ingest 条目
- [ ] **打开晓园 Vault 桌面 app**（v1.6.1-free），FileTree 显示新文件，点击打开 → 渲染正确

### Step 3: 触发 ingest-batch

**用户说**：`导入 _raw/ 里的所有文件`

**期望**：sample-meeting.md 也被 ingest 到 `_wiki/会议纪要/2026-06-15-ABC科技项目启动会.md`，log.md 追加第二条。

**验收**：
- [ ] sample-meeting.md 被整理到 `_wiki/会议纪要/`
- [ ] log.md 有 2 条 ingest 条目

### Step 4: 触发 lint（核心：v1.6.1 验证点 2）

**用户说**：`检查知识库`

**期望**（按 lint.md 模板 v1.6.1）：
- Agent 跑 `bash("node server/tools/sys_health.js --scope _wiki/")`（如果 server/tools/ 在 vault 里；不在的话 Agent 直接分析）
- 输出 5 类统计：
  - `totalFiles: 2`（合同管理 1 + 会议纪要 1）
  - `orphanPages: 0`
  - `deadLinks: 0`
  - `stalePages: 0`
  - `contradictions: 0`
- 写 `_wiki/Lint报告-{日期}.md`
- 追加 `log.md`

**验收**：
- [ ] `_wiki/Lint报告-{日期}.md` 生成
- [ ] **打开晓园 Vault 桌面 app 的 LintPanel**（图标侧栏 → 代码检查图标）→ 5 类全部显示
  - [ ] 顶部显示 "2 个 wiki 页面"
  - [ ] 孤立页 / 死链 / 过期 / 矛盾 全部 0 个（健康状态）
  - [ ] stats 数字跟报告文件一致

### Step 5: 触发 query + stats + log（v1.6.1 验证点 3-5）

**用户说**：`查一下 ABC 科技的合同金额`

**验收**：
- [ ] query 回答引用 `[[2026-06-12-ABC科技本地知识库定制合同]]` 格式

**用户说**：`统计一下知识库`

**验收**：
- [ ] stats 输出 topic 数（2）+ 文档数（2）+ 节点/边数

**用户说**：`记录一下这个对话`

**验收**：
- [ ] `conversation-summary` 触发，写 `_briefing/conversations/{日期}/conv-{时间}.md`
- [ ] **打开晓园 Vault 桌面 app 的 MemoryPanel**（图标侧栏 → 记忆图标）→ 卡片正确显示
  - [ ] date / time 显示正确
  - [ ] title 显示对话标题
  - [ ] topic 显示（如果用户指定了 topic）
  - [ ] 决策段显示
  - [ ] 下一步段显示
- [ ] log.md 追加 conversation-summary 条目

---

## 验收清单总结

| 验证点 | Skill | 验证方式 | 期望 |
|--------|-------|----------|------|
| **1. ingest** | ingest.md | FileTree + Editor 打开 | 新文件渲染正确 |
| **2. lint 5 类** | lint.md | LintPanel 显示 | totalFiles / 4 类全 0 |
| **3. query 引用** | query.md | Agent 回答 | `[[文件名]]` 格式 |
| **4. stats 估算** | stats.md | Agent 回答 | topic 数 / 文档数 |
| **5. conversation-summary frontmatter** | conversation-summary.md | MemoryPanel 卡片 | 5 字段正确解析 |
| **6. log 自动追加** | log.md | 文件尾部 | ingest/lint/summary 条目 |

---

## 常见问题

### Agent 没自动加载 AGENTS.md

- **检查 Agent 是否 AGENTS.md 兼容** —— 晓园 Vault 不强制某个 Agent
- **检查 vault 根路径** —— Agent 应该 `cd ~/MyTestVault` 启动，不是 `cd` 到晓园 Vault 仓库根

### ingest 失败 / Agent 写错路径

- **检查 `_raw/{YYYY-MM}/` 路径** —— ingest 模板规定按月份子目录
- **检查 `index.md` 是否存在** —— 没有 index.md Agent 不知道有哪些 topic

### LintPanel 不显示 5 类

- **检查 LintPanel 是否读到报告** —— 点"健康检查"按钮手动触发
- **检查报告 frontmatter** —— `totalFiles / orphanPages / deadLinks / stalePages / contradictions` 5 个字段都有吗

### MemoryPanel 不显示对话

- **检查 `_briefing/conversations/{日期}/conv-{时间}.md` 是否存在** —— 不是只更新 _briefing/ 根
- **检查 frontmatter 5 字段** —— `date / time / title / topic / sources`

---

## 结果报告

测试完成后，在仓库提 issue / 写 memory 记录：

```
## E2E 测试结果

**设备**: [macOS / Windows / Linux]
**Agent**: [Claude Code / Cursor / Codex / Continue.dev / OpenHands]
**日期**: 2026-06-XX

### 验收结果
- [x] Step 1: Agent 上下文
- [x] Step 2: ingest
- [x] Step 3: ingest-batch
- [x] Step 4: lint 5 类
- [x] Step 5: query + stats + log + conversation-summary

### 发现的问题
（无 / 列出）

### 截图
（可选）
```

**反馈给**：v1.6.1 commit 138444d 的"接口对齐"是否真有效
