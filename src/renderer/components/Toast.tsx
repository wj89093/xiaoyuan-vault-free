import { useState, useEffect, useCallback, type JSX } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'
/* eslint-disable */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  message: string
}

interface ToastProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

const iconMap = {
  success: <CheckCircle size={15} />,
  error: <AlertCircle size={15} />,
  info: <Info size={15} />
}

// Auto-dismiss durations by type (milliseconds)
const AUTO_DISMISS_MS: Record<ToastType, number> = {
  error: 6000,
  info: 3000,
  success: 2000,
  warning: 5000
}

export function ToastContainer({ toasts, onDismiss }: ToastProps): JSX.Element {
  // Dismiss newest toast on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        const newest = toasts[toasts.length - 1]
        onDismiss(newest.id)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toasts, onDismiss])

  if (toasts.length === 0) return <></>
  return (
    <div className="toast-container" role="region" aria-label="通知" aria-live="assertive">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  // Mount → fade in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16)
    return () => clearTimeout(t)
  }, [])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 220)
  }

  return (
    <div
      className={`toast toast-${toast.type} toast-type-${toast.type}${exiting ? ' toast-exit' : ' toast-enter'}`}
      role="alert"
      style={{
        opacity: visible && !exiting ? 1 : 0,
        transform: visible && !exiting ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 220ms ease, transform 220ms ease'
      }}
    >
      <span className="toast-icon">{iconMap[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={handleDismiss} aria-label="关闭通知">
        <X size={13} />
      </button>
    </div>
  )
}

// Global toast hook
let toastHandler: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null

export function showToast(type: ToastType, message: string) {
  toastHandler?.({ type, message })
}

export function useToasts(): {
  toasts: ToastMessage[]
  dismiss: (id: string) => void
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Auto-dismiss with type-differentiated duration
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS[t.type]))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  // Register global handler
  useEffect(() => {
    toastHandler = (msg) => {
      const id = `toast-${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { ...msg, id }])
    }
    return () => {
      toastHandler = null
    }
  }, [])

  return { toasts, dismiss }
}
