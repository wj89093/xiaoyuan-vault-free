/**
 * D3Context — lazy D3 loading.
 *
 * Loads D3 only when first needed (graph panel opens).
 * Before loaded, consumers render a skeleton.
 * This defers ~200KB D3 parse+execute until graph panel first opens.
 */
import { createContext } from 'react'

 
type D3Module = any

interface D3ContextValue {
  d3: D3Module
  loaded: boolean
}

export const D3Context = createContext<D3ContextValue>({ d3: null, loaded: false })

// Singleton loader (shared across all consumers)
let d3Singleton: D3Module = null
let d3LoadPromise: Promise<D3Module> | null = null

export function loadD3(): Promise<D3Module> {
  if (d3Singleton) return Promise.resolve(d3Singleton)
  if (d3LoadPromise) return d3LoadPromise

  d3LoadPromise = import('d3').then(d3 => {
    d3Singleton = d3
    return d3
  })
  return d3LoadPromise
}