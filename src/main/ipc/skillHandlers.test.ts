import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm, readFile, readdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { isValidSkillName } from './skillHandlers'

const TEST_DIR = join(__dirname, '../../test-tmp-skill')

describe('skillHandlers — user Skill CRUD (v1.4)', () => {
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
