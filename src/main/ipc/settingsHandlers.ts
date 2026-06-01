import { ipcMain } from 'electron'
import Store from 'electron-store'

const SETTINGS_STRUCT = {
  theme: {
    type: 'string' as const,
    enum: ['light' as const, 'dark' as const, 'system' as const],
  },
  agentPlugin: {
    type: 'object' as const,
    properties: {
      enabled: { type: 'boolean' },
      endpoint: { type: 'string' },
      apiKey: { type: 'string' },
      protocol: { type: 'string', enum: ['ws', 'http'] },
      name: { type: 'string' },
    },
  },
}

type SettingsSchema = {
  theme: 'light' | 'dark' | 'system'
  agentPlugin: {
    enabled: boolean
    endpoint: string
    apiKey: string
    protocol: 'ws' | 'http'
    name: string
  }
}

const settingsStore = new Store<SettingsSchema>({
  name: 'settings',
  defaults: {
    theme: 'system',
    agentPlugin: {
      enabled: false,
      endpoint: 'ws://localhost:8080/agent',
      apiKey: '',
      protocol: 'ws',
      name: '自定义 Agent',
    },
  },
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

  // ── Agent Plugin Settings ─────────────────────────────────────────

  ipcMain.handle('settings:getAgentPlugin', () => {
    return settingsStore.get('agentPlugin')
  })

  ipcMain.handle('settings:setAgentPlugin', (_event, config: SettingsSchema['agentPlugin']) => {
    settingsStore.set('agentPlugin', config)
    return config
  })

  ipcMain.handle('settings:setAgentPluginEnabled', (_event, enabled: boolean) => {
    settingsStore.set('agentPlugin.enabled', enabled)
    return enabled
  })
}