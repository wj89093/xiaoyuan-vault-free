/**
 * KnowledgeGraph — D3 force-directed knowledge graph panel
 *
 * Loads graph data, manages UI state, delegates D3 rendering to KnowledgeGraphViz.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, X } from 'lucide-react'
import {
  KnowledgeGraphViz,
  buildLegend,
  folderColor,
  type GNode,
  type GLink
} from './KnowledgeGraphViz'

interface KnowledgeGraphProps {
  files: unknown[]
  selectedFile: string | null
  onSelect: (path: string) => void
  onClose: () => void
}

// ─── Types (shared with Viz) ─────────────────────────────────────────

interface GraphData {
  nodes: Array<{ id: string; title: string; edge_count?: number }>
  edges: Array<{ source: string; target: string; relation: string; weight: number }>
}

// ─── Graph loading + filtering ─────────────────────────────────────

async function loadGraph(): Promise<{ nodes: GNode[]; links: GLink[] }> {
  let data: unknown = await window.api.graphLoad?.()
  if (!data) {
    await window.api.graphRebuild?.()
    data = await window.api.graphLoad?.()
  }
  if (!data || typeof data !== 'object') return { nodes: [], links: [] }
  const g = data as GraphData
  const rawNodes = g.nodes ?? []
  const rawEdges = g.edges ?? []

  const folderGroups = new Map<string, string[]>()
  const nodeMap = new Map<string, GNode>()

  const isThemeFile = (name: string) =>
    ['index.md', 'log.md', 'schema.md', 'README.md'].includes(name)

  for (const n of rawNodes) {
    const id = String(n.id ?? '')
    const title = String(n.title ?? id.split('/').pop()?.replace(/\.md$/, '') ?? '')
    const folder = id.includes('/') ? id.split('/').slice(0, -1).join('/') : ''
    const isTheme = isThemeFile(id.split('/').pop() ?? '')
    if (!isTheme && title) {
      let subfolder = ''
      const wikiMatch = id.match(/\/_wiki\/([^/]+)\//)
      if (wikiMatch) subfolder = wikiMatch[1]
      const nodeColor = subfolder ? folderColor(subfolder) : '#a0b4cf'
      nodeMap.set(id, {
        id,
        name: title.slice(0, 25),
        folder,
        color: nodeColor,
        edge_count: n.edge_count
      } as GNode)
      if (folder) {
        if (!folderGroups.has(folder)) folderGroups.set(folder, [])
        folderGroups.get(folder)!.push(id)
      }
    }
  }

  const links: GLink[] = []
  const seen = new Set<string>()
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

  for (const e of rawEdges) {
    const source = String(e.source ?? '')
    const target = String(e.target ?? '')
    const relation = String(e.relation ?? '')
    const key = edgeKey(source, target)
    if (seen.has(key)) continue
    seen.add(key)
    if (nodeMap.has(source) && nodeMap.has(target)) {
      links.push({
        source,
        target,
        type: relation === 'folder' ? 'folder' : 'typed_link',
        weight: Number(e.weight ?? 1)
      } as GLink)
    }
  }

  // Folder co-occurrence edges
  const MAX_FOLDER_LINKS = 50
  let folderLinkCount = 0
  for (const [, members] of folderGroups) {
    if (members.length < 2) continue
    members.sort()
    for (let i = 0; i < members.length && folderLinkCount < MAX_FOLDER_LINKS; i++) {
      for (let j = i + 1; j < members.length && folderLinkCount < MAX_FOLDER_LINKS; j++) {
        const key = edgeKey(members[i], members[j])
        if (!seen.has(key)) {
          seen.add(key)
          links.push({
            source: members[i],
            target: members[j],
            type: 'folder',
            weight: 0.3
          } as GLink)
          folderLinkCount++
        }
      }
    }
  }

  // Connected nodes only
  const linkedIds = new Set<string>()
  for (const l of links) {
    linkedIds.add(typeof l.source === 'string' ? l.source : (l.source as GNode).id)
    linkedIds.add(typeof l.target === 'string' ? l.target : (l.target as GNode).id)
  }
  for (const [id, n] of nodeMap) {
    if (n.edge_count > 0) linkedIds.add(id)
  }

  const nodes = [...nodeMap.values()].filter((n) => linkedIds.has(n.id))
  if (nodes.length === 0) {
    const sorted = [...nodeMap.values()].sort((a, b) => (b.edge_count ?? 0) - (a.edge_count ?? 0))
    nodes.push(...sorted.slice(0, 20))
  }

  return { nodes, links }
}

// ─── Component ──────────────────────────────────────────────────────

export function KnowledgeGraph({
  files: _files,
  selectedFile,
  onSelect,
  onClose
}: KnowledgeGraphProps): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] })
  const [error, setError] = useState<string | null>(null)
  const [tooltip, _setTooltip] = useState<{
    id: string
    name: string
    folder?: string
    x: number
    y: number
    links: number
  } | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [d3Error, setD3Error] = useState<string | null>(null)
  const [showFolderEdges, setShowFolderEdges] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [nodeSizeMode, setNodeSizeMode] = useState<'degree' | 'uniform'>('degree')
  const [showSettings, setShowSettings] = useState(false)
  const [linkFilters, setLinkFilters] = useState<Set<string>>(
    new Set(['typed_link', 'shared_tag', 'similar_content'])
  )
  // P2-1: store last node positions for deterministic layout
  const lastPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { nodes, links } = await loadGraph()
        if (cancelled) return
        setGraph({ nodes, links })
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleLinkFilter = (type: string) => {
    setLinkFilters((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const typedLinks = graph.links.filter((l) => l.type !== 'folder').length
  const folderLinks = graph.links.filter((l) => l.type === 'folder').length

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id)
    },
    [onSelect]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!graph.nodes.length) return
      const ids = graph.nodes.map((n) => n.id)
      let idx = focusedNodeId ? ids.indexOf(focusedNodeId) : -1
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        idx = idx < 0 ? 0 : (idx + 1) % ids.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        idx = idx < 0 ? ids.length - 1 : (idx - 1 + ids.length) % ids.length
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (idx >= 0) onSelect(ids[idx])
        return
      } else {
        return
      }
      setFocusedNodeId(ids[idx])
    },
    [graph.nodes, focusedNodeId, onSelect]
  )

  return (
    <div
      className="knowledge-graph"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      <div className="kg-header">
        <span className="kg-title">知识图谱</span>
        <span className="kg-stats">
          {graph.nodes.length} 节点 · {typedLinks} 关系 · {folderLinks} 同夹
        </span>
        <span
          className="kg-zoom-level"
          id="kg-zoom-level"
          aria-live="polite"
          aria-label="当前缩放"
        />
        <div className="kg-header-actions">
          <button
            className="btn btn-icon"
            title="图谱设置"
            onClick={() => setShowSettings((v) => !v)}
            aria-disabled={loading}
          >
            <Settings size={14} />
          </button>
          <button className="btn btn-icon" onClick={onClose} aria-disabled={loading}>
            <X size={14} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="kg-settings">
          <label className="kg-settings-item">
            <input
              type="checkbox"
              checked={showFolderEdges}
              onChange={(e) => setShowFolderEdges(e.target.checked)}
            />
            显示同文件夹边
          </label>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary, #8e8e93)',
              padding: '2px 0',
              fontWeight: 500
            }}
          >
            关系类型过滤
          </div>
          {[
            ['typed_link', '#a0b4cf', 'Wiki 链接'],
            ['shared_tag', '#b8c5d6', '共享标签'],
            ['similar_content', '#b8c5d6', '相似内容']
          ].map(([type, color, label]) => (
            <label key={type} className="kg-settings-item">
              <input
                type="checkbox"
                checked={linkFilters.has(type)}
                onChange={() => toggleLinkFilter(type)}
              />
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                  display: 'inline-block',
                  marginRight: 4
                }}
              />
              {label}
            </label>
          ))}
          <label className="kg-settings-item">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            显示标签
          </label>
          <label className="kg-settings-item">
            <span style={{ marginRight: 8 }}>节点大小</span>
            <select
              value={nodeSizeMode}
              onChange={(e) => setNodeSizeMode(e.target.value as 'degree' | 'uniform')}
            >
              <option value="degree">按连接数</option>
              <option value="uniform">统一大小</option>
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <div className="kg-skeleton" role="status" aria-live="polite" aria-label="加载中">
          <div className="kg-skeleton-header">
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-stat" />
          </div>
          <div className="kg-skeleton-body">
            <div className="kg-skeleton-node kg-skeleton-node-1" />
            <div className="kg-skeleton-node kg-skeleton-node-2" />
            <div className="kg-skeleton-node kg-skeleton-node-3" />
            <div className="kg-skeleton-edge" />
            <div className="kg-skeleton-edge" />
          </div>
          <div className="kg-skeleton-footer">
            <div className="skeleton-dot" />
            <div className="skeleton-dot" />
          </div>
        </div>
      ) : error ? (
        <div className="kg-empty" role="status" aria-live="polite">
          <span>{error}</span>
        </div>
      ) : graph.nodes.length === 0 ? (
        <div className="kg-empty">
          <span>暂无关联文件，添加 [[链接]] 或 frontmatter 关系后出现</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {d3Error && (
            <div className="kg-error-banner">
              <span>{d3Error}</span>
              <button
                className="btn"
                onClick={() => {
                  setD3Error(null)
                  setGraph({ nodes: graph.nodes, links: graph.links })
                }}
              >
                重试
              </button>
            </div>
          )}
          <KnowledgeGraphViz
            nodes={graph.nodes}
            links={graph.links}
            selectedFile={selectedFile}
            showFolderEdges={showFolderEdges}
            showLabels={showLabels}
            nodeSizeMode={nodeSizeMode}
            linkFilters={linkFilters}
            onSelect={handleSelect}
            focusedNodeId={focusedNodeId}
            onFocusChange={setFocusedNodeId}
            onD3Error={setD3Error}
            lastPositionsRef={lastPositionsRef}
          />
          {tooltip && (
            <div
              className="kg-tooltip"
              style={{ left: tooltip.x + 14, top: tooltip.y - 8, pointerEvents: 'none' }}
            >
              <div className="kg-tooltip-name">{tooltip.name}</div>
              <div className="kg-tooltip-meta">
                {tooltip.folder && <span className="kg-tooltip-folder">{tooltip.folder}</span>}
                <span className="kg-tooltip-links">{tooltip.links} 个连接</span>
              </div>
              <div className="kg-tooltip-path">{tooltip.id}</div>
            </div>
          )}
        </div>
      )}

      <div className="kg-legend">
        {buildLegend(graph.nodes)}
        <span className="kg-legend-hint kg-legend-hint-right">滚轮缩放 · 拖拽 · 点击打开</span>
        <span className="kg-legend-size-hint" title="节点大小表示连接数（度）">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="3" cy="5" r="2.5" fill="#a0b4cf" opacity="0.8" />
          </svg>{' '}
          连接数
          <svg width="10" height="10" viewBox="0 0 10 10">
            <circle cx="3" cy="5" r="4" fill="#1a56a8" opacity="0.8" />
          </svg>{' '}
          高连接
        </span>
      </div>
    </div>
  )
}
