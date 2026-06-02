/**
 * KnowledgeGraphViz — pure D3 force-directed graph renderer
 *
 * Stateless renderer: takes graph data + settings as props,
 * drives D3 directly via useEffect + useRef (no React state in render loop).
 */
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/refs, react-refresh/only-export-components */
import { useEffect, useRef, useMemo } from 'react'
import { useD3 } from '../hooks/useD3'

export interface GLink extends SimulationLinkDatum<GNode> {
  source: string | GNode
  target: string | GNode
  type: 'typed_link' | 'shared_tag' | 'similar_content' | 'folder'
  weight: number
}

export interface GNode extends SimulationNodeDatum {
  id: string
  name: string
  folder: string
  color: string
  edge_count?: number
}

interface VizProps {
  nodes: GNode[]
  links: GLink[]
  selectedFile: string | null
  showFolderEdges: boolean
  showLabels: boolean
  nodeSizeMode: 'degree' | 'uniform'
  linkFilters: Set<string>
  onSelect: (id: string) => void
  focusedNodeId?: string | null
  onFocusChange?: (id: string | null) => void
  onD3Error?: (err: string | null) => void
  // P2-1: stable layout via stored positions
  lastPositionsRef?: React.MutableRefObject<Map<string, { x: number; y: number }>>
}

// ─── Helpers (reused from original) ────────────────────────────────

