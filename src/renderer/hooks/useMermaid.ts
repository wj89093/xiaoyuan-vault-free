/**
 * useMermaid.ts — Mermaid diagram renderer hook
 *
 * usage:
 *   const { containerRef, status } = useMermaid({ code: 'graph TD\n...' })
 *   <div ref={containerRef} />
 *
 * Safety:
 *  - try/catch → fallback to <pre>code</pre> on error
 *  - useEffect cleanup → cancels pending render, clears DOM
 *  - Dynamic import → mermaid loaded lazily (not on app start)
 */
import { useEffect, useRef, useState } from 'react'

interface UseMermaidOptions {
  code: string
  enabled?: boolean
}

export function useMermaid({ code, enabled = true }: UseMermaidOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (!enabled || !code.trim()) return

    const container = containerRef.current
    if (!container) return

    let cancelled = false
    setStatus('loading')

    void (async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          fontFamily: 'inherit'
        })
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, code)
        if (cancelled) return
        container.innerHTML = svg
        const svgEl = container.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.maxHeight = '400px'
          svgEl.style.display = 'block'
          svgEl.style.margin = '0 auto'
        }
        setStatus('ok')
      } catch (e: any) {
        if (cancelled) return
        console.warn('[Mermaid] render failed:', e.message)
        container.innerHTML = `<pre style="font-size:12px;color:var(--color-text-secondary,#6e6e73);overflow-x:auto;padding:8px;">${code}</pre>`
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      if (container) container.innerHTML = ''
    }
  }, [code, enabled])

  return { containerRef, status }
}
