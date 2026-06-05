/* eslint-disable react-hooks/exhaustive-deps */
import { memo, useRef, useState, useEffect, useCallback, type JSX } from 'react'
import DOMPurify from 'dompurify'
import { useCodeMirror } from '../hooks/useCodeMirror'
import { getActiveView } from '../hooks/editorRegistry'
import { useEditorContextMenu } from '../hooks/useEditorContextMenu'
import { EditorContextMenu } from '../components/EditorContextMenu'
import { createFormatCommands, type EditorFormatCommands } from '../utils/editorFormat'

interface EditorProps {
  /** Free 仓 v1.4: Pro 仓用 key (vaultState.selectedFile) - 加 optional */
  key?: string
  value: string
  onChange: (value: string) => void
  onWikiLinkNavigate?: (target: string) => void
  nativePreview?: any
  isNativePreview?: boolean
  /** P3-2026-06-03: Pro 仓的 reference handler (cross-doc link) - Free 暂用 any */
  onReference?: (ref: any) => void
}

export const DocxViewer = memo(function DocxViewer({
  dataUrl,
  onDownload
}: {
  dataUrl: string
  onDownload?: () => void
}): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'fail'>(() =>
    dataUrl ? 'loading' : 'fail'
  )

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    void (async () => {
      if (!dataUrl) {
        setState('fail')
        return
      }
      // Create content div outside React's tree so docx-preview DOM changes
      // don't conflict with React's virtual DOM reconciliation
      const content = document.createElement('div')
      contentRef.current = content
      wrapper.appendChild(content)
      try {
        const { renderAsync } = await import('docx-preview')
        const raw = dataUrl.split(',')[1]
        if (!raw) {
          setState('fail')
          return
        }
        const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
        timeout = setTimeout(() => {
          if (!cancelled) setState('fail')
        }, 25_000)
        await renderAsync(bytes.buffer, content, content, {
          className: 'docx-preview',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true
        })
        clearTimeout(timeout as ReturnType<typeof setTimeout>)
        if (!cancelled) setState('ready')
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_err) {
        clearTimeout(timeout as ReturnType<typeof setTimeout>)
        if (!cancelled) setState('fail')
      }
    })()
    return () => {
      cancelled = true
      if (contentRef.current) {
        contentRef.current.remove()
        contentRef.current = null
      }
    }
  }, [dataUrl])

  return (
    <div ref={wrapperRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      {state === 'loading' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}
        >
          加载中...
        </div>
      )}
      {state === 'fail' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            height: '100%'
          }}
        >
          <p style={{ fontSize: 64, marginBottom: 16 }}>📄</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            预览失败，请下载原始文件查看
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              style={{
                marginTop: 16,
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              下载原始文件
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export const XlsxViewer = memo(function XlsxViewer({ dataUrl }: { dataUrl: string }): JSX.Element {
  const [activeSheet, setActiveSheet] = useState<string>('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheets, setSheets] = useState<Record<string, string>>({})
  const [state, setState] = useState<'loading' | 'ready' | 'fail'>(() =>
    dataUrl ? 'loading' : 'fail'
  )

  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    void (async () => {
      try {
        const raw = dataUrl.split(',')[1]
        if (!raw) {
          setState('fail')
          return
        }
        const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
        const XLSX = await import('xlsx')
        const wb = XLSX.read(bytes.buffer, { type: 'array' })
        if (cancelled) return
        const names = wb.SheetNames || []
        const sheetData: Record<string, string> = {}
        for (const name of names) {
          sheetData[name] = XLSX.utils.sheet_to_html(wb.Sheets[name])
        }
        timeout = setTimeout(() => {
          if (!cancelled) setState('fail')
        }, 15_000)
        if (cancelled) {
          clearTimeout(timeout as ReturnType<typeof setTimeout>)
          return
        }
        setSheetNames(names)
        setSheets(sheetData)
        setActiveSheet(names[0] || '')
        clearTimeout(timeout as ReturnType<typeof setTimeout>)
        if (!cancelled) setState('ready')
      } catch (err) {
        clearTimeout(timeout as ReturnType<typeof setTimeout>)
        console.warn('[XlsxViewer] failed:', err)
        if (!cancelled) setState('fail')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataUrl])

  if (state === 'loading')
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        加载中...
      </div>
    )
  if (state === 'fail')
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          padding: 32
        }}
      >
        <p style={{ fontSize: 64, marginBottom: 16 }}>📊</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>预览失败，请下载原始文件查看</p>
      </div>
    )
  if (sheetNames.length === 0)
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>无可用工作表</p>
      </div>
    )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="xlsx-tabs">
        {sheetNames.map((name) => (
          <button
            key={name}
            className={`xlsx-tab-btn${activeSheet === name ? ' active' : ''}`}
            onClick={() => setActiveSheet(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="xlsx-content"
        dangerouslySetInnerHTML={{ __html: sheets[activeSheet] || '' }}
      />
    </div>
  )
})

export const HtmlFrame = memo(function HtmlFrame({ content }: { content: string }): JSX.Element {
  const [blobUrl, setBlobUrl] = useState<string>('')
  useEffect(() => {
    const blob = new Blob([content], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
     
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [content])
  if (!blobUrl) return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>加载中...</div>
  return (
    <iframe
      src={blobUrl}
      style={{ width: '100%', height: '100%', minHeight: '85vh', border: 'none' }}
      sandbox="allow-scripts allow-same-origin"
    />
  )
})

export const PptxViewer = memo(function PptxViewer({ dataUrl }: { dataUrl: string }): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'fail'>(() =>
    dataUrl ? 'loading' : 'fail'
  )
  const [progress, setProgress] = useState('')
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const content = document.createElement('div')
    content.style.cssText = 'width:100%;height:100%;overflow:auto;padding:var(--space-4)'
    contentRef.current = content
    wrapper.appendChild(content)
    let cancelled = false
    void (async () => {
      const originalKeys = Object.keys as (o: any) => string[]
      Object.keys = (o: any) => (o ? originalKeys(o) : [])
      try {
        setProgress('正在加载 PPTX 预览…')
        const { init } = await import('pptx-preview')
        const resp = await fetch(dataUrl)
        const arrayBuffer = await resp.arrayBuffer()
        setProgress('正在渲染幻灯片…')
        const viewer = init(content, { width: 960, height: 540 })
        const timeout = setTimeout(() => {
          if (!cancelled) {
            setProgress('')
            setState('fail')
          }
        }, 20000)
        await viewer.preview(arrayBuffer)
        clearTimeout(timeout as ReturnType<typeof setTimeout>)
        setTimeout(() => {
          if (!cancelled && content.children.length <= 1) setState('fail')
          else if (!cancelled) setState('ready')
        }, 500)
      } catch (e) {
        if (!cancelled) setState('fail')
        console.warn('[PptxViewer] failed:', e)
      } finally {
        Object.keys = originalKeys
        if (!cancelled) setProgress('')
      }
    })()
    return () => {
      cancelled = true
      if (contentRef.current) {
        contentRef.current.remove()
        contentRef.current = null
      }
    }
  }, [dataUrl])

  return (
    <div ref={wrapperRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      {state === 'loading' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: ',var(--space-2)',height: '100%'
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--border,#e5e5ea)',
              borderTopColor: 'var(--accent,#007aff)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary,#8e8e93)' }}>
            {progress || '加载中…'}
          </span>
        </div>
      )}
      {state === 'fail' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            height: '100%'
          }}
        >
          <p style={{ fontSize: 64, marginBottom: 16 }}>📊</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>此 PPTX 暂不支持预览</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
            文件包含嵌入式字体或特殊主题，请用 PowerPoint 打开
          </p>
        </div>
      )}
    </div>
  )
})

