import type { XyVaultAPI } from '../shared/window.d.ts'
import React from 'react'
import DOMPurify from 'dompurify'
import ReactDOM from 'react-dom/client'
import { D3Provider } from './contexts/D3Provider'
import App from './App'
import './styles/global.css'
import './styles/inline-preview.css'
import './styles/panels.css'
import 'katex/dist/katex.min.css'
import './styles/callout.css'
import './styles/variables.css'
import './styles/skeleton.css'
import { initTheme } from './utils/theme/themeManager'

// Initialize theme (must be before App renders to prevent FOUC)
initTheme()

// Ensure window.api type is available
declare global {
  interface Window {
    api: XyVaultAPI
  }
}

// Expose DOMPurify globally for mermaid v11 (which uses window.DOMPurify.sanitize internally)
window.DOMPurify = DOMPurify

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <D3Provider>
      <App />
    </D3Provider>
  </React.StrictMode>
)
