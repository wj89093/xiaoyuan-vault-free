import { useRef, useEffect, type JSX } from 'react'

interface FileTreeHoverPreviewProps {
  x: number
  y: number
  name: string
  summary: string
  onClose: () => void
}

export function FileTreeHoverPreview({
  x,
  y,
  name,
  summary,
  onClose = () => {}
}: FileTreeHoverPreviewProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [onClose])

  // P2-1: clamp position to viewport so preview never renders off-screen
  const PREVIEW_WIDTH = 280
  const PREVIEW_OFFSET = 8
  const clampedX = Math.min(x + PREVIEW_OFFSET, window.innerWidth - PREVIEW_WIDTH - PREVIEW_OFFSET)
  const clampedY = Math.min(y, window.innerHeight - 80)

  return (
    <div className="file-preview-tooltip" ref={ref} style={{ left: clampedX, top: clampedY }}>
      <div className="file-preview-name">{name}</div>
      <div className="file-preview-summary">{summary}</div>
    </div>
  )
}
