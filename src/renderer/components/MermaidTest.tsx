import type { JSX } from 'react'
/**
 * MermaidTest.tsx — 独立验证 Mermaid 渲染，不污染 Editor
 *
 * 通过在 App.tsx 中 import 《MermaidTest》（受 feature flag 控制）来启用。
 * 生产环境默认关闭。
 */
import { useMermaid } from '../hooks/useMermaid'

const TEST_CODE = `graph TD
  A[AI 生成] --> B{评估质量}
  B -->|好| C[直接使用]
  B -->|差| D[微调]
  D --> C`

const FLOWCHART_CODE = `flowchart LR
  subgraph 前端
    A[React UI] --> B[Editor]
    A --> C[FileTree]
  end
  subgraph 后端
    D[IPC Handlers] --> E[Services]
    E --> F[SQLite]
  end
  B <--> D
  C <--> D`

export function MermaidTest(): JSX.Element {
  const { containerRef: ref1, status: s1 } = useMermaid({ code: TEST_CODE })
  const { containerRef: ref2, status: s2 } = useMermaid({ code: FLOWCHART_CODE })

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Mermaid 渲染测试</h2>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          流程图（graph TD）
        </h3>
        <div
          ref={ref1}
          style={{
            border: '1px solid var(--color-border, #d1d1d6)',
            borderRadius: 8,
            padding: 16,
            background: 'var(--color-surface, #fff)',
            minHeight: 120
          }}
        />
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          状态: {s1}
        </p>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          复杂流程图（flowchart LR + subgraph）
        </h3>
        <div
          ref={ref2}
          style={{
            border: '1px solid var(--color-border, #d1d1d6)',
            borderRadius: 8,
            padding: 16,
            background: 'var(--color-surface, #fff)',
            minHeight: 120
          }}
        />
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          状态: {s2}
        </p>
      </div>
    </div>
  )
}

export { useMermaid }
