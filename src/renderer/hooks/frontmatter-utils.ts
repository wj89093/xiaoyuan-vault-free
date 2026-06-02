/**
 * frontmatter-utils.ts — Frontmatter field type detection & form helpers
 *
 * Noteriv-inspired: type-aware frontmatter editing
 * - Auto-detect field types (string, number, date, boolean, array, enum)
 * - Common property schemas (status, priority, etc.)
 * - Serialization helpers
 */
import yaml from 'js-yaml'

// ── Field Types ─────────────────────────────────────────────────────────

export type FrontmatterFieldType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'tags'
  | 'enum'
  | 'complex'

export interface FrontmatterFieldSchema {
  key: string
  label: string
  type: FrontmatterFieldType
  options?: string[] // for enum type
  placeholder?: string
  hint?: string
}

export interface ParsedField {
  key: string
  value: unknown
  raw: string
  type: FrontmatterFieldType
  isList?: boolean
  items?: string[]
  options?: string[]
  /** Raw YAML block (key + indented continuation lines) for complex fields that the form can't edit */
  rawYaml?: string
}

// ── Known Field Schemas ────────────────────────────────────────────────

/** Fields that have known types and options */
const KNOWN_SCHEMAS: Record<string, FrontmatterFieldSchema> = {
  status: {
    key: 'status',
    label: 'Status',
    type: 'enum',
    options: ['draft', 'published', 'archived', 'review']
  },
  priority: {
    key: 'priority',
    label: 'Priority',
    type: 'enum',
    options: ['low', 'medium', 'high', 'urgent']
  },
  category: {
    key: 'category',
    label: 'Category',
    type: 'enum',
    options: ['note', 'project', 'daily', 'meeting', 'reference']
  },
  type: {
    key: 'type',
    label: 'Type',
    type: 'enum',
    options: ['note', 'article', 'daily', 'template']
  },
  draft: { key: 'draft', label: 'Draft', type: 'boolean' },
  published: { key: 'published', label: 'Published', type: 'boolean' },
  tags: { key: 'tags', label: 'Tags', type: 'tags' },
  date: { key: 'date', label: 'Date', type: 'date', placeholder: 'YYYY-MM-DD' },
  created: { key: 'created', label: 'Created', type: 'date', placeholder: 'YYYY-MM-DD' },
  updated: { key: 'updated', label: 'Updated', type: 'date', placeholder: 'YYYY-MM-DD' },
  due: { key: 'due', label: 'Due', type: 'date', placeholder: 'YYYY-MM-DD' },
  recurring: {
    key: 'recurring',
    label: 'Recurring',
    type: 'enum',
    options: ['daily', 'weekly', 'monthly', 'yearly']
  },
  weight: { key: 'weight', label: 'Weight', type: 'number', placeholder: '0' },
  order: { key: 'order', label: 'Order', type: 'number', placeholder: '0' },
  author: { key: 'author', label: 'Author', type: 'string' },
  project: { key: 'project', label: 'Project', type: 'string' },
  title: { key: 'title', label: 'Title', type: 'string' },
  summary: { key: 'summary', label: 'Summary', type: 'string' }
}

// ── Field Schema Lookup ─────────────────────────────────────────────────

export function getFieldSchema(key: string): FrontmatterFieldSchema | null {
  return KNOWN_SCHEMAS[key] ?? null
}

// ── Type Detection ──────────────────────────────────────────────────────

export function detectFieldType(key: string, value: unknown): FrontmatterFieldType {
  // Check known schema first
  const schema = KNOWN_SCHEMAS[key]
  if (schema) return schema.type

  // Auto-detect from value
  if (value === true || value === false) return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) {
    // Object arrays (e.g. relationships, openThreads) are too complex for tag editing
    if (value.some((v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v))) {
      return 'complex'
    }
    return 'tags'
  }
  // Nested objects that aren't arrays are also complex
  if (typeof value === 'object' && value !== null) return 'complex'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
    if (/^(true|false|yes|no)$/i.test(value.trim())) return 'boolean'
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) return 'number'
  }
  return 'string'
}

// ── Parsing ─────────────────────────────────────────────────────────────

export interface FrontmatterMatch {
  from: number
  to: number
  raw: string
  fields: ParsedField[]
}

// ── Raw YAML extraction for complex fields ───────────────────────────

