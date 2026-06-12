/**
 * useImportObserver — IPC import event listener + pending queue
 *
 * Listens for `onImportCompleted` events from main process and accumulates
 * imported file paths in `pendingImports`. App.tsx consumes the queue and
 * is responsible for any onboarding triggers (it has access to the AI
 * sendMessage handle, which the hook cannot reach via closure).
 */
import { useEffect, useState } from 'react'

interface UseImportObserverOptions {
  showOnboarding: boolean
  /** Called after each import with the newly imported file paths */
  onFilesImported?: (filePaths: string[]) => void
}

export function useImportObserver({ showOnboarding, onFilesImported }: UseImportObserverOptions): {
  pendingImports: string[]
  clearPending: () => void
} {
  const [pendingImports, setPendingImports] = useState<string[]>([])

  useEffect(() => {
    if (!window.api) return
    return window.api.onImportCompleted?.(async (importedPaths?: string[]) => {
      if (importedPaths && importedPaths.length > 0) {
        setPendingImports((prev) => [...prev, ...importedPaths])
        onFilesImported?.(importedPaths)
      }
    })
  }, [showOnboarding, onFilesImported])

  return { pendingImports, clearPending: () => setPendingImports([]) }
}
