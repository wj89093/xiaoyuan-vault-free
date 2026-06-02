import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm, readFile, readdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { readEndpoint, writeEndpoint, isValidSkillName, BUILTIN_TEMPLATES } from './skillHandlers'

const TEST_DIR = join(__dirname, '../../test-tmp-skill')

describe('skillHandlers — endpoint storage', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('returns default when no file', async () => {
    const ep = await readEndpoint(TEST_DIR)
    expect(ep.url).toBe('http://127.0.0.1:18789')
    expect(ep.protocol).toBe('http')
    expect(ep.note).toBe('')
    expect(ep.updatedAt).toBe(0)
  })

  it('writes then reads back', async () => {
    const ok = await writeEndpoint(TEST_DIR, {
      url: 'http://example.com:9999',
      protocol: 'http',
      note: 'my agent'
    })
    expect(ok).toBe(true)

    const ep = await readEndpoint(TEST_DIR)
    expect(ep.url).toBe('http://example.com:9999')
    expect(ep.protocol).toBe('http')
    expect(ep.note).toBe('my agent')
    expect(ep.updatedAt).toBeGreaterThan(0)
  })

  it('partial write fills defaults', async () => {
    await writeEndpoint(TEST_DIR, { url: 'http://partial.test' })
    const ep = await readEndpoint(TEST_DIR)
    expect(ep.url).toBe('http://partial.test')
    expect(ep.protocol).toBe('http') // default
    expect(ep.note).toBe('') // default
  })

  it('handles corrupted JSON by returning default', async () => {
    await writeFile(join(TEST_DIR, 'skill-endpoint.json'), 'not json{', 'utf-8')
    const ep = await readEndpoint(TEST_DIR)
    expect(ep.url).toBe('http://127.0.0.1:18789')
  })

  it('roundtrip with different protocol values', async () => {
    for (const p of ['http', 'ws', 'skill'] as const) {
      await writeEndpoint(TEST_DIR, { url: `http://test.${p}`, protocol: p })
      const ep = await readEndpoint(TEST_DIR)
      expect(ep.protocol).toBe(p)
    }
  })
})

describe('skillHandlers — isValidSkillName', () => {
  it('accepts alphanumeric', () => {
    expect(isValidSkillName('ingest')).toBe(true)
    expect(isValidSkillName('my-skill-2')).toBe(true)
    expect(isValidSkillName('My_Skill_v3')).toBe(true)
  })

  it('rejects invalid names', () => {
    expect(isValidSkillName('')).toBe(false)
    expect(isValidSkillName('../etc/passwd')).toBe(false)
    expect(isValidSkillName('has space')).toBe(false)
    expect(isValidSkillName('has/slash')).toBe(false)
    expect(isValidSkillName('has\\backslash')).toBe(false)
    expect(isValidSkillName('has.dot')).toBe(false)
  })
})

describe('skillHandlers — BUILTIN_TEMPLATES', () => {
  it('has 8 templates', () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(8)
  })

  it('all template files exist on disk', () => {
    const templatesDir = join(__dirname, '..', '..', '..', 'src', 'main', 'templates', 'skills')
    for (const t of BUILTIN_TEMPLATES) {
      const path = join(templatesDir, t.filename)
      expect(existsSync(path), `template ${t.name} should exist at ${path}`).toBe(true)
    }
  })

  it('all templates have required frontmatter fields', async () => {
    const templatesDir = join(__dirname, '..', '..', '..', 'src', 'main', 'templates', 'skills')
    for (const t of BUILTIN_TEMPLATES) {
      const content = await readFile(join(templatesDir, t.filename), 'utf-8')
      expect(content).toMatch(/^---\n/)
      expect(content).toMatch(/^name: \S+/m)
      expect(content).toMatch(/^triggers:/m)
    }
  })

  it('has unique template names', () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('skillHandlers — skill CRUD via filesystem', () => {
  let skillsDir: string

  beforeEach(async () => {
    skillsDir = join(TEST_DIR, 'skills')
    await mkdir(skillsDir, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('lists .md files in skills dir', async () => {
    await writeFile(join(skillsDir, 'my-note.md'), '# My note', 'utf-8')
    await writeFile(join(skillsDir, 'other.md'), '# Other', 'utf-8')
    await writeFile(join(skillsDir, 'ignore.txt'), 'not markdown', 'utf-8')
    const files = await readdir(skillsDir)
    const md = files.filter((f) => f.endsWith('.md'))
    expect(md).toContain('my-note.md')
    expect(md).toContain('other.md')
    expect(md).not.toContain('ignore.txt')
  })

  it('validates skill name before saving', () => {
    // Re-implement save logic to test validation
    const save = (name: string) => {
      if (!isValidSkillName(name)) throw new Error('Invalid name')
      return true
    }
    expect(() => save('good-name')).not.toThrow()
    expect(() => save('bad/name')).toThrow()
    expect(() => save('..')).toThrow()
  })
})
