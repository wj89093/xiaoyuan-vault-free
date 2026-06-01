
import { useState, useCallback } from 'react'

export interface AppUIState {
  showSearchFloat: boolean
  setShowSearchFloat: (v: boolean) => void
  showOutput: boolean
  setShowOutput: (v: boolean) => void
  showOnboarding: boolean
  setShowOnboarding: (v: boolean) => void
  vaultList: Array<{ path: string; name: string; lastOpened: number }>
  setVaultList: (v: Array<{ path: string; name: string; lastOpened: number }>) => void
  showVaultCreation: boolean
  setShowVaultCreation: (v: boolean) => void
  activeView: string
  setActiveView: (v: string) => void
  // ── From merged useUIState ──────────────────────────────────────
  showQuickSwitch: boolean
  setShowQuickSwitch: (v: boolean) => void
  showGraph: boolean
  setShowGraph: (v: boolean) => void
  showShortcuts: boolean
  setShowShortcuts: (v: boolean) => void
  showBacklinks: boolean
  setShowBacklinks: (v: boolean) => void
  toggleBacklinks: () => void
  showTrash: boolean
  setShowTrash: (v: boolean) => void
  toggleTrash: () => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void
  openSettings: (payload?: { panel?: string; folder?: string }) => void
  showLint: boolean
  setShowLint: (v: boolean) => void
  openLint: () => void
  showSchema: boolean
  setShowSchema: (v: boolean) => void
  openSchema: () => void
  showLog: boolean
  setShowLog: (v: boolean) => void
  openLog: () => void
  showVersionHistory: boolean
  setShowVersionHistory: (v: boolean) => void
  openVersionHistory: () => void
  showBriefing: boolean
  setShowBriefing: (v: boolean) => void
  showIndexFloat: boolean
  setShowIndexFloat: (v: boolean) => void
  toggleQuickSwitch: () => void
  toggleGraph: () => void
  toggleShortcuts: () => void
}

export function useAppUIState(): AppUIState {
  const [showSearchFloat, setShowSearchFloat] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [vaultList, setVaultList] = useState<Array<{ path: string; name: string; lastOpened: number }>>([])
  const [showVaultCreation, setShowVaultCreation] = useState(false)
  const [activeView, setActiveView] = useState('wiki')

  // ── UI panel states (merged from useUIState) ────────────────────
  const [showQuickSwitch, setShowQuickSwitch] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showBacklinks, setShowBacklinks] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLint, setShowLint] = useState(false)
  const [showSchema, setShowSchema] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showIndexFloat, setShowIndexFloat] = useState(false)

  // ── Callbacks ───────────────────────────────────────────────────
  const openSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const openLint = useCallback(() => { setShowLint(true) }, [])
  const openLog = useCallback(() => { setShowLog(true) }, [])
  const openSchema = useCallback(() => { setShowSchema(true) }, [])
  const openVersionHistory = useCallback(() => { setShowVersionHistory(true) }, [])

  const toggleBacklinks = useCallback(() => setShowBacklinks(v => !v), [])
  const toggleTrash = useCallback(() => setShowTrash(v => !v), [])
  const toggleQuickSwitch = useCallback(() => setShowQuickSwitch(v => !v), [])
  const toggleGraph = useCallback(() => setShowGraph(v => !v), [])
  const toggleShortcuts = useCallback(() => setShowShortcuts(v => !v), [])

  return {
    // app shell
    showSearchFloat, setShowSearchFloat,
    showOutput, setShowOutput,
    showOnboarding, setShowOnboarding,
    vaultList, setVaultList,
    showVaultCreation, setShowVaultCreation,
    activeView, setActiveView,
    // UI panels
    showQuickSwitch, setShowQuickSwitch,
    showGraph, setShowGraph,
    showShortcuts, setShowShortcuts,
    showBacklinks, setShowBacklinks, toggleBacklinks,
    showTrash, setShowTrash, toggleTrash,
    showSettings, setShowSettings, openSettings,
    showLint, setShowLint, openLint,
    showSchema, setShowSchema, openSchema,
    showLog, setShowLog, openLog,
    showBriefing, setShowBriefing,
    showVersionHistory, setShowVersionHistory, openVersionHistory,
    showIndexFloat, setShowIndexFloat,
    toggleQuickSwitch, toggleGraph, toggleShortcuts,
  }
}
