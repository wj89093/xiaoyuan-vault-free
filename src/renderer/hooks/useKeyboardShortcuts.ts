/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, type Dispatch, type SetStateAction } from 'react'

export function useKeyboardShortcuts(
  vaultPath: string | null,
  setShowQuickSwitch: Dispatch<SetStateAction<boolean>>,
  setShowShortcuts: Dispatch<SetStateAction<boolean>>,
  showQuickSwitch: boolean,
  showShortcuts: boolean
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault()
        if (vaultPath) setShowQuickSwitch((v: boolean) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && vaultPath) {
        if (
          !(
            document.activeElement?.closest('.cm-editor') ||
            document.activeElement?.closest('.cm-content')
          )
        ) {
          ;(document.querySelector('.search-input') as HTMLInputElement)?.focus()
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        const html = document.documentElement
        const current = html.getAttribute('data-theme')
        const next = current === 'dark' ? '' : 'dark'
        if (next) html.setAttribute('data-theme', next)
        else html.removeAttribute('data-theme')
        localStorage.setItem('theme', next || 'light')
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        setShowShortcuts((v: boolean) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [vaultPath, showQuickSwitch, showShortcuts])

  // Restore theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  }, [])
}

export function useGlobalShortcuts(
  vaultPath: string | null,
  setShowQuickSwitch: Dispatch<SetStateAction<boolean>>
) {
  // P1-3: store unsubscribe to avoid listener accumulation on remount
  useEffect(() => {
    const unsubscribe = window.api.onQuickSwitch?.(() => {
      if (vaultPath) setShowQuickSwitch(true)
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [vaultPath])

  useEffect(() => {
    const unsubscribe = window.api.onGotoImport?.(() => {
      window.location.hash = '#/import'
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])
}
