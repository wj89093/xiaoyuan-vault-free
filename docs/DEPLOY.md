# 部署 / 构建指南

> 适用：晓园 Vault v1.3+

## 快速构建

```bash
# 1. 安装依赖
npm install

# 2. 开发模式
npm run dev                 # Pro 版（默认全功能）
./scripts/dev.sh free       # 开源版

# 3. 生产构建
npm run build               # 输出到 out/
./scripts/build-free.sh     # 开源版完整打包（dmg/exe/AppImage）
```

## 构建产物

| 模式 | 脚本 | 产物 | 用途 |
|------|------|------|------|
| Pro dev | `npm run dev` | 内存热加载 | 开发 |
| Pro dev | `./scripts/dev.sh` | 同上 + 静态资源 | 完整 dev 体验 |
| Free dev | `./scripts/dev.sh free` | `BUILD_TARGET=free` | 验证开源版 |
| Pro build | `npm run build` | `out/` 目录 | 给 Pro 打包用 |
| **Free build** | `./scripts/build-free.sh` | `dist/*.dmg, *.exe, *.AppImage` | **开源版发布** |

## 平台目标

| 平台 | 格式 | 架构 |
|------|------|------|
| macOS | DMG | x64 (Intel) + arm64 (Apple Silicon) |
| Windows | NSIS installer (exe) | x64 |
| Linux | AppImage | x64 |

## 环境变量

| 变量 | 作用 | 默认 |
|------|------|------|
| `BUILD_TARGET` | `pro` 或 `free` | `pro` |
| `AGENT_ENABLED` | `true` 或 `false` | `true` |
| `QWEN_API_KEY` | Qwen API Key | (空) |
| `MINIMAX_API_KEY` | MiniMax API Key | (空) |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | (空) |

## 代码签名（未实现）

当前构建产物**未签名**。发布到 macOS / Windows 商店前需要：
- macOS: Apple Developer ID
- Windows: EV 代码签名证书
- Linux: GPG 签名

## CI/CD（未实现）

`./scripts/build-free.sh` 可以直接集成到 GitHub Actions：

```yaml
- name: Build Free
  run: ./scripts/build-free.sh
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 故障排查

| 问题 | 解决 |
|------|------|
| `electron-builder` 找不到 | `npm install` 完整跑过 |
| macOS 签名报错 | `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过签名 |
| Linux 缺依赖 | `apt install libfuse2` (AppImage 需要) |
| Free 版还显示 Pro 元素 | 检查 `process.env.BUILD_TARGET` 是否真为 `free` |
