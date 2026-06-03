/**
 * Skeleton — 统一加载占位组件
 *
 * P2-2026-06-02: 之前 8+ 处 "加载中..." 硬编码,样式不统一。
 * 用 Skeleton 替代,提供 shimmer 动画 + 3 个 variant。
 */
import { memo } from 'react'

export type SkeletonVariant = 'text' | 'block' | 'circle'

interface SkeletonProps {
  variant?: SkeletonVariant
  width?: number | string
  height?: number | string
  /** 多行文本时,设置行数(仅 text variant 有效) */
  lines?: number
  /** 自定义 className(可选,覆盖默认) */
  className?: string
}

export const Skeleton = memo(function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className,
}: SkeletonProps): JSX.Element {
  if (variant === 'text' && lines > 1) {
    return (
      <div className="skeleton-stack" role="status" aria-label="加载中">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={`skeleton skeleton-text ${className ?? ''}`}
            style={{
              width: i === lines - 1 ? '60%' : (width ?? '100%'),
              height: height ?? 12,
            }}
          />
        ))}
      </div>
    )
  }

  const defaults: Record<SkeletonVariant, { w: number | string; h: number | string; br: number }> = {
    text: { w: '100%', h: 12, br: 3 },
    block: { w: '100%', h: 80, br: 6 },
    circle: { w: 32, h: 32, br: 9999 },
  }
  const d = defaults[variant]
  const finalW = width ?? d.w
  const finalH = height ?? d.h

  return (
    <div
      className={`skeleton skeleton-${variant} ${className ?? ''}`}
      style={{ width: finalW, height: finalH, borderRadius: d.br }}
      role="status"
      aria-label="加载中"
    />
  )
})
