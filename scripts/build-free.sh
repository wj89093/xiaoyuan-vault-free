#!/usr/bin/env bash
# build-free.sh — 构建开源版安装包
# Usage: ./scripts/build-free.sh
set -e

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════"
echo "  晓园 Vault 开源版构建"
echo "═══════════════════════════════════════════"
echo ""

# 1. 设置环境变量（开源版标识）
export BUILD_TARGET=free
export AGENT_ENABLED=false
echo "✓ BUILD_TARGET=free AGENT_ENABLED=false"

# 2. 版本号 (从 package.json 读，加 -free 后缀)
VERSION=$(python3 -c "import json; d=json.load(open('package.json')); print(d.get('version', '1.3.0'))")
FREE_VERSION="${VERSION}-free"
echo "✓ Version: $FREE_VERSION"

# 3. 临时修改 package.json 加 free 标识 (build 完恢复)
cp package.json package.json.bak
python3 -c "
import json
d = json.load(open('package.json'))
d['name'] = 'xiaoyuan-vault-free'
d['productName'] = '晓园 Vault (开源版)'
d['version'] = '$FREE_VERSION'
d['description'] = '晓园 Vault 开源版 - 免费的本地知识库管理工具'
json.dump(d, open('package.json', 'w'), indent=2)
print('  → package.json 已修改')
"

# 4. 清理
rm -rf out dist
echo "✓ Cleaned out/ and dist/"

# 5. 构建
echo ""
echo "▶ 1/3 编译前端 + 后端..."
npm run build 2>&1 | tail -5

echo ""
echo "▶ 2/3 打包安装包（这步比较慢）..."
npm run package 2>&1 | tail -10

# 6. 恢复 package.json
mv package.json.bak package.json
echo "✓ package.json 已恢复"

# 7. 列出产物
echo ""
echo "═══════════════════════════════════════════"
echo "  构建完成"
echo "═══════════════════════════════════════════"
ls -lh dist/*.dmg dist/*.exe dist/*.AppImage 2>/dev/null || ls -lh dist/

echo ""
echo "下一步："
echo "  • 测试：open dist/.../晓园*.dmg 安装到 /Applications"
echo "  • 验证：运行后设置面板里**没有**外部 Agent 插件，**没有** bubble"
echo "  • 发布：把 dmg 上传到 GitHub Releases"
