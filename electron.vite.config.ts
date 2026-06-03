import 'dotenv/config'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    },
    define: {
      'process.env.AGENT_ENABLED': JSON.stringify(process.env.AGENT_ENABLED || 'true'),
      'process.env.BUILD_TARGET': JSON.stringify(process.env.BUILD_TARGET || 'pro'),
      'process.env.QWEN_API_KEY': JSON.stringify(process.env.QWEN_API_KEY || ''),
      'process.env.QWEN_MODEL': JSON.stringify(process.env.QWEN_MODEL || 'qwen3.6-flash'),
      'process.env.MINIMAX_API_KEY': JSON.stringify(process.env.MINIMAX_API_KEY || ''),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(process.env.DEEPSEEK_API_KEY || ''),
      'process.env.DEEPSEEK_MODEL': JSON.stringify(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'),
      'process.env.AUTH_GATEWAY_URL': JSON.stringify(process.env.AUTH_GATEWAY_URL || 'http://localhost:3000'),
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
          // Free v1.4 已删 aiChat.html + bubblePreload (Pro 专用)
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        'pdf.worker': resolve(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
      }
    },
    optimizeDeps: {
      exclude: ['pdfjs-dist']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        // P4-2026-06-02: 拆 vendor chunk,改善首屏加载和缓存友好
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('d3') || id.includes('d3-')) return 'vendor-d3'
              if (id.includes('mermaid')) return 'vendor-mermaid'
              if (id.includes('pptx-preview') || id.includes('pptxgenjs')) return 'vendor-pptx'
              if (id.includes('xlsx') || id.includes('xlsx-style') || id.includes('exceljs')) return 'vendor-xlsx'
              if (id.includes('pdfjs')) return 'vendor-pdf'
              if (id.includes('katex')) return 'vendor-katex'
              if (id.includes('codemirror') || id.includes('@codemirror')) return 'vendor-codemirror'
              if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
            }
          }
        }
      }
    },
    plugins: [react()]
  }
})