# 连接外部 AI

> 晓园 Vault 本身是一个知识库文件夹。外部 AI 工具(OpenClaw / Claude Code / Cursor / Continue.dev / Ollama 等)可以直接"打开这个文件夹"来接入。

## 快速开始

1. **记下这个 vault 的路径**:

   ```
   (你的 vault 路径)
   ```

2. **打开你的外部 AI 工具**,指向这个路径:
   - **OpenClaw**: `claw (vault 路径)`
   - **Claude Code**: `claude (vault 路径)`
   - **Cursor**: 打开文件夹 → 选这个 vault
   - **Continue.dev**: 在 VS Code 中打开这个文件夹

3. **AI 连接后**:AI 会自动读取 `AGENTS.md`(如果存在)并开始工作。

## Ai 读什么

- `AGENTS.md`（可选）— 工作流规范（你复制到 vault 根才生效）
- `LLM-wiki.md` — AI 行为规范（已自动生成）
- `index.md` — vault 文件导航（已自动生成）
- `_state/VAULT_STATE.json` — vault 实时状态（已自动生成）

## v1.9 AI 入门手册 (推荐先读)

> 外部 AI 启动后，建议顺序：

1. `_state/VAULT_STATE.json` — 现在打开的是哪个 vault
2. `_state/FS_CACHE.json` — vault 一级文件树（不用递归 ls）
3. `_state/STATE_MAP.json` — vault 状态地图（列出 **所有** 可读的状态文件 + 用途 + 大小 + 路径）
4. 按 STATE_MAP 提示，按需 read 其他文件（如 `.xiaoyuan/graph.json`、`.xiaoyuan/schemas/`）

**为什么这样**：避免 AI 起步阶段乱 ls / 不知道 vault 有什么。STATE_MAP.json 给你一个 vault 的"目录索引"。

> 💡 **提示**: 如果你希望外部 AI 自动使用晓园 Vault 的工作流（文件摄入/查询/健康检查等）:
>
> 1. 把晓园 Vault 安装目录下的 `src/main/templates/AGENTS.md` 复制到 vault 根
> 2. AI 下次启动时会自动加载工作流规范
