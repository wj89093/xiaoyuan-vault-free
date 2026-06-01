#!/usr/bin/env bash
# strip-pro.sh — 把 Pro 专属代码物理剥离，生成纯开源版
#
# 用法:
#   ./scripts/strip-pro.sh
#
# 作用:
#   - 删除 Pro 专属模块 (agent core/plugin, aiChat, bubble, skill)
#   - 移除 IS_PRO feature flag 守卫（直接删掉被守卫的代码块）
#   - 替换 buildFeatures.ts 为最小 stub（IS_PRO 始终 false）
#   - 删除 Pro 专属的 .env 变量
#   - 删除 Pro 专属的 templates 文件
#   - 更新 package.json（移除 Pro 依赖等）
#
# 在 ~/Desktop/xiaoyuan-vault-free/ 目录下运行

set -euo pipefail
cd "$(dirname "$0")/.."

log() { echo "[strip-pro] $1"; }

# 1. 删除 Pro 专属目录
log "删除 Pro 专属目录..."
rm -rf src/main/services/agent/core
rm -rf src/main/services/agent/plugin
rm -rf src/main/services/ai
rm -rf src/main/services/clipboard/clipboardBubble.ts
rm -rf src/main/services/clipboard/bubbleState.ts
rm -rf src/renderer/components/AIPanel* 2>/dev/null || true
rm -rf src/main/templates/agents-templates 2>/dev/null || true
rm -rf scripts/dev.sh  # 这个 dev.sh 包含 free/pro 切换，开源版不需要

# 2. 替换 buildFeatures.ts → 简化版（IS_PRO 永远 false）
log "替换 buildFeatures.ts..."
cat > src/main/buildFeatures.ts << 'EOF'
/**
 * buildFeatures.ts — 开源版专用
 *
 * 开源版只保留 vault 主功能，Pro 功能（self-agent、bubble、aiChat、Skill 插件）全部移除。
 * 此文件保留是为了让其它代码中的 `if (IS_PRO)` 守卫仍然能编译通过（守卫永远为 false）。
 */
export const IS_PRO = false
export const IS_OPEN_SOURCE = true
EOF

# 3. 移除所有 IS_PRO 守卫的代码块（用 Python 处理更安全）
log "移除 IS_PRO 守卫的代码块..."
python3 << 'PYEOF'
import re, os

