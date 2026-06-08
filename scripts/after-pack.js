// AfterPack: restore original Electron Framework signature integrity

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return

  const appDir = path.join(context.appOutDir, 'Electron.app')
  const appResources = path.join(appDir, 'Contents/Resources/app')
  const origElectron = path.join(
    context.packager.projectDir,
    'node_modules/electron/dist/Electron.app'
  )

  // 1. Preserve Squirrel.framework
  const squirrelPath = path.join(appDir, 'Contents/Frameworks/Squirrel.framework')
  if (fs.existsSync(squirrelPath)) {
    console.log('  ⏸️  保留 Squirrel.framework')
  }

  // 2. Rebuild native modules
  try {
    const electronVersion = require(path.join(
      context.packager.projectDir,
      'node_modules/electron/package.json'
    )).version
    execSync('npx electron-rebuild -f', {
      cwd: appResources,
      env: { ...process.env, npm_config_target: electronVersion },
      stdio: 'pipe',
      timeout: 120000
    })
    console.log('  🔧 rebuilt native modules for Electron', electronVersion)
  } catch (e) {
    console.log('  ⚠️  native rebuild skipped:', e.stderr?.toString().trim().slice(0, 120))
  }

  // 3. Restore original Electron Framework (preserves linker-signed integrity)
  // electron-builder re-codesigns everything, breaking the Framework's internal integrity
  const origFramework = path.join(origElectron, 'Contents/Frameworks/Electron Framework.framework')
  const pkgFramework = path.join(appDir, 'Contents/Frameworks/Electron Framework.framework')

  if (fs.existsSync(origFramework) && fs.existsSync(pkgFramework)) {
    // Remove electron-builder's broken copy
    fs.rmSync(pkgFramework, { recursive: true, force: true })
    // Copy original (linker-signed) Framework
    execSync(`cp -R "${origFramework}" "${pkgFramework}"`, { stdio: 'pipe' })
    console.log('  🔄 restored original Electron Framework (linker-signed)')
  }
}
