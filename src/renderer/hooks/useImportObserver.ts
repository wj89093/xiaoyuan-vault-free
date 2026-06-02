/**
 * useImportObserver — IPC import event listener + pending queue
 *
 * Exposes pendingImports so App can display count, and fires onboarding
 * AI analysis on first import during onboarding flow.
 */
import { useEffect, useRef, useState } from 'react'

interface UseImportObserverOptions {
  showOnboarding: boolean
  /** Called after import completes — receives the list of imported file paths */
  onFirstImportAnalyze: (filePaths: string[]) => void
}

export function useImportObserver({
  showOnboarding,
  onFirstImportAnalyze
}: UseImportObserverOptions): { pendingImports: string[]; clearPending: () => void } {
  const [pendingImports, setPendingImports] = useState<string[]>([])
  const analyzedRef = useRef(false)

  useEffect(() => {
    if (!window.api) return
    return window.api.onImportCompleted?.(async (importedPaths?: string[]) => {
      if (importedPaths && importedPaths.length > 0) {
        setPendingImports((prev) => [...prev, ...importedPaths])
        // Onboarding: first import triggers AI structure analysis
        if (
          showOnboarding &&
          !sessionStorage.getItem('onboarding_analyzed') &&
          !analyzedRef.current
        ) {
          sessionStorage.setItem('onboarding_analyzed', '1')
          analyzedRef.current = true
          setTimeout(() => onFirstImportAnalyze(importedPaths), 1000)
        }
      }
    })
  }, [showOnboarding, onFirstImportAnalyze])

  return { pendingImports, clearPending: () => setPendingImports([]) }
}