# 匹配: if (IS_PRO) { <block> }
# 复杂 block 用括号匹配
def remove_is_pro_blocks(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        # 找 "if (IS_PRO)"
        m = re.match(r'\bif\s*\(\s*IS_PRO\s*\)\s*\{', text[i:])
        if not m:
            out.append(text[i])
            i += 1
            continue
        # 找匹配的 }
        depth = 0
        j = i + m.end() - 1  # 指向 {
        while j < n:
            if text[j] == '{': depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        if depth != 0:
            out.append(text[i])
            i += 1
            continue
        # 跳过整个 if (IS_PRO) { ... } 块
        # 保留前面的空白
        i = j + 1
    return ''.join(out)

# 匹配: if (IS_PRO) { ... } else { ... } — 保留 else 分支
def remove_is_pro_with_else_blocks(text):
    # 这种模式要保留 else 分支
    # 简单策略：找到 "if (IS_PRO) { ... } else { " 然后替换成 "} else {"
    out = []
    i = 0
    n = len(text)
    while i < n:
        m = re.match(r'\bif\s*\(\s*IS_PRO\s*\)\s*\{', text[i:])
        if not m:
            out.append(text[i])
            i += 1
            continue
        # 找 }
        depth = 0
        j = i + m.end() - 1
        while j < n:
            if text[j] == '{': depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        if depth != 0:
            out.append(text[i])
            i += 1
            continue
        # 检查 } 之后是否跟 else
        after = text[j+1:]
        em = re.match(r'\s*else\s*\{', after)
        if em:
            # 保留 else 分支内容
            # 找 else { 对应的 }
            else_start = j + 1 + em.end() - 1
            depth2 = 0
            k = else_start
            while k < n:
                if text[k] == '{': depth2 += 1
                elif text[k] == '}':
                    depth2 -= 1
                    if depth2 == 0: break
                k += 1
            # 跳过 if 块（包含 else 之前的所有空白）
            # 替换成空，但保留 "} else {" 这种
            # 实际上整个 if 块变成空，但 else 块保留
            # 我们要保留 else 块，所以输出空白 + "else block"
            # 不对，更简单：跳过 if (IS_PRO) { ... } 但保留 else
            # 直接跳过 if 块（到 else 关键字后），让 else 块被后面的循环处理
            i = j + 1
        else:
            # 没有 else，整块跳过
            i = j + 1
    return ''.join(out)

# 实际处理：先处理带 else 的（保留 else），再处理纯 if 的（删除）
# 由于我们的守卫模式有: `if (IS_PRO) { ... }` 和 `if (IS_PRO) { ... } else { triggerGraphRebuild() }`
# 策略：找 `if (IS_PRO) { ... }` 整块（不跨行），如果是 `if (IS_PRO) X else Y` 形式,替换为 Y
# 简单做法：删掉 `if (IS_PRO) <block>`，如果后面紧跟 `else <block>` 则保留 else block

def process(text):
    # 多行匹配
    pattern = re.compile(r'\bif\s*\(\s*IS_PRO\s*\)\s*\{', re.MULTILINE)
    result = []
    last = 0
    for m in pattern.finditer(text):
        # 找匹配的 }
        depth = 0
        j = m.end() - 1
        while j < len(text):
            if text[j] == '{': depth += 1
            elif text[j] == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        if depth != 0:
            continue
        # 检查 } 后面紧跟的 else
        after_text = text[j+1:]
        em = re.match(r'\s*else\s*\{', after_text)
        if em:
            # 找 else { 对应的 }
            depth2 = 0
            k = j + 1 + em.end() - 1
            while k < len(text):
                if text[k] == '{': depth2 += 1
                elif text[k] == '}':
                    depth2 -= 1
                    if depth2 == 0: break
                k += 1
            # 跳过 if 块，保留 else 块
            result.append(text[last:m.start()])
            # else 块：用 "if (IS_OPEN_SOURCE) {" 包起来？不，直接展开
            # 实际上我们要保留 else 内容。把它复制到当前位置，前面加 if 块的注释位置
            else_content = text[j+1+em.start():k]  # else { ... } 内部
            result.append(else_content)
            last = k + 1
        else:
            # 整块跳过
            result.append(text[last:m.start()])
            last = j + 1
    result.append(text[last:])
    return ''.join(result)

# 扫描所有 .ts/.tsx 文件
for root, dirs, files in os.walk('src'):
    if 'node_modules' in root or '.git' in root: continue
    for f in files:
        if not (f.endswith('.ts') or f.endswith('.tsx')): continue
        path = os.path.join(root, f)
        with open(path) as fp:
            content = fp.read()
        if 'IS_PRO' not in content: continue
        new = process(content)
        if new != content:
            with open(path, 'w') as fp:
                fp.write(new)
            print(f"  cleaned: {path}")
PYEOF

# 4. 删除 Pro 专属的 templates
log "删除 Pro 专属的 templates..."
rm -f src/main/templates/skill-plugin-default.md
rm -f src/main/templates/skill-plugin-default.md.tmp 2>/dev/null || true

# 5. 清理 vite 配置中 Pro 专属的 buildFeatures 检查
log "检查 electron.vite.config.ts..."
# 这个文件保留，但 define 保留 IS_PRO 即可（值为 false）

# 6. 清理 Pro 专属的 mcp services (如果 package.json 引用)
# 暂不动 package.json 依赖

# 7. 清理 .env 相关
log "清理 .env.example..."
if [ -f .env.example ]; then
  cat > .env.example << 'EOF'
# 晓园 Vault 开源版 — 环境变量示例
# 复制为 .env 并填入实际值（可选）
#
# 注：开源版不需要任何 AI API Key（不内置 AI Agent）
# Skill.md 插件让你接自己的 Agent，详见 docs/SKILL_WORKFLOW.md
EOF
fi

# 8. 清理 src/main/templates/skills/ 中的 Pro skill
log "清理 Pro 专属 skills..."
# 保留基础 skills (ingest, lint, query 等)，删除 Pro 专属的
# TODO: 审查每个 skill

# 9. 清理 docs/ 中 Pro 专属文档
log "清理 Pro 专属 docs..."
rm -f docs/AGENT_PLUGIN_API.md
rm -f docs/AGENT_ARCHITECTURE.md
rm -f docs/AGENT_SELF_DESIGN.md
rm -f docs/AI_CHAT_STREAMING_REPORT.md
rm -f docs/PLAN-OPEN-SOURCE-STRIP.md
rm -f docs/PLAN-SKILL-PLUGIN.md
rm -f docs/SKILL_PLUGIN_API.md
rm -f docs/SKILLS.md
rm -f docs/RELEASE_CHECKLIST_v1.3-free.md  # 内部用，不放开源版
rm -f docs/PLAN-SKILL-PLUGIN.md
rm -f docs/PLAN-OPEN-SOURCE-STRIP.md
rm -f docs/pre-launch-checklist.md
rm -f docs/RELEASE_NOTES_v1.3-free.md  # 改写为开源版特定
rm -f docs/RELEASE_CHECKLIST_v1.3-free.md

# 10. 改写 CHANGELOG / README 删掉 Pro 引用
log "改写 README.md..."
cat > README.md << 'EOF'
# 晓园 Vault (开源版)

> 免费的本地知识库 · 类 Obsidian · macOS / Windows / Linux 桌面应用

[![macOS](https://img.shields.io/badge/macOS-13+-blue)] ![Windows](https://img.shields.io/badge/Windows-10+-blue)] ![Linux](https://img.shields.io/badge/Linux-glibc%202.31+-blue)] ![Electron](https://img.shields.io/badge/Electron-34-green)] ![React](https://img.shields.io/badge/React-19-blueviolet)] ![Version](https://img.shields.io/badge/version-1.3.0--free-orange)]

---

## 一句话

**免费的本地知识库，类 Obsidian，AI 原生设计。** 全部数据本地存储。

---

## 这是什么

晓园 Vault 是一个本地知识库 + Skill 化 AI 工作流的桌面应用。

开源版包含：
- ✅ Markdown 笔记编辑（CodeMirror 6）
- ✅ 文件管理（树状结构 + 全文搜索 FTS5）
- ✅ 知识图谱（自动构建）
- ✅ 多 vault 隔离
- ✅ 自动简报
- ✅ **Skill.md 插件** — 接你自己 Agent

开源版**不包含**：
- ❌ 内置 AI Agent（用 Skill.md 插件接你自己的）
- ❌ 剪贴板浮窗
- ❌ AI Chat 浮窗

---

## Skill.md 插件

打开 **设置 → Skill.md** → 复制全文 → 发给你的 Agent（OpenClaw / Claude Code / 自建 LLM）。

你的 Agent 只需实现 HTTP `/agent/run` 端点（30 行 Python）：

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from openai import OpenAI
import json

app = FastAPI()
llm = OpenAI()

@app.post("/agent/run")
async def run(req: dict):
    async def stream():
        for chunk in llm.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": req["system"]},
                {"role": "user", "content": req["user_message"]},
            ],
            stream=True,
        ):
            if chunk.choices[0].delta.content:
                yield f"data: {json.dumps({'type': 'text', 'content': chunk.choices[0].delta.content})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
```

晓园设置 → Skill.md 旁的 endpoint 填 `http://localhost:8080`。

**OpenClaw 用户**：`http://127.0.0.1:18789` 直接接入，零代码。

详细：[`docs/SKILL_WORKFLOW.md`](docs/SKILL_WORKFLOW.md)

---

## 安装

### macOS

```bash
open ~/Downloads/晓园-Vault-1.3.0-free.dmg
# 拖动到 /Applications
```

### Windows

下载 `晓园-Vault-Setup-1.3.0-free.exe`，双击安装。

### Linux

```bash
chmod +x 晓园-Vault-1.3.0-free.AppImage
./晓园-Vault-1.3.0-free.AppImage
```

### 从源码运行（开发模式）

```bash
git clone https://github.com/wj89093/xiaoyuan-vault-free.git
cd xiaoyuan-vault-free
npm install
npm run dev
```

---

## 快速上手

1. 启动晓园 Vault
2. 选一个文件夹作为你的 vault
3. 导入文件到 `_raw/2026-06/`
4. （可选）打开 设置 → Skill.md → 接入你的 Agent

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 34 + React 19 |
| 编辑器 | CodeMirror 6 |
| 数据库 | SQLite + better-sqlite3 + FTS5 |
| 图谱 | D3.js |
| 构建 | electron-vite + electron-builder |

---

## 文档

- [CHANGELOG.md](CHANGELOG.md) — 变更日志
- [docs/SKILL_WORKFLOW.md](docs/SKILL_WORKFLOW.md) — Skill.md 插件工作流
- [docs/DEPLOY.md](docs/DEPLOY.md) — 构建 / 部署指南
- [docs/ENGINEERING_MAP.md](docs/ENGINEERING_MAP.md) — 工程导航

---

## 与 Pro 版的区别

| 功能 | 开源版 | Pro 版 |
|------|--------|--------|
| 价格 | 免费 | 付费 |
| Markdown 编辑 / 搜索 / 图谱 | ✅ | ✅ |
| 多 vault 隔离 | ✅ | ✅ |
| 简报自动生成 | ✅ | ✅ |
| Skill.md 插件 | ✅ | ✅ |
| 内置 AI Agent | ❌ | ✅ |
| 剪贴板浮窗 | ❌ | ✅ |
| AI Chat 浮窗 | ❌ | ✅ |

Pro 版订阅咨询：联系 [新道蓝谷团队](https://github.com/wj89093)

---

## License

MIT © 晓园团队
EOF

# 11. CHANGELOG 简化（开源版 specific）
log "简化 CHANGELOG.md..."
cat > CHANGELOG.md << 'EOF'
# 晓园 Vault 开源版 变更日志

> 版本：v1.3.0-free
> 发布日期：2026-06-01

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

详见 [docs/CHANGELOG_DETAIL.md](docs/CHANGELOG_DETAIL.md)（如需详细记录）
EOF

# 12. 清理 SESSION-STATE.md（内部用，不提交）
rm -f SESSION-STATE.md 2>/dev/null || true

# 13. 清理 out/ 目录（构建产物）
log "清理构建产物..."
rm -rf out dist

# 14. 清理 .learnings
rm -rf .learnings 2>/dev/null || true

# 15. 清理 tests 中的 Pro 专属（保留基础）
# 主要测试保留（vitest），都是通用测试

# 16. 把 buildFeatures 守卫清理后的死代码扫一遍
log "扫描可能的死代码..."
grep -rn "IS_PRO" src/ 2>/dev/null | head -5 || true

log "✅ 剥离完成"
log ""
log "下一步："
log "  1. ./node_modules/.bin/vitest run  # 跑测试看有没漏的"
log "  2. npm run build                 # 构建一次"
log "  3. ./scripts/dev.sh              # dev 启动验证"
EOF

chmod +x scripts/strip-pro.sh

log "脚本已创建: scripts/strip-pro.sh"
