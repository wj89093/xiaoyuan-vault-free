import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { composeTopicFile, parseTopicFile } from './briefing'

// ─── v1.7 (P1-2): topic 跨 session 累积 — 纯函数测试 ──────────────────

describe('v1.7 (P1-2) composeTopicFile — 纯函数', () => {
  const baseParams = {
    title: 'ABC 合同评审',
    topic: '合同管理',
    decisions: ['选 ABC 律所', '首付款 30%'],
    relatedFiles: ['_wiki/合同/ABC.md'],
    nextSteps: ['下周一签合同'],
    discussion: '讨论了律所选择'
  }

  it('existingContent=null → 新建首个文件 (frontmatter + 1 section)', () => {
    const r = composeTopicFile(null, baseParams, '2026-06-01', '14:30')
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0]).toEqual({
      date: '2026-06-01',
      time: '14:30',
      title: 'ABC 合同评审'
    })
    expect(r.decisions).toEqual(['选 ABC 律所', '首付款 30%'])
    expect(r.nextSteps).toEqual(['下周一签合同'])
    expect(r.content).toContain('topic: 合同管理')
    expect(r.content).toContain('updated_at: 2026-06-01')
    expect(r.content).toContain('- date: 2026-06-01')
    expect(r.content).toContain('  - 选 ABC 律所')
    expect(r.content).toContain('### 讨论了什么')
  })

  it('existingContent 有内容 → append + 累计索引 (entries/decisions/nextSteps)', () => {
    const r1 = composeTopicFile(null, baseParams, '2026-06-01', '14:30')
    const r2 = composeTopicFile(r1.content, baseParams, '2026-06-03', '09:15')

    expect(r2.entries).toHaveLength(2)
    expect(r2.entries[0]).toEqual({
      date: '2026-06-03',
      time: '09:15',
      title: 'ABC 合同评审' // 最新在前
    })
    expect(r2.entries[1]).toEqual({
      date: '2026-06-01',
      time: '14:30',
      title: 'ABC 合同评审'
    })
    // decisions/nextSteps 跨日累计 (mergeUnique 去重, 同样内容跨日只保留一次)
    // baseParams 跨日调用同样, 所以去重后 decisions=2, nextSteps=1
    expect(r2.decisions).toHaveLength(2)
    expect(r2.nextSteps).toHaveLength(1)
    // 内容: frontmatter + 2 sections 用 --- 分隔
    expect(r2.content).toContain('2026-06-03 09:15 — ABC 合同评审')
    expect(r2.content).toContain('2026-06-01 14:30 — ABC 合同评审')
  })

  it('相同 decisions 去重 (跨日重复提及)', () => {
    const r1 = composeTopicFile(null, baseParams, '2026-06-01', '14:30')
    const r2 = composeTopicFile(r1.content, baseParams, '2026-06-03', '09:15')
    expect(r2.decisions).toHaveLength(2) // 重复的 2 个只保留一次
  })

  it('空 topic 文件 frontmatter 解析返空 (防御)', () => {
    const r = parseTopicFile('not a frontmatter file')
    expect(r.entries).toEqual([])
    expect(r.decisions).toEqual([])
    expect(r.nextSteps).toEqual([])
  })

  it('parseTopicFile 解析 frontmatter 返 entries + 累计 décisions/nextSteps', () => {
    const r1 = composeTopicFile(null, baseParams, '2026-06-01', '14:30')
    const r2 = composeTopicFile(r1.content, baseParams, '2026-06-03', '09:15')
    const parsed = parseTopicFile(r2.content)
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.decisions.length).toBeGreaterThanOrEqual(2)
    expect(parsed.nextSteps.length).toBeGreaterThanOrEqual(1)
  })
})