/** Extract the raw YAML block (key line + indented continuation) for a field */
function extractRawYamlBlock(rawFm: string, key: string): string {
  const keyLineRe = new RegExp(`^${escapeRegex(key)}:`, 'm')
  const match = rawFm.match(keyLineRe)
  if (match?.index === undefined) return `${key}: ""`

  const rest = rawFm.slice(match.index)
  const lines = rest.split('\n')
  const result: string[] = []

  // Key line (may have inline value or be followed by indented blocks)
  result.push(lines[0])

  // Collect indented continuation lines
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue // skip empty lines inside block
    if (/^\s/.test(lines[i])) {
      result.push(lines[i])
    } else {
      break // next top-level key
    }
  }

  return result.join('\n')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Main parser ────────────────────────────────────────────────────────

export function parseFrontmatter(raw: string): ParsedField[] {
  const fm = raw
    .replace(/^---\n/, '')
    .replace(/\n---\s*$/, '')
    .trim()
  if (!fm) return []

  try {
    const parsed = yaml.load(fm)
    if (!parsed || typeof parsed !== 'object') return []
    return Object.entries(parsed).map(([key, value]) => {
      const type = detectFieldType(key, value)
      const schema = getFieldSchema(key)

      if (type === 'complex') {
        return {
          key,
          value: null,
          raw: key,
          type: 'complex',
          rawYaml: extractRawYamlBlock(fm, key)
        }
      }

      if (Array.isArray(value)) {
        return {
          key,
          value: value.join(', '),
          raw: key,
          type: 'tags',
          isList: true,
          items: value.map(String),
          options: schema?.options
        }
      }
      return {
        key,
        value: type === 'boolean' ? Boolean(value) : String(value ?? ''),
        raw: key,
        type,
        options: schema?.options
      }
    })
  } catch {
    // fallback handled by caller
  }

  // Fallback: simple line parser
  const fields: ParsedField[] = []
  const lines = fm.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^---\s*$/.test(line)) {
      i++
      continue
    }
    const ci = line.indexOf(':')
    if (ci === -1) {
      i++
      continue
    }
    const key = line.slice(0, ci).trim()
    let val = line.slice(ci + 1).trim()
    // Remove quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (val === '' && i + 1 < lines.length && /^\s+-/.test(lines[i + 1])) {
      const items: string[] = []
      let j = i + 1
      while (j < lines.length && lines[j].trim().startsWith('-'))
        items.push(lines[j++].replace(/^\s*-\s*/, '').trim())
      fields.push({ key, value: items.join(', '), raw: line, type: 'tags', isList: true, items })
      i = j
    } else {
      const type = detectFieldType(key, val)
      fields.push({
        key,
        value: type === 'boolean' ? Boolean(val) : val,
        raw: line,
        type
      })
      i++
    }
  }
  return fields
}

// ── Serialization ───────────────────────────────────────────────────────

export function serializeFrontmatter(title: string, fields: ParsedField[]): string {
  const lines: string[] = ['---']
  if (title) {
    const needsQuote = /[:"{}[\]&*#?|<>!%@`]/.test(title)
    lines.push(needsQuote ? `title: "${title}"` : `title: ${title}`)
  }
  for (const f of fields) {
    if (f.key === 'title') continue

    // Complex fields: emit raw YAML unchanged (security: prevent corruption)
    if (f.type === 'complex') {
      if (f.rawYaml) lines.push(f.rawYaml)
      continue
    }

    if (f.isList && f.items?.length) {
      lines.push(`${f.key}:`)
      for (const item of f.items) lines.push(`  - ${item}`)
    } else if (f.type === 'boolean') {
      lines.push(`${f.key}: ${f.value}`)
    } else if (f.type === 'number') {
      lines.push(`${f.key}: ${f.value}`)
    } else {
      const val = String(f.value ?? '')
      const needsQuote = /[:"{}[\]&*#?|<>!%@`]/.test(val) || val.includes('\n')
      lines.push(needsQuote ? `${f.key}: "${val}"` : `${f.key}: ${val}`)
    }
  }
  lines.push('---')
  return lines.join('\n') + '\n'
}

// ── Common property keys for autocomplete ──────────────────────────────

export const COMMON_PROPERTIES = Object.keys(KNOWN_SCHEMAS)