export const PDFViewer = memo(function PDFViewer({ dataUrl }: { dataUrl: string }): JSX.Element {
  // v1.5: 连续滚动模式 (替代逐页翻页) — 循环 renderPage 1..N 各自独立 canvas 堆叠
  const pagesRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const pdfDocRef = useRef<any>(null)
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set())

  const renderPage = async (pdf: any, num: number, canvas: HTMLCanvasElement) => {
    if (!pdf || !canvas) return
    const page = await pdf.getPage(num)
    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
  }

  const renderAllPages = useCallback(async (pdf: any) => {
    if (!pdf) return
    setRenderedPages(new Set())
    const next = new Set<number>()
    for (let n = 1; n <= pdf.numPages; n++) {
      const canvas = pagesRef.current.get(n)
      if (canvas) {
        await renderPage(pdf, n, canvas)
        next.add(n)
        setRenderedPages(new Set(next))
      }
    }
  }, [scale])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs'
      const raw = dataUrl.split(',')[1]
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
      if (cancelled) return
      pdfDocRef.current = pdf
      setNumPages(pdf.numPages)
      await renderAllPages(pdf)
    })()
    return () => {
      cancelled = true
    }
     
  }, [dataUrl])

  useEffect(() => {
    if (pdfDocRef.current) void renderAllPages(pdfDocRef.current)
     
  }, [scale])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div
        style={{
          display: 'flex',
          gap: ',var(--space-2)',marginBottom: 12,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--color-bg, #1e1e1e)',
          padding: 'var(--space-1) 0'
        }}
      >
        <span aria-live="polite" style={{ fontSize: 12, color: 'var(--text-secondary, #888)' }}>
          {numPages > 0 ? `${numPages} 页 · 连续滚动` : '加载中…'}
          {renderedPages.size > 0 && renderedPages.size < numPages && ` · 已渲染 ${renderedPages.size}${numPages}`}
        </span>
        <button type="button" onClick={() => setScale((s) => s + 0.2)} aria-label="放大" style={btnStyle}>🔍+</button>
        <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} aria-label="缩小" style={btnStyle}>🔍-</button>
      </div>
      {numPages > 0 && Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          data-page-num={n}
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 16,
            position: 'relative'
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 16,
              fontSize: 11,
              color: 'var(--text-tertiary, #888)',
              background: 'var(--color-surface, #2d2d2d)',
              padding: 'var(--space-2) var(--space-2)',
              borderRadius: 4
            }}
          >
            {n} / {numPages}
          </span>
          <canvas
            ref={(el) => {
              if (el) pagesRef.current.set(n, el)
              else pagesRef.current.delete(n)
            }}
            style={{
              maxWidth: '100%',
              borderRadius: 8,
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}
          />
        </div>
      ))}
    </div>
  )
})

