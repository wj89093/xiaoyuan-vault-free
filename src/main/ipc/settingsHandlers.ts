import { ipcMain } from 'electron'
import Store from 'electron-store'

// 2026-07-07 (Free 仓清理): 删 agentPlugin 字段
//   - agent plugin 是 Pro 专属 (self-agent 功能), Free 仓不实现
//   - 配合 preload 删 settings.getAgentPlugin/setAgentPlugin/setAgentPluginEnabled
//   - 见 src/main/buildFeatures.ts "开源版只保留 vault 主功能 + Skill.md 插件"

const SETTINGS_STRUCT = {
  theme: {
    type: 'string' as const,
    enum: ['light' as const, 'dark' as const, 'system' as const]
  }
}

type SettingsSchema = {
  theme: 'light' | 'dark' | 'system'
}

const settingsStore = new Store<SettingsSchema>({
  name: 'settings',
  defaults: {
    theme: 'system'
  }
})

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    return settingsStore.store
  })

  ipcMain.handle('settings:getTheme', () => {
    return settingsStore.get('theme', 'system')
  })

  ipcMain.handle('settings:setTheme', (_event, theme: 'light' | 'dark' | 'system') => {
    if (!SETTINGS_STRUCT.theme.enum.includes(theme)) {
      throw new Error(`Invalid theme: ${theme}. Must be light, dark, or system.`)
    }
    settingsStore.set('theme', theme)
    return theme
  })
}
