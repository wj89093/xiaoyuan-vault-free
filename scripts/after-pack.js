// afterPack hook for electron-builder
// 删 Squirrel.framework (Mac 自动更新器, 现代 macOS 26 Apple Silicon 启动闪退)
// Free 仓库不用 autoUpdater, 删后启动正常.
//
// 调用时机: electron-builder 拷贝 node_modules/electron/dist/Electron.app
// 模板到 dist/mac-arm64/晓园 Vault.app 之后, 打包 dmg 之前.
//
// 背景: 用户报告 v1.6.1-free dmg 在 Mac mini M4 / macOS 26.5.1
// 启动时 EXC_BREAKPOINT 崩溃 (ares_llist_replace_destructor + c-ares DNS).
// 根因是 Squirrel.framework 在 macOS 26 + Apple Silicon 启动时触发
// c-ares 链路崩. 删 Squirrel 解决.
//
// context.appOutDir = <dist>/<arch>/晓园 Vault.app

const path = require('path')
const fs = require('fs')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  // appOutDir = <dist>/mac-arm64, 但 .app 在 appOutDir/晓园 Vault.app/ 子目录
  // 递归找所有 Squirrel.framework
  function findSquirrelPaths(dir) {
    const results = []
    if (!fs.existsSync(dir)) return results
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name === 'Squirrel.framework') {
        results.push(fullPath)
      } else if (entry.isDirectory()) {
        results.push(...findSquirrelPaths(fullPath))
      }
    }
    return results
  }

  for (const squirrelPath of findSquirrelPaths(context.appOutDir)) {
    fs.rmSync(squirrelPath, { recursive: true, force: true })
    console.log(`  🗑️  删 Squirrel.framework: ${squirrelPath}`)
  }
}
