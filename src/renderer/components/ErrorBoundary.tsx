/**
 * ErrorBoundary — 防止子组件 throw 导致整个 app 白屏
 *
 * P2-2026-06-02: 之前任意子组件运行时异常会白屏整个 Electron app,用户失去所有工作。
 * 加 ErrorBoundary 后:错误被捕获,显示降级 UI + 错误详情,用户可继续操作或重启。
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { showToast } from './Toast'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 自定义降级 UI(可选) */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** 出错时是否 toast 通知(默认 true) */
  notify?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console for debugging
    console.error('[ErrorBoundary] Caught error:', error, info)
    if (this.props.notify !== false) {
      showToast('error', `运行时错误: ${error.message || '未知错误'}`)
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(this.state.error!, this.reset)
    }

    // 默认降级 UI
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', padding: 32,
        background: 'var(--color-bg, #fafafa)', color: 'var(--color-text-primary, #1d1d1f)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 var(--space-2) 0' }}>
          遇到了一个错误
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #6e6e73)', margin: '0 0 16px 0', textAlign: 'center', maxWidth: 480 }}>
          应用已经安全地降级,你的数据没有丢失。可以重试刚才的操作,或者继续使用其他功能。
        </p>
        <details style={{
          marginBottom: 16, fontSize: 11, fontFamily: 'monospace',
          color: 'var(--color-text-tertiary, #8e8e93)', maxWidth: 640, width: '100%',
        }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>错误详情</summary>
          <pre style={{
            marginTop: 8, padding: 12, borderRadius: 6,
            background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #d1d1d6)',
            overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {this.state.error?.stack ?? this.state.error?.message ?? '未知错误'}
          </pre>
        </details>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            onClick={this.reset}
            style={{
              padding: 'var(--space-2) var(--space-5)', borderRadius: 6, border: 'none',
              background: 'var(--color-blue, #007aff)', color: '#fff',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            重试
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: 'var(--space-2) var(--space-5)', borderRadius: 6, border: '1px solid var(--color-border, #d1d1d6)',
              background: 'var(--color-surface, #fff)', color: 'var(--color-text-primary, #1d1d1f)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
