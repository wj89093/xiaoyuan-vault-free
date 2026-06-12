import { useState, useCallback, type Dispatch, type SetStateAction } from 'react'

export interface AppUIState {
  showSearchFloat: boolean
  setShowSearchFloat: Dispatch<SetStateAction<boolean>>
  showOutput: boolean
  setShowOutput: Dispatch<SetStateAction<boolean>>
  showOnboarding: boolean
  setShowOnboarding: Dispatch<SetStateAction<boolean>>
  vaultList: Array<{ path: string; name: string; lastOpened: number }>
  setVaultList: Dispatch<SetStateAction<Array<{ path: string; name: string; lastOpened: number }>>>
  showVaultCreation: boolean
  setShowVaultCreation: Dispatch<SetStateAction<boolean>>
  activeView: string
  setActiveView: Dispatch<SetStateAction<string>>
  // ── From merged useUIState ──────────────────────────────────────
  showQuickSwitch: boolean
  setShowQuickSwitch: Dispatch<SetStateAction<boolean>>
  showGraph: boolean
  setShowGraph: Dispatch<SetStateAction<boolean>>
  showShortcuts: boolean
  setShowShortcuts: Dispatch<SetStateAction<boolean>>
  showBacklinks: boolean
  setShowBacklinks: Dispatch<SetStateAction<boolean>>
  toggleBacklinks: () => void
  showTrash: boolean
  setShowTrash: Dispatch<SetStateAction<boolean>>
  toggleTrash: () => void
  showSettings: boolean
  setShowSettings: Dispatch<SetStateAction<boolean>>
  openSettings: (payload?: { panel?: string; folder?: string }) => void
  showLint: boolean
  setShowLint: Dispatch<SetStateAction<boolean>>
  openLint: () => void
  showSchema: boolean
  setShowSchema: Dispatch<SetStateAction<boolean>>
  openSchema: () => void
  showLog: boolean
  setShowLog: Dispatch<SetStateAction<boolean>>
  openLog: () => void
  showVersionHistory: boolean
  setShowVersionHistory: Dispatch<SetStateAction<boolean>>
  openVersionHistory: () => void
  showBriefing: boolean
  setShowBriefing: Dispatch<SetStateAction<boolean>>
  showIndexFloat: boolean
  setShowIndexFloat: Dispatch<SetStateAction<boolean>>
  toggleQuickSwitch: () => void
  toggleGraph: () => void
  toggleShortcuts: () => void
}

export function useAppUIState(): AppUIState {
  const [showSearchFloat, setShowSearchFloat] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [vaultList, setVaultList] = useState<
    Array<{ path: string; name: string; lastOpened: number }>
  >([])
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

  const openLint = useCallback(() => {
    setShowLint(true)
  }, [])
  const openLog = useCallback(() => {
    setShowLog(true)
  }, [])
  const openSchema = useCallback(() => {
    setShowSchema(true)
  }, [])
  const openVersionHistory = useCallback(() => {
    setShowVersionHistory(true)
  }, [])

  const toggleBacklinks = useCallback(() => setShowBacklinks((v) => !v), [])
  const toggleTrash = useCallback(() => setShowTrash((v) => !v), [])
  const toggleQuickSwitch = useCallback(() => setShowQuickSwitch((v) => !v), [])
  const toggleGraph = useCallback(() => setShowGraph((v) => !v), [])
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), [])

  return {
    // app shell
    showSearchFloat,
    setShowSearchFloat,
    showOutput,
    setShowOutput,
    showOnboarding,
    setShowOnboarding,
    vaultList,
    setVaultList,
    showVaultCreation,
    setShowVaultCreation,
    activeView,
    setActiveView,
    // UI panels
    showQuickSwitch,
    setShowQuickSwitch,
    showGraph,
    setShowGraph,
    showShortcuts,
    setShowShortcuts,
    showBacklinks,
    setShowBacklinks,
    toggleBacklinks,
    showTrash,
    setShowTrash,
    toggleTrash,
    showSettings,
    setShowSettings,
    openSettings,
    showLint,
    setShowLint,
    openLint,
    showSchema,
    setShowSchema,
    openSchema,
    showLog,
    setShowLog,
    openLog,
    showBriefing,
    setShowBriefing,
    showVersionHistory,
    setShowVersionHistory,
    openVersionHistory,
    showIndexFloat,
    setShowIndexFloat,
    toggleQuickSwitch,
    toggleGraph,
    toggleShortcuts
  }
}
