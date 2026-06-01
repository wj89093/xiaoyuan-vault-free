import type { Frontmatter } from './types'

/**
 * Generate a file template with frontmatter based on type
 */
export function generateFileTemplate(title: string, type?: string): string {
  const now = new Date().toISOString().slice(0, 10)
  const fm: Frontmatter = {
    title,
    type: type ?? 'note',
    created: now,
    updated: now,
    tags: [],
  }

  // Override type for specific types
  if (type === 'meeting') fm.status = 'active'

  const yaml = stringifyTemplateFrontmatter(fm)
  const sections = [
    '',
    '## 基本信息',
    '',
    '',
    '## Open Threads',
    '',
    '- [ ] ',
    '',
    '## See Also',
    '',
  ]
  return `---\n${yaml}\n---\n\n# ${title}\n${sections.join('\n')}`
}

function stringifyTemplateFrontmatter(fm: Frontmatter): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
      } else {
        lines.push(`${key}:`)
        for (const item of value) {
          lines.push(`  - "${String(item)}"`)
        }
      }
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }
  return lines.join('\n')
}

/**
 * Update the updated field in frontmatter
 */
export function touchFrontmatter(frontmatter: Frontmatter): Frontmatter {
  return {
    ...frontmatter,
    updated: new Date().toISOString().slice(0, 10),
  }
}
