/**
 * D3Provider — wraps the app and lazily loads D3 on first render.
 *
 * Strategy: D3 is loaded on mount (not on demand) but only once.
 * The graph is a panel that doesn't always render, so consumers
 * use useD3() which returns null until d3 is loaded, allowing
 * the consumer to render a skeleton placeholder instead of D3-dependent UI.
 *
 * This defers D3 parse+execute to when the graph panel first opens,
 * reducing cold-start JS bundle parse cost (~200KB d3-force saved until needed).
 */
import { type ReactNode, useEffect, useState, type JSX } from 'react'
import { D3Context, loadD3 } from './D3Context'

type D3Value = { d3: unknown; loaded: boolean }

export function D3Provider({ children }: { children: ReactNode }): JSX.Element {
  const [d3, setD3] = useState<{ d3: unknown; loaded: boolean }['d3']>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Prefetch D3 when provider mounts (don't block render)
    void loadD3().then((m: D3Value['d3']) => {
      setD3(m)
      setLoaded(true)
    })
  }, [])

  return <D3Context.Provider value={{ d3, loaded }}>{children}</D3Context.Provider>
}
