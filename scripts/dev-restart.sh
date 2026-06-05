#!/usr/bin/env bash
# dev-restart.sh — 一键重启 electron-vite dev
#
# 解决 vite HMR 对 import 头变更不生效的问题:
# - HMR 对 hook/state 变化有效
# - HMR 对新增/删除 import 符号 (如新增 memo, useCallback) 需要 full reload
# - HMR 对纯 import 头编辑通常不触发
# - 用户必须手动 Cmd+R 刷新 Electron 窗口, 或重启 dev
#
# 用法:
#   ./scripts/dev-restart.sh              # 重启 dev
#   ./scripts/dev-restart.sh free         # 重启 dev (开源版)
#
# 类似 alias: alias devr='~/Desktop/xiaoyuan-vault-free/scripts/dev-restart.sh'

set -e

cd "$(dirname "$0")/.."

MODE="${1:-pro}"
if [ "$MODE" = "free" ]; then
  echo "▶ 模式: 开源版 (BUILD_TARGET=free AGENT_ENABLED=false)"
  export BUILD_TARGET=free
  export AGENT_ENABLED=false
else
  echo "▶ 模式: Pro (默认, 全功能)"
  export BUILD_TARGET=pro
  export AGENT_ENABLED=true
fi

echo "▶ 杀掉老的 electron-vite dev (pgrep)..."
PIDS=$(pgrep -f "electron-vite dev" || true)
if [ -n "$PIDS" ]; then
  echo "  找到 PID: $PIDS"
  kill $PIDS 2>/dev/null || true
  sleep 1
  # 强 kill 还活着的
  PIDS=$(pgrep -f "electron-vite dev" || true)
  if [ -n "$PIDS" ]; then
    echo "  还在跑, SIGKILL..."
    kill -9 $PIDS 2>/dev/null || true
  fi
else
  echo "  没有运行中的 dev 进程"
fi

echo "▶ 启动新 dev..."
exec npm run dev
