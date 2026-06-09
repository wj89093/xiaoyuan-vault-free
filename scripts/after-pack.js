// AfterPack: minimal hook — electron-builder handles everything
// No Framework replacement needed (was causing SIGTRAP crashes in macOS 26)
// Native modules are pre-built during npm install

exports.default = async function (context) {
  const platform = context.electronPlatformName
  if (platform !== 'darwin') return
  
  console.log(`  ✅ after-pack: ${platform} (arm64) — using electron-builder defaults`)
}
