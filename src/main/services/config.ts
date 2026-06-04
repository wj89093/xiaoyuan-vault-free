/**
 * config.ts — vault-config.json 读写共享
 *
 * v1.5 抽出: 之前 readConfig 是 vaultHandlers.ts 私有, skillHandlers 注入
 * capabilities 时需要读 lastVaultPath, 提到 services/config.ts 共享
 */
import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import log from 'electron-log/main'

export interface VaultConfig {
  vaults: Array<{ path: string; name: string; lastOpenedAt: number }>
  lastVaultPath?: string
  /** v1.5: per-vault 上次打开文件记忆 (key = vault path) */
  lastFiles?: Record<string, string>
}

const configPath = (): string => join(app.getPath('userData'), 'vault-config.json')

export async function readConfig(): Promise<VaultConfig> {
  const path = configPath()
  try {
    if (existsSync(path)) {
      const raw = JSON.parse(await readFile(path, 'utf-8')) as unknown
      return raw as VaultConfig
    }
  } catch (err) {
    log.error('[Config] readConfig failed:', err)
  }
  return { vaults: [] }
}

export async function writeConfig(config: VaultConfig): Promise<void> {
  const path = configPath()
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    log.error('[Config] writeConfig failed:', err)
  }
}
