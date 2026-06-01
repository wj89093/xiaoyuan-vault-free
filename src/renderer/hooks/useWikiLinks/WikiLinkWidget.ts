/**
 * WikiLinkWidget.ts — CM6 Widget for rendering wiki links
 */
import { WidgetType } from '@codemirror/view'
import type { WikiLinkStatus } from './types'

export class WikiLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly label: string,
    private readonly status: WikiLinkStatus,
  ) { super() }

  eq(other: WikiLinkWidget): boolean {
    return this.target === other.target && this.label === other.label && this.status === other.status
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = `cm-atomic-wiki-link cm-atomic-wiki-link-${this.status}`
    span.dataset.wikiLinkTarget = this.target
    span.textContent = this.label
    // atomic-editor pattern: widget attaches its own click listener
    span.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      // Dispatch a bubbling custom event that EditorView can observe
      span.dispatchEvent(new CustomEvent('cm-wikilink-click', {
        bubbles: true,
        composed: true,
        detail: { target: this.target, label: this.label, status: this.status },
      }))
    })
    span.setAttribute('role', 'link')
    span.setAttribute('tabindex', '0')
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        span.click()
      }
    })
    return span
  }

  ignoreEvent(): boolean { return false }
}