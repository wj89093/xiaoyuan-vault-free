/**
 * skills-templates.test.ts — 覆盖 v1.6 9 个 Skill 模板注入
 *
 * 验证:
 *   1. templates/skills/ 存在 9 个 .md 文件 (一个对一个 Skill)
 *   2. skillHandlers 注入层: loadDefault 拼 9 个 skill + capabilities
 *   3. vaultHandlers.writeSkillTemplates 递归拷贝 skills/ 到 vault 根
 *   4. AGENTS.md 9 个 Skill 名都引用
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const skillsDir = join(process.cwd(), 'src/main/templates/skills')
const skillHandlers = readFileSync(join(process.cwd(), 'src/main/ipc/skillHandlers.ts'), 'utf-8')
const vaultHandlers = readFileSync(join(process.cwd(), 'src/main/ipc/vaultHandlers.ts'), 'utf-8')
const agents = readFileSync(join(process.cwd(), 'src/main/templates/Agents.md'), 'utf-8')

const expectedSkills = [
  'ingest',
  'query',
  'lint',
  'write',
  'stats',
  'list-sessions',
  'log',
  'ingest-batch',
  'conversation-summary'
]

describe('v1.6 9 个 Skill 模板存在', () => {
  it('templates/skills/ 目录存在', () => {
    expect(existsSync(skillsDir)).toBe(true)
  })

  it('总 9 个 skill 模板 (不多不少)', () => {
    const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'))
    expect(files.length).toBe(9)
    for (const f of files) {
      expect(expectedSkills).toContain(f.replace(/\.md$/, ''))
    }
  })

  expectedSkills.forEach((name) => {
    it(`${name}.md 非空 + 包含 # Skill / 触发条件 / 执行流程 头`, () => {
      const path = join(skillsDir, `${name}.md`)
      expect(existsSync(path)).toBe(true)
      const content = readFileSync(path, 'utf-8')
      expect(content.length).toBeGreaterThan(50)
      expect(content).toMatch(/^# Skill/)
      expect(content).toMatch(/## 触发条件/)
      expect(content).toMatch(/## 执行流程/)
    })
  })
})

describe('v1.6 注入层 (skill:loadDefault)', () => {
  it('拼 skills/ 整个目录 (readdirSync + .md filter)', () => {
    expect(skillHandlers).toContain("skillsDir")
    expect(skillHandlers).toContain("readdirSync")
    expect(skillHandlers).toMatch(/f\.endsWith\(['"]\.md['"]\)/)
  })

  it('拼 MARKDOWN_CAPABILITIES.md (v1.5 已有)', () => {
    expect(skillHandlers).toContain("capsPath")
    expect(skillHandlers).toContain("MARKDOWN_CAPABILITIES.md")
  })

  it('多个注入用 --- 分隔', () => {
    // 实际代码: injectedParts.join('\n\n---\n\n')
    expect(skillHandlers).toContain("injectedParts.join('\\n\\n---\\n\\n')")
  })

  it('静默失败: skills/ 不存在时不影响主流程 (用 existsSync guard)', () => {
    expect(skillHandlers).toMatch(/if\s*\(\s*existsSync\(skillsDir\)/)
  })
})

describe('v1.6 writeSkillTemplates (vault 创建时递归拷贝)', () => {
  it('vaultHandlers 加 writeSkillTemplates 函数', () => {
    expect(vaultHandlers).toContain("async function writeSkillTemplates(")
  })

  it('递归拷贝 skills/ 整个目录到 vault 根', () => {
    expect(vaultHandlers).toContain("readdir(srcDir)")
    expect(vaultHandlers).toMatch(/f\.endsWith\(['"]\.md['"]\)/)
  })

  it('createVaultAtPath 调 writeSkillTemplates', () => {
    expect(vaultHandlers).toContain("await writeSkillTemplates(vaultPath)")
  })
})

describe('v1.6 AGENTS.md 触发词 ↔ 模板名对应', () => {
  it('AGENTS.md 9 个 Skill 名都引用 (排除 ingest-batch 子串误匹)', () => {
    for (const name of expectedSkills) {
      // 索引行格式: | `name` | 触发 | 自动? |
      // 加 | 排除 ingest 匹中 ingest-batch
      const re = new RegExp('`' + name + '`\\s*\\|')
      expect(agents).toMatch(re)
    }
  })
})
