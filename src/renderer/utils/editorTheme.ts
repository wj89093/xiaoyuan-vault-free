/**
 * editorTheme.ts — Obsidian-inspired CM6 Theme
 *
 * Phase P1: Editor rendering optimization (2026-05-22)
 * Reference: Obsidian, Typora, and mdeditor theme systems
 *
 * Goals:
 * - Clean, minimal typography focused on readability
 * - Proper syntax highlighting for markdown (headings/bold/code/links)
 * - Comfortable line height and spacing
 * - Dark mode fully styled
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// ── Highlight Style (syntax colors) ────────────────────────────────────────────

export const vaultLightHighlight = HighlightStyle.define([
  // Headings — bold + color hierarchy
  { tag: t.heading1, fontWeight: '700', color: 'var(--color-text-primary)', fontSize: '1.35em' },
  { tag: t.heading2, fontWeight: '700', color: 'var(--color-text-primary)', fontSize: '1.2em' },
  { tag: t.heading3, fontWeight: '600', color: 'var(--color-text-primary)', fontSize: '1.1em' },
  {
    tag: [t.heading4, t.heading5, t.heading6],
    fontWeight: '600',
    color: 'var(--color-text-secondary)'
  },

  // Emphasis
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--color-text-tertiary)' },

  // Code
  {
    tag: t.monospace,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    color: 'var(--color-primary)'
  },
  { tag: t.processingInstruction, color: 'var(--color-accent)' }, // code fence markers
  { tag: t.string, color: 'var(--color-accent)' },

  // Links
  {
    tag: t.link,
    color: 'var(--color-primary)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px'
  },
  { tag: t.url, color: 'var(--color-text-tertiary)' },

  // Comments / metadata
  { tag: t.comment, color: 'var(--color-text-tertiary)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--color-text-tertiary)' },

  // Lists / markers
  { tag: t.list, color: 'var(--color-primary)' },
  { tag: t.quote, color: 'var(--color-text-secondary)', fontStyle: 'italic' },

  // Punctuation / operators
  { tag: t.punctuation, color: 'var(--color-text-tertiary)' },
  { tag: t.operator, color: 'var(--color-text-tertiary)' },
  { tag: t.keyword, color: '#8b5cf6' }, // purple for keywords in code

  // Numbers / booleans
  { tag: t.number, color: '#d97706' }, // amber for numbers
  { tag: t.bool, color: '#d97706' },

  // Inline code background (via mark, see theme below)
  // HTML / markup tags
  { tag: t.tagName, color: '#0891b2' },
  { tag: t.attributeName, color: '#65a30d' },
  { tag: t.attributeValue, color: 'var(--color-accent)' }
])

export const vaultDarkHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', color: '#e8e8ec', fontSize: '1.35em' },
  { tag: t.heading2, fontWeight: '700', color: '#e8e8ec', fontSize: '1.2em' },
  { tag: t.heading3, fontWeight: '600', color: '#e8e8ec', fontSize: '1.1em' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600', color: '#b0b0b4' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#7c7c80' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.88em', color: '#77b0f0' },
  { tag: t.processingInstruction, color: '#3db872' },
  { tag: t.string, color: '#3db872' },
  { tag: t.link, color: '#77b0f0', textDecoration: 'underline', textUnderlineOffset: '2px' },
  { tag: t.url, color: '#636366' },
  { tag: t.comment, color: '#636366', fontStyle: 'italic' },
  { tag: t.meta, color: '#636366' },
  { tag: t.list, color: '#77b0f0' },
  { tag: t.quote, color: '#b0b0b4', fontStyle: 'italic' },
  { tag: t.punctuation, color: '#636366' },
  { tag: t.operator, color: '#636366' },
  { tag: t.keyword, color: '#bf5af2' },
  { tag: t.number, color: '#ff9f0a' },
  { tag: t.bool, color: '#ff9f0a' },
  { tag: t.tagName, color: '#64d2ff' },
  { tag: t.attributeName, color: '#32d74b' },
  { tag: t.attributeValue, color: '#3db872' }
])

// ── Editor View Theme ──────────────────────────────────────────────────────────

export const vaultLightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      height: '100%'
    },
    '.cm-content': {
      caretColor: 'var(--color-primary)',
      padding: '0',
      fontFamily: 'var(--font-sans)',
      lineHeight: '1.8'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-primary)',
      borderLeftWidth: '2px'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--color-primary-20)'
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent'
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--color-primary-15)'
    },
    '.cm-line': {
      padding: '2px 0'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text-tertiary)',
      border: 'none',
      paddingRight: '8px',
      minWidth: '48px'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--color-text-tertiary)',
      paddingLeft: '16px'
    },
    '.cm-foldGutter': {
      color: 'var(--color-text-tertiary)'
    },
    '.cm-line.cm-foldPlaceholder': {
      backgroundColor: 'var(--color-primary-15)',
      border: '1px solid var(--color-primary-25)',
      color: 'var(--color-primary)',
      borderRadius: '4px',
      padding: '0 4px'
    },
    // Search match
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 213, 0, 0.3)',
      outline: '1px solid rgba(255, 213, 0, 0.6)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 213, 0, 0.5)'
    },
    // Matching brackets
    '.cm-matchingBracket': {
      backgroundColor: 'var(--color-primary-15)',
      outline: '1px solid var(--color-primary-40)',
      borderRadius: '2px'
    },
    // Scrollbar
    '.cm-scroller::-webkit-scrollbar': {
      width: '8px',
      height: '8px'
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      background: 'transparent'
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'var(--color-border)',
      borderRadius: '4px'
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: 'var(--color-border-hover)'
    },
    // Focus ring
    '&.cm-focused': {
      outline: 'none'
    }
  },
  { dark: false }
)

export const vaultDarkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-sans)',
      fontSize: '14px',
      height: '100%'
    },
    '.cm-content': {
      caretColor: 'var(--color-primary)',
      padding: '0',
      fontFamily: 'var(--font-sans)',
      lineHeight: '1.8'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-primary)',
      borderLeftWidth: '2px'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(85, 153, 232, 0.25)'
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent'
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(85, 153, 232, 0.15)'
    },
    '.cm-line': {
      padding: '2px 0'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-surface)',
      color: '#636366',
      border: 'none',
      paddingRight: '8px',
      minWidth: '48px'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: '#636366',
      paddingLeft: '16px'
    },
    '.cm-foldGutter': {
      color: '#636366'
    },
    '.cm-line.cm-foldPlaceholder': {
      backgroundColor: 'rgba(85, 153, 232, 0.15)',
      border: '1px solid rgba(85, 153, 232, 0.3)',
      color: '#77b0f0',
      borderRadius: '4px',
      padding: '0 4px'
    },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 159, 10, 0.25)',
      outline: '1px solid rgba(255, 159, 10, 0.5)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(255, 159, 10, 0.4)'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(85, 153, 232, 0.15)',
      outline: '1px solid rgba(85, 153, 232, 0.4)',
      borderRadius: '2px'
    },
    '.cm-scroller::-webkit-scrollbar': {
      width: '8px',
      height: '8px'
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      background: 'transparent'
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: '#3a3a3c',
      borderRadius: '4px'
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: '#4a4a4c'
    },
    '&.cm-focused': {
      outline: 'none'
    }
  },
  { dark: true }
)

// ── Theme Extension ────────────────────────────────────────────────────────────

/**
 * Vault Editor Theme Extension
 *
 * Usage:
 *   import { editorThemeExtension } from './editorTheme'
 *   // In useCodeMirror extensions:
 *   editorThemeExtension
 *
 * Combined: EditorView.theme (structure) + syntaxHighlighting (token colors)
 * Theme automatically switches based on document.documentElement.dataset.theme
 */
export function editorThemeExtension() {
  return [vaultLightTheme, syntaxHighlighting(vaultLightHighlight)]
}

export function editorDarkThemeExtension() {
  return [vaultDarkTheme, syntaxHighlighting(vaultDarkHighlight)]
}
