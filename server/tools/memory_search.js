#!/usr/bin/env node
/**
 * memory_search.js — 记忆搜索引擎
 *
 * 通过 bash 调用: node server/tools/memory_search.js "关键词" [--days 7]
 * 搜索三层记忆: 对话摘要 + 增量记忆 + 工具调用日志
 *
 * 晓园 Vault Agent 4 原子工具设计: bash 运行 vetted 脚本，不新增工具
 */
const fs = require('fs')
const path = require('path')

// ── Parse args ──────────────────────────────────────────────────
const args = process.argv.slice(2)
let query = ''
let days = 7
let date = ''

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--days' || a === '-d') days = parseInt(args[++i] || '7', 10) || 7
  else if (a === '--date') date = args[++i] || ''
  else if (a === '--help' || a === '-h') {
    console.log('memory_search — 搜索 Agent 记忆存档')
    console.log('  用法: node server/tools/memory_search.js "关键词" [--days N] [--date YYYY-MM-DD]')
    console.log('  搜索: 对话摘要 + 增量记忆 + 工具调用日志')
    process.exit(0)
  } else if (!query) query = a
}

if (!query) {
  console.log('memory_search: 请提供搜索关键词')
  console.log('  用法: node server/tools/memory_search.js "关键词"')
  process.exit(1)
}

// ── Find vault path ─────────────────────────────────────────────
let currentDir = path.resolve(__dirname, '..', '..')
let vaultPath = ''
while (currentDir !== '/') {
  if (fs.existsSync(path.join(currentDir, '.xiaoyuan', 'index.db'))) {
    vaultPath = currentDir
    break
  }
  currentDir = path.dirname(currentDir)
}

if (!vaultPath) {
  vaultPath = process.env.VAULT_PATH || process.cwd()
}

const briefingDir = path.join(vaultPath, '_briefing')
if (!fs.existsSync(briefingDir)) {
  console.log('memory_search: 未找到记忆存档 — 还没有对话记录')
  process.exit(0)
}

// ── Generate date range ─────────────────────────────────────────
const dates = []
if (date) {
  dates.push(date)
} else {
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000)
    dates.push(d.toISOString().slice(0, 10))
  }
}

const q = query.toLowerCase()
const results = []

// ── Search 1: Conversation summaries ────────────────────────────
for (const d of dates) {
  const convDir = path.join(briefingDir, 'conversations', d)
  if (!fs.existsSync(convDir)) continue
  try {
    const files = fs.readdirSync(convDir).filter(f => f.startsWith('conv-')).sort()
    for (const file of files) {
      const raw = fs.readFileSync(path.join(convDir, file), 'utf-8')
      // Extract frontmatter
      let topic = '', title = '', decisions = [], nextSteps = []
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
      if (fmMatch) {
        const fm = fmMatch[1]
        const tMatch = fm.match(/^topic:\s*(.+)/m)
        if (tMatch) topic = tMatch[1].trim()
        const tiMatch = fm.match(/^title:\s*(.+)/m)
        if (tiMatch) title = tiMatch[1].trim()
      }
      // Extract decisions and next steps
      let section = ''
      for (const line of raw.split('\n')) {
        if (line.trim() === '## 关键决策') section = 'decisions'
        else if (line.trim() === '## 下一步') section = 'next'
        else if (line.startsWith('## ')) section = ''
        else if (section === 'decisions' && line.startsWith('- ')) decisions.push(line.slice(2).trim())
        else if (section === 'next' && line.startsWith('- ')) nextSteps.push(line.slice(2).trim())
      }

      const matched = []
      if (title.toLowerCase().includes(q)) matched.push(`标题: ${title}`)
      if (topic.toLowerCase().includes(q)) matched.push(`话题: ${topic}`)
      if (decisions.some(dd => dd.toLowerCase().includes(q))) matched.push(`决策: ${decisions.filter(dd => dd.toLowerCase().includes(q)).join('; ')}`)
      if (nextSteps.some(dd => dd.toLowerCase().includes(q))) matched.push(`下一步: ${nextSteps.filter(dd => dd.toLowerCase().includes(q)).join('; ')}`)

      if (matched.length > 0) {
        const time = fmMatch?.[1]?.match(/^time:\s*(.+)/m)?.[1] || ''
        results.push(`[${d} ${time}] ${title || file}（${topic}）\n  ${matched.join('\n  ')}`)
      }
    }
  } catch { /* skip */ }
}

// ── Search 2: Incremental memory facts ──────────────────────────
for (const d of dates) {
  const factFile = path.join(briefingDir, 'memory-facts', `${d}.md`)
  if (!fs.existsSync(factFile)) continue
  try {
    const raw = fs.readFileSync(factFile, 'utf-8')
    const facts = raw.split('\n')
      .filter(l => l.startsWith('- ['))
      .map(l => l.slice(l.indexOf('] ') + 2).trim())
      .filter(f => f.toLowerCase().includes(q))
    if (facts.length > 0) {
      results.push(`[${d}] 增量记忆:\n  ${facts.map(f => `- ${f}`).join('\n  ')}`)
    }
  } catch { /* skip */ }
}

// ── Search 3: Tool call logs ────────────────────────────────────
const toolLogPath = path.join(briefingDir, 'tool-calls.jsonl')
if (fs.existsSync(toolLogPath)) {
  try {
    const raw = fs.readFileSync(toolLogPath, 'utf-8')
    const cutoff = Date.now() - days * 86400000
    let count = 0
    for (const line of raw.trim().split('\n')) {
      if (count >= 5) break
      try {
        const entry = JSON.parse(line)
        const ts = Date.parse(entry.ts || '')
        if (ts < cutoff) continue
        const tool = (entry.tool || '').toLowerCase()
        const args = (entry.args || '').toLowerCase()
        const result = (entry.result || '').toLowerCase()
        if (tool.includes(q) || args.includes(q) || result.includes(q)) {
          const dur = entry.dur_ms ? ` (${entry.dur_ms}ms)` : ''
          const err = entry.error ? ' ❌' : ''
          results.push(`[${(entry.ts || '').slice(0, 16)}] ${entry.tool}${dur}${err}\n  ${(entry.args || '').slice(0, 120)}`)
          count++
        }
      } catch { continue }
    }
  } catch { /* skip */ }
}

// ── Output ──────────────────────────────────────────────────────
if (results.length === 0) {
  console.log(`未找到与「${query}」相关的记忆。`)
} else {
  console.log(`## 记忆搜索: 「${query}」\n`)
  console.log(results.join('\n'))
}
