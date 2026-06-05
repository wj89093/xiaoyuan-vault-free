# 部署 / 构建指南

> 适用：晓园 Vault v1.6.1-free
> 目的：构建 / 打包 / 发布 Free 仓库安装包

## 快速构建

```bash
# 1. 安装依赖
npm install

# 2. 开发模式
npm run dev                            # 默认 (Pro 全功能, 但 Free 仓库无 Pro 代码)
./scripts/dev.sh free                  # 开源版 (BUILD_TARGET=free AGENT_ENABLED=false)
./scripts/dev-restart.sh               # 一键重启 (改完 import 头后用)

# 3. 生产构建
npm run build                          # 仅编译 (输出 out/)
./scripts/build-free.sh                # 开源版完整打包 (输出 dist/*.dmg / *.exe / *.AppImage)
```

## 构建产物

| 模式 | 脚本 | 产物 | 用途 |
|------|------|------|------|
| Dev | `npm run dev` | 内存热加载 | 开发 |
| Dev (Free) | `./scripts/dev.sh free` | 同上 + BUILD_TARGET=free | 验证开源版 |
| Dev 重启 | `./scripts/dev-restart.sh` | 杀老进程 + 启新 | vite HMR 不重载 import 头时用 |
| Build | `npm run build` | `out/` 目录 | 单编译（CI 用）|
| **Free Build** | `./scripts/build-free.sh` | `dist/*.dmg / *.exe / *.AppImage` | **本地打包**（含 trap 防御 + 双重 -free 修复）|

## 平台目标

| 平台 | 格式 | 架构 | CI 触发 |
|------|------|------|---------|
| macOS | DMG | x64 (Intel) + arm64 (Apple Silicon) | macos-latest |
| Windows | NSIS installer (exe) | x64 | windows-latest |
| Linux | AppImage | x64 | ubuntu-latest |

> 💡 **Apple Silicon 用户优先下 arm64 dmg**（原生 arm64 比 x64-on-Rosetta 快 5-15%）

## 环境变量

| 变量 | 作用 | 默认 |
|------|------|------|
| `BUILD_TARGET` | `pro` 或 `free` | `pro` |
| `AGENT_ENABLED` | `true` 或 `false` | `true` |
| `CSC_IDENTITY_AUTO_DISCOVERY` | macOS 代码签名 | `true`（未签名设 `false`）|
| `GH_TOKEN` | GitHub API（CI 用）| （CI secret）|

> Free 仓库**不**需要 AI API key（QWEN / MINIMAX / DEEPSEEK 等是 Pro 仓库集成，Free 仓库通过 AGENTS.md 协议接入外部 Agent）

## CI/CD（已实现）

`.github/workflows/release.yml` 在 **push tag `v*`** 时自动：

```yaml
on:
  push:
    tags: ['v*']
```

- **3 平台并行 build**（macOS / Windows / Ubuntu）
- 出 dmg / exe / AppImage
- 通过 `softprops/action-gh-release@v2` 上传 GitHub Releases

发布流程：

```bash
# 1. 写 release notes (docs/release-notes/vX.Y.Z-free.md)
# 2. 写 changelog 段 (CHANGELOG.md)
# 3. commit + push main
git add -A && git commit -m "..."
git push origin main

# 4. 打 tag + push (触发 CI)
git tag -a vX.Y.Z-free -m "..."
git push origin vX.Y.Z-free

# 5. 等 CI 跑完 (5-15 min)
# 6. GitHub Release page 自动生成
```

## 代码签名（v1.6.1 未实现）

当前构建产物**未签名**。分发到 macOS Gatekeeper / Windows SmartScreen 会弹警告。发布前需要：

- **macOS**: Apple Developer ID（`Developer ID Application` 证书）
- **Windows**: EV 代码签名证书
- **Linux**: GPG 签名（AppImage 可选）

临时跳过：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
./scripts/build-free.sh
```

## 故障排查

| 问题 | 解决 |
|------|------|
| `electron-builder` 找不到 | `npm install` 完整跑过 |
| macOS 签名报错 | `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过 |
| dmg 出不来 / arm64 unpack 失败 | **清缓存**：`rm -rf ~/Library/Caches/electron-builder ~/Library/Caches/electron`，重 build |
| `build-free.sh` 报 `-free-free` 双后缀 | 旧版 bug，**v1.6.1 已修**（检测 version 已带 `-free` 时不重复加）|
| `package.json` build 后 dirty | **v1.6.1 已加 trap 防御**（异常退出也恢复）|
| Linux 缺 libfuse2 | `apt install libfuse2`（AppImage 需要）|
| Free 版还显示 Pro 元素 | 检查 `process.env.BUILD_TARGET === 'free'` |
| vite dev 改了 import 头不生效 | `./scripts/dev-restart.sh` 重启（vite HMR 不重载 import 头）|
| React `ReferenceError: memo is not defined` | 跑 `./scripts/check-memo-import.sh` 扫漏 import |

## 相关

- [CHANGELOG.md](../CHANGELOG.md) — 版本变更记录
- [scripts/build-free.sh](../scripts/build-free.sh) — 开源版打包脚本（含双重 -free 修复 + trap 防御）
- [scripts/dev-restart.sh](../scripts/dev-restart.sh) — 一键重启 dev
- [scripts/check-memo-import.sh](../scripts/check-memo-import.sh) — 扫漏 import memo 的 .tsx
- [docs/ENGINEERING_MAP.md](./ENGINEERING_MAP.md) — 工程导航（v1.6.1 Free 视角）
- [docs/SKILL_WORKFLOW.md](./SKILL_WORKFLOW.md) — 7 个 Skill 模板 + AGENTS.md 工作流
