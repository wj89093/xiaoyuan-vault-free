/**
 * useD3 — hook for consumers to get the lazily-loaded D3 module.
 *
 * Returns null until D3 is fully loaded, allowing the caller to render
 * a skeleton / placeholder instead of D3-dependent UI.
 *
 * Usage:
 *   const d3 = useD3()
 *   if (!d3) return <Skeleton />
 *   // use d3 freely
 */
import { useContext } from 'react'
import { D3Context } from '../contexts/D3Context'

export function useD3(): { d3: unknown; loaded: boolean } {
  return useContext(D3Context)
}