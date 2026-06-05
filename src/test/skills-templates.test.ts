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

// ─── v1.6.x: Skill 模板 ↔ UI 接口对齐 ────────────────────────────
//
// 解决 v1.6 commit 留下的"模板跟面板渲染字段对不上"问题:
// - conversation-summary frontmatter 跟 MemoryPanel.ConversationSummary 字段脱节
// - lint 模板没 ## 输出格式 块, 分类跟 LintPanel stats 5 项对不上
//
// 验收:
// 1. conversation-summary frontmatter 5 字段 = MemoryPanel 期望
// 2. conversation-summary 3 个正文 section = briefing.ts 解析逻辑
// 3. lint 含 ## 输出格式 + 5 类汇总 (跟 LintPanel stats 字段一致)

describe('v1.6.x Skill 模板 ↔ UI 接口对齐', () => {
  describe('conversation-summary ↔ MemoryPanel', () => {
    const tpl = readFileSync(join(skillsDir, 'conversation-summary.md'), 'utf-8')
    // 提取 frontmatter 段 (两个 --- 之间)
    const fmMatch = tpl.match(/^---\n([\s\S]*?)\n---/m)

    it('包含 frontmatter 段 (--- ... --- 格式)', () => {
      expect(fmMatch).toBeTruthy()
    })

    it('frontmatter 5 字段对齐 MemoryPanel.ConversationSummary (date/time/title/topic/sources)', () => {
      const fm = fmMatch![1]
      // 5 个字段必须作为 YAML key 出现
      expect(fm).toMatch(/^date:/m)
      expect(fm).toMatch(/^time:/m)
      expect(fm).toMatch(/^title:/m)
      expect(fm).toMatch(/^topic:/m)
      expect(fm).toMatch(/^sources:/m)
    })

    it('frontmatter 移除已废弃的 participants/tags 字段 (v1.6.x 对齐)', () => {
      const fm = fmMatch![1]
      expect(fm).not.toMatch(/^participants:/m)
      expect(fm).not.toMatch(/^tags:/m)
    })

    it('正文 sections 对齐 briefing.ts 解析的 3 段', () => {
      // briefing.ts 解析: ## 关键决策 + ## 下一步 (从列表项)
      // 模板必须含这 2 段 + "## 讨论了什么" 段
      expect(tpl).toMatch(/## 讨论了什么/)
      expect(tpl).toMatch(/## 关键决策/)
      expect(tpl).toMatch(/## 下一步/)
    })

    it('frontmatter sources 替代旧名 relatedFiles (对齐 briefing.ts 实际字段)', () => {
      // 模板正文可以提到"relatedFiles (旧名)"做迁移说明, 但 frontmatter 必须用 sources
      const fm = fmMatch![1]
      expect(fm).toMatch(/^sources:/m)
      expect(fm).not.toMatch(/^relatedFiles:/m)
    })
  })

  describe('lint ↔ LintPanel', () => {
    const tpl = readFileSync(join(skillsDir, 'lint.md'), 'utf-8')

    it('包含 ## 输出格式 块 (v1.6 之前缺这个块, v1.6.x 补上)', () => {
      expect(tpl).toMatch(/## 输出格式/)
    })

    it('5 类汇总覆盖 LintPanel stats 全 5 项', () => {
      // LintPanel.ParsedLintReport.stats: totalWikiFiles, orphanPages, deadLinks, stalePages, contradictions
      expect(tpl).toMatch(/孤立页|orphanPages/)
      expect(tpl).toMatch(/死链|deadLinks/)
      expect(tpl).toMatch(/过期|stalePages/)
      expect(tpl).toMatch(/矛盾|contradictions/)
      expect(tpl).toMatch(/totalFiles|总文件数|总问题数/)
    })

    it('"字段缺失"已从 5 类移除 (LintPanel 不支持, 改到 log.md 标注)', () => {
      // 提取 ## 输出格式 块, 扫里面的 - 列表项, 不应有"字段缺失"作为分类
      const idx = tpl.indexOf('## 输出格式')
      expect(idx).toBeGreaterThanOrEqual(0)
      const rest = tpl.slice(idx + '## 输出格式'.length)
      const endIdx = rest.search(/\n## /)
      const block = endIdx >= 0 ? rest.slice(0, endIdx) : rest
      const listItems = block.split('\n').filter(l => l.match(/^\s*-\s+\S/))
      const categoryNames = listItems
        .map(l => l.match(/^[\s-]+([^(（\s]+)/)?.[1]?.trim())
        .filter(Boolean) as string[]
      // 字段缺失不应作为分类名出现
      expect(categoryNames).not.toContain('字段缺失')
    })

    it('输出格式块说明每个分类的颜色 (redLinks=orange, orphanPages=tertiary, stalePages=gray)', () => {
      // 表格里要给出 LintPanel 渲染颜色
      // 注意：不能用 `## 块提取` (yaml 块里的 ## 文件总数 会误匹)
      // 改为在 tpl 整体里查找, 配合"## 输出格式 存在"测试 (前者已验证)
      expect(tpl).toMatch(/orange/)
      expect(tpl).toMatch(/gray|grey/)
    })
  })
})
