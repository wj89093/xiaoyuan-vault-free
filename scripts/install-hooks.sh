#!/usr/bin/env bash
# install-hooks.sh — 把 .githooks/* 安装到 .git/hooks/
#
# 不依赖 husky/simple-git-hooks npm 包 — 用 git 社区标准方案.
# 用户换机器 / 别人 clone 仓库后跑一次: ./scripts/install-hooks.sh
#
# 接入 npm: npm run precommit:install
# 接入 CI: 在 .github/workflows/ci.yml 加 'scripts/install-hooks.sh'

set -e

cd "$(dirname "$0")/.."

HOOKS_DIR=".git/hooks"
SOURCE_DIR=".githooks"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ $SOURCE_DIR/ 不存在"
  exit 1
fi

mkdir -p "$HOOKS_DIR"

for hook in "$SOURCE_DIR"/*; do
  name=$(basename "$hook")
  target="$HOOKS_DIR/$name"
  cp "$hook" "$target"
  chmod +x "$target"
  echo "  ✅ 安装: $target"
done

echo ""
echo "✅ Git hooks 已安装到 $HOOKS_DIR"
echo ""
echo "测试: 改一个 .tsx 文件后跑 'git commit' 看 hook 是否触发"
