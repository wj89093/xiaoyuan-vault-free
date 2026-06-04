#!/bin/bash
# empty-day-detector.sh — 检测 git 空窗期 + 自动建占位 memory
#
# 用法:
#   ./scripts/empty-day-detector.sh              # 默认: 昨天
#   ./scripts/empty-day-detector.sh 2026-06-04   # 指定日期
#   ./scripts/empty-day-detector.sh --dry-run    # 只打印，不写文件
#
# 逻辑:
#   1. 检查 memory/YYYY-MM-DD.md 是否存在 → 存在则跳过
#   2. 不存在则查当天 git commit 数 + reflog 活动
#   3. 建占位 memory,内容根据活动量区分

set -e

DATE=""
DRY_RUN=false

# 参数解析
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      echo "用法: $0 [YYYY-MM-DD] [--dry-run]"
      exit 0
      ;;
    *)
      if [ -z "$DATE" ]; then
        DATE="$arg"
      fi
      ;;
  esac
done

# 默认日期 = 昨天 (macOS date -v)
if [ -z "$DATE" ]; then
  DATE=$(date -v-1d +%Y-%m-%d)
fi

PROJECT="$HOME/Desktop/xiaoyuan-Vault"
MEMORY_DIR="$HOME/.openclaw/workspace/memory"
MEMORY_FILE="$MEMORY_DIR/$DATE.md"

# 校验
if [ ! -d "$PROJECT/.git" ]; then
  echo "❌ 项目无 git: $PROJECT" >&2
  exit 1
fi
mkdir -p "$MEMORY_DIR"

# 1. memory 已存在 → 跳过
if [ -f "$MEMORY_FILE" ]; then
  echo "⏭️  已有 $MEMORY_FILE (跳过)"
  exit 0
fi

cd "$PROJECT"

# 2. 检测 commit 数 + reflog
COMMIT_COUNT=$(git log --since="$DATE 00:00" --until="$DATE 23:59" --oneline 2>/dev/null | wc -l | tr -d ' ')
REFLOG_ENTRIES=$(git reflog --date=short --since="$DATE 00:00" --until="$DATE 23:59" 2>/dev/null | wc -l | tr -d ' ')

# 3. 上下文
PREV_COMMIT=$(git log --until="$DATE 00:00" -1 --pretty=format:"%h %cd %s" --date=short 2>/dev/null || echo "(无)")
NEXT_COMMIT=$(git log --since="$DATE 23:59" --pretty=format:"%h %ad %s" --date=iso 2>/dev/null | head -1 || true)

# 4. 决定内容
if [ "$COMMIT_COUNT" -eq 0 ] && [ "$REFLOG_ENTRIES" -eq 0 ]; then
  STATUS_LABEL="空窗期（无 git 活动）"
  CONCLUSION="当天 \`git log\` 与 \`git reflog\` 均无活动记录。"
elif [ "$COMMIT_COUNT" -eq 0 ]; then
  STATUS_LABEL="半空窗（reflog 有 $REFLOG_ENTRIES 条活动但无 commit）"
  CONCLUSION="当天有 git 活动（reset/checkout 等）但无 commit，可能 WIP 未提交。"
else
  STATUS_LABEL="有 commit 但缺 memory"
  CONCLUSION="当天有 $COMMIT_COUNT 个 commit 但 \`memory/$DATE.md\` 缺失。"
fi

NOW=$(date '+%Y-%m-%d %H:%M')
CONTENT="# $DATE — 自动归档占位

## 状态
⛔ **$STATUS_LABEL**

## 数据
- commit 数: **$COMMIT_COUNT**
- reflog 活动: **$REFLOG_ENTRIES** 条

## 上下文
- 上一项 commit: \`$PREV_COMMIT\`
- 下一项 commit: ${NEXT_COMMIT:-（待定）}

## 验证
\`\`\`bash
git log --since=\"$DATE 00:00\" --until=\"$DATE 23:59\" --oneline
git reflog --date=short --since=\"$DATE 00:00\" --until=\"$DATE 23:59\"
\`\`\`

## 结论
$CONCLUSION

_由 \`scripts/empty-day-detector.sh\` 在 $NOW 自动建。_
"

# 5. 写文件
if [ "$DRY_RUN" = true ]; then
  echo "🔍 DRY-RUN (不会写文件):"
  echo "---"
  echo "$CONTENT"
  echo "---"
  echo "目标: $MEMORY_FILE"
else
  echo "$CONTENT" > "$MEMORY_FILE"
  echo "✅ 建占位: $MEMORY_FILE ($COMMIT_COUNT commits, $REFLOG_ENTRIES reflog)"
fi
