import type { Frontmatter } from './types'

/**
 * Parse YAML frontmatter from Markdown content
 */
export function parseFrontmatter(content: string): { frontmatter: Frontmatter; content: string } {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/)
  if (!m) return { frontmatter: {}, content }

  const raw = m[1]
  const body = content.slice(m[0].length)
  const fm: Frontmatter = {}
  const lines = raw.split('\n')

  let currentKey = ''
  let currentArray: string[] = []
  let inArray = false

  for (const line of lines) {
    // Multi-line array (continuation)
    if (inArray) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        currentArray.push(
          trimmed
            .slice(2)
            .trim()
            .replace(/^['"]|['"]$/g, '')
        )
        continue
      } else {
        setValue(fm, currentKey, currentArray)
        currentArray = []
        inArray = false
      }
    }

    const kv = line.match(/^(\w+):\s*(.*)/)
    if (!kv) continue

    currentKey = kv[1]
    let value: string = kv[2].trim()

    // Empty value → start of multi-line array
    if (value === '') {
      currentArray = []
      inArray = true
      continue
    }

    // Remove surrounding quotes
    value = value.replace(/^['"]|['"]$/g, '')

    // Type coercion
    if (value === 'true') setValue(fm, currentKey, true)
    else if (value === 'false') setValue(fm, currentKey, false)
    else if (/^\d+$/.test(value)) setValue(fm, currentKey, parseInt(value, 10))
    else if (/^\d+\.\d+$/.test(value)) setValue(fm, currentKey, parseFloat(value))
    else if (value.startsWith('[') && value.endsWith(']')) {
      // Inline array: [tag1, tag2, tag3]
      const arr = value
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      setValue(fm, currentKey, arr)
    } else {
      setValue(fm, currentKey, value)
    }
  }

  // Flush remaining array if YAML ended while in array
  if (inArray && currentArray.length > 0) {
    setValue(fm, currentKey, currentArray)
  }

  return { frontmatter: fm, content: body }
}

function setValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  // Dot-notation: 'nested.key'
  if (key.includes('.')) {
    const parts = key.split('.')
    let current = obj
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] ??= {}
      current = current[parts[i]] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  } else {
    obj[key] = value
  }
}

/**
 * Serialize frontmatter object to YAML string
 */
export function stringifyFrontmatter(frontmatter: Frontmatter): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - "${String(item)}"`)
      }
    } else if (typeof value === 'object' && value !== null) {
      // Skip nested objects for now (or serialize flat)
      continue
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }
  return lines.join('\n')
}

/**
 * Apply new frontmatter to markdown content, replacing existing
 */
export function applyFrontmatter(content: string, frontmatter: Frontmatter): string {
  const { content: body } = parseFrontmatter(content)
  const yaml = stringifyFrontmatter(frontmatter)
  if (!yaml.trim()) return body
  return `---\n${yaml}\n---\n\n${body}`
}

/**
 * Extract display title from content (first heading or frontmatter title)
 */
export function extractDisplayTitle(content: string, filename?: string): string {
  const { frontmatter } = parseFrontmatter(content)
  if (frontmatter.title) return frontmatter.title

  // First H1 heading
  const h1 = content.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim()

  // First H2 heading
  const h2 = content.match(/^##\s+(.+)/m)
  if (h2) return h2[1].trim()

  return filename?.replace(/\.md$/, '') ?? 'Untitled'
}
