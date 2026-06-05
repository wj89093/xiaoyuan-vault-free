#!/usr/bin/env bash
# check-memo-import.sh — 防 React.memo 漏 import
#
# v1.5 批量加 memo 时 (b453511) 漏了 10 个文件的 memo import,
# vite/prod build 漏报, dev 跑才抛 ReferenceError.
# 本脚本扫所有 .tsx, 找用 memo( 但漏 import memo 的文件.
#
# 用法:
#   ./scripts/check-memo-import.sh
#
# 接入:
#   - pre-commit: 在 .husky/pre-commit 加 'scripts/check-memo-import.sh'
#   - CI: 在 .github/workflows/*.yml 加 'scripts/check-memo-import.sh'
#   - 手动: 改完 .tsx 跑一次

set -e

cd "$(dirname "$0")/.."

EXIT=0
COUNT=0
for f in $(find src -name "*.tsx" 2>/dev/null); do
  # 文件中是否使用 memo(  ?
  if grep -qE "\bmemo\(" "$f"; then
    # 是否 import memo from 'react' (兼容多种 import 形式):
    #   import { memo, useState } from 'react'
    #   import { useState, memo } from 'react'
    #   import React, { memo } from 'react'  (复合 default+named)
    #   import { type JSX, memo } from 'react'
    # 简易检查: 文件含 'memo' 且含 "from 'react'" 且 memo 在 import 区 (不需是命名导出)
    if ! grep -qE "import[[:space:]].*\{[^}]*\bmemo\b" "$f"; then
      # import 区没 memo — 但 import 'react' 里可能带了, 检查默认 namespace
      if ! grep -qE "^import[[:space:]]+(React[^,]*,\s*)?\{[^}]*\bmemo\b" "$f"; then
        echo "❌ $f: 用 memo( 但漏 import memo"
        EXIT=1
        COUNT=$((COUNT+1))
      fi
    fi
  fi
done

if [ $EXIT -eq 0 ]; then
  # 数所有合规文件
  COMPLIANT=$(grep -lE "\bmemo\(" src/renderer/components/*.tsx 2>/dev/null | wc -l | tr -d ' ')
  echo "✅ 所有 $COMPLIANT 个 memo( 组件都有 import memo"
else
  echo ""
  echo "❌ $COUNT 个文件漏 import memo"
  echo ""
  echo "修法: 在 import 头加 memo, 例:"
  echo "  import { useState, useEffect, type JSX } from 'react'"
  echo "  → import { useState, useEffect, memo, type JSX } from 'react'"
  exit 1
fi