export function folderColor(name: string): string {
  // Keep actual hex colors for JS runtime (CSS vars only valid in CSS property context)
  const palette = [
    '#1a56a8',
    '#1e7a4d',
    '#8b5cf6',
    '#d97706',
    '#dc2626',
    '#0891b2',
    '#65a30d',
    '#c026d3',
    '#ea580c',
    '#2563eb',
    '#1e7a4d',
    '#8b5cf6',
    '#d97706',
    '#dc2626',
    '#0891b2',
    '#1a56a8',
    '#1e7a4d',
    '#8b5cf6',
    '#d97706',
    '#0891b2'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

export function buildLegend(nodes: GNode[]): JSX.Element[] {
  const colorMap = new Map<string, string>()
  for (const n of nodes) {
    const wikiMatch = n.id.match(/\/_wiki\/([^/]+)\//)
    if (wikiMatch && !colorMap.has(wikiMatch[1])) colorMap.set(wikiMatch[1], n.color)
  }
  const hasNonWiki = nodes.some((n) => !n.id.includes('/_wiki/'))
  const items: JSX.Element[] = []
  for (const [name, color] of [...colorMap.entries()].sort()) {
    items.push(
      <span key={name} className="kg-legend-item">
        <span className="kg-legend-dot" style={{ background: color }} />
        {name}
      </span>
    )
  }
  if (hasNonWiki) {
    items.push(
      <span key="_note" className="kg-legend-item">
        <span className="kg-legend-dot" style={{ background: 'var(--color-graph-note)' }} />
        笔记
      </span>
    )
  }
  // P2-5: always show explanatory placeholder when nodes exist but legend is empty
  if (items.length === 0 && nodes.length > 0) {
    items.push(
      <span
        key="_empty"
        className="kg-legend-item"
        style={{ color: 'var(--color-text-tertiary, #a1a1a6)' }}
      >
        节点颜色代表所属子目录
      </span>
    )
  }
  return items
}

const COLORS = {
  nodeDefault: 'var(--color-text-tertiary)',
  nodeHub: 'var(--color-primary, #1a56a8)',
  linkWiki: 'var(--color-border-hover)',
  linkFolder: 'var(--color-border, #e0e4e8)',
  linkContent: 'var(--color-text-secondary, #b8c5d6)',
  text: 'var(--color-text-secondary, #4a5568)',
  sel: 'var(--color-accent, #1e7a4d)',
  selStroke: 'var(--color-accent-hover, #2d9a6c)'
}

const _isThemeFile = (name: string) =>
  ['index.md', 'log.md', 'schema.md', 'README.md'].includes(name)

// ─── Main renderer ─────────────────────────────────────────────────

export function KnowledgeGraphViz({
  nodes,
  links,
  selectedFile,
  showFolderEdges,
  showLabels,
  nodeSizeMode,
  linkFilters,
  onSelect,
  focusedNodeId,
  onFocusChange,
  onD3Error,
  lastPositionsRef: _lastPositionsRef
}: VizProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)

  const simRef = useRef<any>(null)

  const d3Ref = useRef<any>(null)
  const linkFiltersRef = useRef<Set<string>>(linkFilters)
  const lastPositionsRef = useRef<
    React.MutableRefObject<Map<string, { x: number; y: number }>> | undefined
  >(_lastPositionsRef)
  // Keep refs synced to latest props in render — safe pattern for stable-ref sync

  linkFiltersRef.current = linkFilters

  const { d3: d3Ctx } = useD3()
  // Sync d3 from context → ref (runs once on d3 load, after render)
  useEffect(() => {
    if (d3Ctx && !d3Ref.current) d3Ref.current = d3Ctx
  }, [d3Ctx])

  const graphKey = useMemo(() => nodes.length + links.length, [nodes, links])

  const linkFiltersStable = useRef<Set<string>>(linkFilters)

  linkFiltersStable.current = linkFilters

  useEffect(() => {
    if (!d3Ref.current || !svgRef.current || !nodes.length) return

    const d3 = d3Ref.current
    const svgEl = svgRef.current
    const w = (svgEl.clientWidth || svgEl.parentElement?.clientWidth) ?? 600
    const h = (svgEl.clientHeight || svgEl.parentElement?.clientHeight) ?? 400
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', w).attr('height', h)
    const mainG = svg.append('g')

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (e) => {
        mainG.attr('transform', e.transform)
        // P2-3: show zoom level in header
        const zoomPct = Math.round(e.transform.k * 100)
        const zoomEl = document.getElementById('kg-zoom-level')
        if (zoomEl) zoomEl.textContent = `${zoomPct}%`
      })
    svg.call(zoom)

    // Degree scale
    const deg = new Map<string, number>()
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id
      const t = typeof l.target === 'string' ? l.target : l.target.id
      deg.set(s, (deg.get(s) ?? 0) + 1)
      deg.set(t, (deg.get(t) ?? 0) + 1)
    }
    const maxDeg = Math.max(...deg.values(), 1)

    // Hide isolated nodes (no links)
    const connectedNodes = nodes.filter((n) => (deg.get(n.id) ?? 0) > 0)
    const scale =
      nodeSizeMode === 'uniform' ? () => 10 : d3.scaleSqrt().domain([0, maxDeg]).range([5, 20])

    // Filter links
    const filteredLinks = (
      showFolderEdges ? links : links.filter((l) => l.type !== 'folder')
    ).filter((l) => linkFiltersStable.current.has(l.type))

    // Links
    const lg = mainG.append('g')
    const linkSel = lg
      .selectAll<SVGLineElement, GLink>('line')
      .data(filteredLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) =>
        d.type === 'folder'
          ? COLORS.linkFolder
          : d.type === 'shared_tag' || d.type === 'similar_content'
            ? COLORS.linkContent
            : COLORS.linkWiki
      )
      .attr('stroke-width', (d) => (d.type === 'folder' ? 0.5 : Math.min(1.5, d.weight + 0.5)))
      .attr('stroke-opacity', (d) => (d.type === 'folder' ? 0.25 : 0.6))

    // Nodes
    const ng = mainG.append('g')
    const nodeSel = ng
      .selectAll<SVGGElement, GNode>('g')
      .data(connectedNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .attr('data-node-id', (d) => d.id)
      .attr('data-node-name', (d) => d.name)
      .attr('tabindex', '-1')
      .on('click', (_e, d) => onSelect(d.id))
      .on('keydown', (e: KeyboardEvent) => {
        if (['Enter', ' '].includes(e.key)) {
          e.preventDefault()
          onSelect((e.target as SVGGElement).getAttribute('data-node-id') ?? '')
        }
      })
      .call(
        d3
          .drag<SVGGElement, GNode>()
          .on('start', (e, d) => {
            if (!e.active && simRef.current) simRef.current.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (e, d) => {
            d.fx = e.x
            d.fy = e.y
          })
          .on('end', (e, d) => {
            if (!e.active && simRef.current) simRef.current.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    // Circles
    nodeSel
      .append('circle')
      .attr('r', (d) => scale(deg.get(d.id) ?? 1))
      .attr('fill', (d) => {
        if (selectedFile === d.id) return COLORS.sel
        if ((deg.get(d.id) ?? 0) > maxDeg * 0.5) return COLORS.nodeHub
        return d.color ?? COLORS.nodeDefault
      })
      .attr('stroke', (d) => (selectedFile === d.id ? COLORS.selStroke : 'transparent'))
      .attr('stroke-width', (d) => (selectedFile === d.id ? 2.5 : 0))
      .attr('opacity', (d) => (selectedFile === d.id ? 1 : 0.8))

    // Custom tooltip on hover (immediate, no browser delay)
    nodeSel.on('mouseenter', function (e, d) {
      // Find or create tooltip element
      const svgEl = svgRef.current
      let tip = svgEl?.parentElement?.querySelector('.d3-tooltip') as HTMLElement | null
      if (!tip) {
        tip = document.createElement('div')
        tip.className = 'd3-tooltip'
        tip.style.cssText = [
          'position: absolute',
          'background: var(--color-surface,rgba(0,0,0,0.85))',
          'color: var(--color-text-primary,#fff)',
          'font-size: 12px',
          'padding: 6px 10px',
          'border-radius: 6px',
          'pointer-events: none',
          'z-index: 100',
          'white-space: nowrap',
          'max-width: 300px',
          'overflow: hidden',
          'text-overflow: ellipsis',
          'box-shadow: 0 2px 8px rgba(0,0,0,0.15)'
        ].join('; ')
        svgEl?.parentElement?.appendChild(tip)
      }
      const rect = svgEl?.getBoundingClientRect()
      const tipContainer = svgEl?.parentElement
      const containerRect = tipContainer?.getBoundingClientRect()
      if (tip && rect && containerRect) {
        tip.textContent = d.name
        tip.style.display = 'block'
        tip.style.left =
          Math.min(e.clientX - containerRect.left + 14, (svgEl?.clientWidth ?? 300) - 120) + 'px'
        tip.style.top = Math.max(e.clientY - containerRect.top - 30, 4) + 'px'
      }
    })
    nodeSel.on('mouseleave', function () {
      const tip = svgRef.current?.parentElement?.querySelector('.d3-tooltip') as HTMLElement | null
      if (tip) tip.style.display = 'none'
    })

    // Labels
    if (showLabels) {
      nodeSel
        .append('text')
        .attr('dx', (d) => (typeof scale === 'function' ? scale(deg.get(d.id) ?? 1) : 10) + 5)
        .attr('dy', 4)
        .attr('font-size', (d) => ((deg.get(d.id) ?? 0) > maxDeg * 0.5 ? '12px' : '10px'))
        .attr('font-weight', (d) => ((deg.get(d.id) ?? 0) > maxDeg * 0.5 ? '600' : '400'))
        .attr('font-family', '-apple-system, sans-serif')
        .attr('fill', COLORS.text)
        .text((d) => d.name.slice(0, 20))
    }

    // Cluster force
    const fi = new Map<string, number>()
    let idx = 0
    for (const n of nodes) {
      if (n.folder && !fi.has(n.folder)) fi.set(n.folder, idx++)
    }

    // P2-1: Restore last positions for deterministic layout (avoid random re-layout)
    // D3 force simulation requires mutating node positions
    // eslint-disable react-hooks/immutability
    const stored = lastPositionsRef.current?.current
    if (stored && stored.size > 0) {
      for (const n of nodes) {
        const pos = stored.get(n.id)
        if (pos) {
          n.x = pos.x
          n.y = pos.y
          n.vx = 0
          n.vy = 0
        }
      }
    } else {
      for (const n of nodes) {
        n.vx = 0
        n.vy = 0
      }
    }
    /* eslint-enable react-hooks/immutability */

    // Cluster force helper (extracted so it can be referenced before definition)
    function clusterForce(alpha: number) {
      if (fi.size === 0) return
      for (const n of nodes) {
        const fi2 = fi.get(n.folder ?? '')
        if (fi2 === undefined) continue
        const a = (2 * Math.PI * fi2) / fi.size
        const r = Math.min(w, h) * 0.25
        const cx = w / 2 + Math.cos(a) * r
        const cy = h / 2 + Math.sin(a) * r
        // D3 force simulation requires mutating node velocities
        // eslint-disable react-hooks/immutability
        n.vx = (n.vx ?? 0) + (cx - (n.x ?? 0)) * alpha * 0.05
        n.vy = (n.vy ?? 0) + (cy - (n.y ?? 0)) * alpha * 0.05
      }
    }
    // eslint-enable react-hooks/immutability

    const sim = d3
      .forceSimulation<GNode>(connectedNodes)
      .force(
        'link',
        d3
          .forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((d) => (d.type === 'folder' ? 80 : 50))
          .strength((d) => (d.type === 'folder' ? 0.15 : 0.3))
      )
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force(
        'collision',
        d3.forceCollide<GNode>(
          (d) => (typeof scale === 'function' ? scale(deg.get(d.id) ?? 1) : 10) + 10
        )
      )
      .force('cluster', clusterForce)
      .alphaDecay(0.02)
      .velocityDecay(0.3)
      .alpha(0.5)

    simRef.current = sim

    sim
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => (d.source as GNode).x ?? 0)
          .attr('y1', (d) => (d.source as GNode).y ?? 0)
          .attr('x2', (d) => (d.target as GNode).x ?? 0)
          .attr('y2', (d) => (d.target as GNode).y ?? 0)
        nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })
      .on('end', () => {
        // P2-1: Persist final positions for next render
        if (lastPositionsRef.current) {
          const posMap = lastPositionsRef.current.current
          posMap.clear()
          for (const n of nodes) {
            if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y })
          }
        }
        if (onD3Error) onD3Error(null)
      })

    // Initial zoom fit
    setTimeout(() => {
      const bounds = svg.node()?.getBBox()
      if (bounds && bounds.width > 0) {
        const sc = Math.min(0.9, (w * 0.85) / bounds.width, (h * 0.85) / bounds.height)
        const tx = w / 2 - (bounds.x + bounds.width / 2) * sc
        const ty = h / 2 - (bounds.y + bounds.height / 2) * sc
        svg
          .transition()
          .duration(500)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(sc))
      }
    }, 100)

    return () => sim.stop()
  }, [graphKey, selectedFile, onSelect, showFolderEdges, showLabels, nodeSizeMode])

  // Keyboard navigation: arrow keys move focus between nodes
  useEffect(() => {
    if (!nodes.length) return
    const svgEl = svgRef.current
    if (!svgEl) return
    const ids = nodes.map((n) => n.id)
    const handler = (e: KeyboardEvent) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return
      e.preventDefault()
      const idx = focusedNodeId ? ids.indexOf(focusedNodeId) : -1
      let nextIdx = idx
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = idx < 0 ? 0 : (idx + 1) % ids.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = idx < 0 ? ids.length - 1 : (idx - 1 + ids.length) % ids.length
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (idx >= 0) onSelect(ids[idx])
        return
      }
      const nextId = ids[nextIdx]
      onFocusChange?.(nextId)
      // Pan SVG to keep focused node visible
      requestAnimationFrame(() => {
        const nodeEl = svgEl.querySelector(
          `[data-node-id="${CSS.escape(nextId)}"]`
        ) as SVGGElement | null
        if (!nodeEl || !d3Ref.current) return
        const nodeRect = nodeEl.getBoundingClientRect()
        const svgRect = svgEl.getBoundingClientRect()
        const svgTransform =
          d3Ref.current.select(svgEl).attr('transform') ?? 'translate(0,0) scale(1)'
        const m = svgTransform.match(/translate\(([^,]+),([^)]+)\)/)
        const curTx = m ? parseFloat(m[1]) : 0
        const curTy = m ? parseFloat(m[2]) : 0
        const scMatch = svgTransform.match(/scale\((\d+\.?\d*)\)/)
        const sc = scMatch ? parseFloat(scMatch[1]) : 1
        const dx = svgRect.left + svgRect.width / 2 - (nodeRect.left + nodeRect.width / 2)
        const dy = svgRect.top + svgRect.height / 2 - (nodeRect.top + nodeRect.height / 2)
        d3Ref.current
          .select(svgEl)
          .transition()
          .duration(200)
          .call(
            (d3Ref.current as any).zoom.transform,
            (d3Ref.current as any).zoomIdentity.translate(curTx + dx, curTy + dy).scale(sc)
          )
      })
    }
    svgEl.addEventListener('keydown', handler)
    return () => svgEl.removeEventListener('keydown', handler)
  }, [nodes, focusedNodeId, onSelect, onFocusChange])

  // Draw focus ring SVG element on focused node
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    // Remove all existing rings first
    svgEl.querySelectorAll('.focus-ring').forEach((r) => r.remove())
    if (!focusedNodeId) return
    const nodeEl = svgEl.querySelector(
      `[data-node-id="${CSS.escape(focusedNodeId)}"]`
    ) as SVGGElement | null
    if (!nodeEl) return
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    ring.setAttribute('r', '16')
    ring.setAttribute('fill', 'none')
    ring.setAttribute('stroke', '#1e7a4d')
    ring.setAttribute('stroke-width', '2.5')
    ring.setAttribute('class', 'focus-ring')
    ring.style.pointerEvents = 'none'
    nodeEl.insertBefore(ring, nodeEl.firstChild)
    nodeEl.setAttribute('tabindex', '-1')
  }, [focusedNodeId])

  // Title attribute for native browser tooltip fallback
  useEffect(() => {
    if (!svgRef.current) return
    svgRef.current.querySelectorAll('[data-node-id]').forEach((el) => {
      const g = el as SVGGElement
      const circle = g.querySelector('circle')
      if (circle) circle.setAttribute('title', g.getAttribute('data-node-name') ?? '')
    })
  })

  return (
    <>
      <svg
        ref={svgRef}
        role="img"
        aria-label="知识图谱"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {/* P2-2: Minimap — fixed-position overlay */}
      <div className="kg-minimap-container" aria-hidden="true">
        <div className="kg-minimap-label">缩略图</div>
        <svg className="kg-minimap-svg" />
      </div>
    </>
  )
}
