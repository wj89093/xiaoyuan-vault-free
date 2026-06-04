/* eslint-disable react-hooks/exhaustive-deps */
import { memo, useRef, useState, useEffect, useCallback, type JSX } from 'react'
import DOMPurify from 'dompurify'
import { useCodeMirror } from '../hooks/useCodeMirror'
import { useEditorContextMenu } from '../hooks/useEditorContextMenu'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useReaderSettings } from '../hooks/useReaderSettings'
import { EditorContextMenu } from '../components/EditorContextMenu'
import { TableOfContents } from './TableOfContents'
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
  /** v1.5 reader UX: 滚动位置记忆用 - 当前文档路径 (相对 vault) */
  filePath?: string | null
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
                padding: '6px 16px',
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
    content.style.cssText = 'width:100%;height:100%;overflow:auto;padding:16px'
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
            gap: 8,
            height: '100%'
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const pdfDocRef = useRef<any>(null)

  const renderPage = async (pdf: any, num: number) => {
    const canvas = canvasRef.current
    if (!canvas || !pdf) return
    const page = await pdf.getPage(num)
    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
  }

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
      renderPage(pdf, 1)
    })()
    return () => {
      cancelled = true
    }
  }, [dataUrl])

  useEffect(() => {
    if (pdfDocRef.current) void renderPage(pdfDocRef.current, pageNum)
  }, [pageNum, scale])

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <button
          type="button"
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1}
          aria-label={`上一页，第 ${pageNum} 页，共 ${numPages} 页`}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          ‹
        </button>
        <span aria-live="polite" style={{ fontSize: 13 }}>
          {pageNum} / {numPages}
        </span>
        <button
          type="button"
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          disabled={pageNum >= numPages}
          aria-label={`下一页，第 ${pageNum} 页，共 ${numPages} 页`}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => s + 0.2)}
          aria-label="放大"
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
            marginLeft: 12
          }}
        >
          🔍+
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          aria-label="缩小"
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          🔍-
        </button>
      </div>
      <div style={{ textAlign: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '100%', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}
        />
      </div>
    </div>
  )
})

export const Editor = memo(function Editor({
  value,
  onChange,
  onWikiLinkNavigate,
  nativePreview,
  isNativePreview = false,
  filePath = null
}: EditorProps): JSX.Element {
  const cmContainerRef = useRef<HTMLDivElement | null>(null)

  const { viewRef } = useCodeMirror(cmContainerRef, value, onChange, onWikiLinkNavigate)

  // v1.5 reader UX: 滚动位置记忆 (用户是读者, 重开回到上次位置)
  useScrollMemory({ filePath, viewRef, enabled: !isNativePreview })

  // v1.5 reader UX: 未读/新内容标记 — 用户实际打开文件即 mark seen
  useEffect(() => {
    if (filePath && !isNativePreview) {
      void window.api.lastSeenMark(filePath)
    }
  }, [filePath, isNativePreview])

  // v1.5 reader UX: TOC 显示状态 (默认关闭, 用户点击 toggle 按钮开启)
  const [showToc, setShowToc] = useState(false)

  // v1.5 reader UX: 字体/行距调节
  const { settings: readerSettings, setFontSize, setLineHeight } = useReaderSettings()

  // Context menu
  const handleFormat = useCallback((command: string, params?: Record<string, any>) => {
    const view = (window as any).__cmView
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
              gap: 12
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
                    padding: '6px 16px',
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
      style={{
        '--reader-font-size': `${readerSettings.fontSize}px`,
        '--reader-line-height': String(readerSettings.lineHeight),
      } as React.CSSProperties}
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
      <div className="editor-main" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div
          ref={cmContainerRef}
          style={{ flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', cursor: 'text' }}
        />
        {/* v1.5 reader UX: TOC 目录侧栏 (toggle) */}
        {showToc && !isNativePreview && (
          <TableOfContents
            value={value}
            viewRef={viewRef}
            onClose={() => setShowToc(false)}
          />
        )}
      </div>
      {/* v1.5 reader UX: TOC toggle 浮动按钮 + 字体调节 */}
      {!isNativePreview && (
        <div className="editor-toolbar">
          <button
            className={`editor-toc-toggle ${showToc ? 'active' : ''}`}
            onClick={() => setShowToc((v) => !v)}
            title={showToc ? '关闭目录' : '显示目录'}
            aria-label={showToc ? '关闭目录' : '显示目录'}
          >
            目录
          </button>
          <div className="reader-settings">
            <span title="字体大小">A</span>
            <button
              onClick={() => setFontSize(readerSettings.fontSize - 1)}
              title="缩小字体"
              aria-label="缩小字体"
              disabled={readerSettings.fontSize <= 14}
            >
              −
            </button>
            <span className="reader-settings-value">{readerSettings.fontSize}</span>
            <button
              onClick={() => setFontSize(readerSettings.fontSize + 1)}
              title="放大字体"
              aria-label="放大字体"
              disabled={readerSettings.fontSize >= 24}
            >
              +
            </button>
            <span className="reader-settings-sep" />
            <span title="行距">行距</span>
            <button
              onClick={() => setLineHeight(readerSettings.lineHeight - 0.1)}
              title="减小行距"
              aria-label="减小行距"
              disabled={readerSettings.lineHeight <= 1.4}
            >
              −
            </button>
            <span className="reader-settings-value">{readerSettings.lineHeight.toFixed(1)}</span>
            <button
              onClick={() => setLineHeight(readerSettings.lineHeight + 0.1)}
              title="增加行距"
              aria-label="增加行距"
              disabled={readerSettings.lineHeight >= 2.2}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