// 按钮样式 (提取常量)
const btnStyle: React.CSSProperties = {
  padding: 'var(--space-1) var(--space-3)',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  cursor: 'pointer'
}
export const Editor = memo(function Editor({
  value,
  onChange,
  onWikiLinkNavigate,
  nativePreview,
  isNativePreview = false
}: EditorProps): JSX.Element {
  const cmContainerRef = useRef<HTMLDivElement | null>(null)

  const { viewRef } = useCodeMirror(cmContainerRef, value, onChange, onWikiLinkNavigate)

  // Context menu
  const handleFormat = useCallback((command: string, params?: Record<string, any>) => {
    const view = getActiveView()
    if (!view) return
    const cmds: EditorFormatCommands = createFormatCommands(view)
    switch (command) {
      case 'bold':
        cmds.bold()
        break
      case 'italic':
        cmds.italic()
        break
      case 'code':
        cmds.code()
        break
      case 'link':
        cmds.link()
        break
      case 'quote':
        cmds.quote()
        break
      case 'heading':
        if (params?.level === 1) cmds.h1()
        else if (params?.level === 2) cmds.h2()
        else cmds.h3()
        break
      case 'h1':
        cmds.h1()
        break
      case 'h2':
        cmds.h2()
        break
      case 'h3':
        cmds.h3()
        break
      case 'codeblock':
        cmds.codeblock()
        break
      case 'image':
        cmds.image()
        break
      case 'table':
        cmds.table()
        break
      case 'hr':
        cmds.hr()
        break
    }
  }, [])

  const { contextMenu, showContextMenu, hideContextMenu } = useEditorContextMenu(
    viewRef as React.MutableRefObject<any>,
    { onFormat: handleFormat }
  )

  // Native preview (image/html/pdf/docx) — used by file manager for binary file previews
  if (isNativePreview) {
    if (!nativePreview) {
      return (
        <>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div
            className="editor-wrapper"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 'var(--space-3)'
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid var(--border, #e5e5ea)',
                borderTopColor: 'var(--accent, #007aff)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}
              role="status"
              aria-label="加载中"
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>加载预览中…</p>
          </div>
        </>
      )
    }
    return (
      <div className="editor-wrapper" style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          className="native-preview"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: nativePreview.type === 'pdf' ? 0 : 32,
            minWidth: 0
          }}
        >
          {nativePreview.type === 'image' && nativePreview.dataUrl && (
            <img
              src={nativePreview.dataUrl}
              alt="预览"
              style={{ maxWidth: '100%', borderRadius: 8 }}
            />
          )}
          {nativePreview.type === 'pdf' && nativePreview.dataUrl && (
            <PDFViewer dataUrl={nativePreview.dataUrl} />
          )}
          {nativePreview.type === 'docx' && nativePreview.dataUrl && (
            <DocxViewer dataUrl={nativePreview.dataUrl} />
          )}
          {nativePreview.type === 'pptx' && nativePreview.dataUrl && (
            <PptxViewer dataUrl={nativePreview.dataUrl} />
          )}
          {nativePreview.type === 'spreadsheet' && nativePreview.dataUrl && (
            <XlsxViewer dataUrl={nativePreview.dataUrl} />
          )}
          {nativePreview.type === 'html' && nativePreview.content && (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(nativePreview.content) }} />
          )}
          {nativePreview.type === 'htmlIframe' && nativePreview.content && (
            <HtmlFrame content={nativePreview.content} />
          )}
          {nativePreview.type === 'unsupported' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                padding: 32
              }}
            >
              <p style={{ fontSize: 48, marginBottom: 12 }}>📄</p>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>暂不支持预览此文件格式</p>
              {nativePreview.filePath && (
                <button
                  onClick={() => window.api.openInDefaultApp?.(nativePreview.filePath)}
                  style={{
                    marginTop: 16,
                    padding: 'var(--space-2) var(--space-4)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  用默认应用打开
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="editor-wrapper"
      onContextMenu={(e) => {
        if (!isNativePreview) showContextMenu(e)
      }}
    >
      {contextMenu.visible && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          editorView={contextMenu.viewRef}
          onClose={hideContextMenu}
          onFormat={handleFormat}
        />
      )}
      <div
        ref={cmContainerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', cursor: 'text' }}
      />
    </div>
  )
})
