#!/usr/bin/env node
/**
 * fts_search.js — FTS5 全文搜索引擎
 *
 * 通过 bash 调用: node server/tools/fts_search.js "关键词" --topic 合同 --limit 5
 * 使用数据库层的 searchVault() — BM25 排序，<b>高亮</b>，返回元数据
 *
 * 晓园 Vault Agent 4 原子工具设计: bash 运行 vetted 脚本，不新增工具
 */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

// ── Parse args ──────────────────────────────────────────────────
const args = process.argv.slice(2)
let query = ''
let topic = ''
let limit = 5
let verbose = false

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--topic' || a === '-t') topic = args[++i] || ''
  else if (a === '--limit' || a === '-n') limit = parseInt(args[++i] || '5', 10) || 5
  else if (a === '--verbose' || a === '-v') verbose = true
  else if (a === '--help' || a === '-h') {
    console.log('fts_search — FTS5 全文搜索 _wiki/ 知识库')
    console.log('  用法: node server/tools/fts_search.js "关键词" [--topic 主题] [--limit N]')
    console.log('  示例: node server/tools/fts_search.js "合同 模板" --topic 合同管理 -n 5')
    process.exit(0)
  } else if (!query) query = a
}

if (!query) {
  console.log('fts_search: 请提供搜索关键词')
  console.log('  用法: node server/tools/fts_search.js "关键词"')
  process.exit(1)
}

// ── Find vault path ─────────────────────────────────────────────
// Walk up from script location to find .xiaoyuan/index.db
let vaultPath = ''
let currentDir = path.resolve(__dirname, '..', '..')
while (currentDir !== '/') {
  const dbPath = path.join(currentDir, '.xiaoyuan', 'index.db')
  if (fs.existsSync(dbPath)) {
    vaultPath = currentDir
    break
  }
  currentDir = path.dirname(currentDir)
}

// Fallback: try the vault path from environment or default location
if (!vaultPath) {
  vaultPath = process.env.VAULT_PATH || process.cwd()
}

const dbPath = path.join(vaultPath, '.xiaoyuan', 'index.db')
if (!fs.existsSync(dbPath)) {
  console.log('fts_search: 未找到搜索索引 — 请先在主窗口打开知识库')
  process.exit(1)
}

// ── Search ──────────────────────────────────────────────────────
const db = new Database(dbPath, { readonly: true })

try {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(t => `"${t}"`).join(' OR ')
  const pathFilter = topic ? `_wiki/${topic}/` : '_wiki/'

  const rows = db.prepare(`
    SELECT
      f.path,
      f.title,
      f.tags,
      f.frontmatter,
      snippet(files_fts, 1, '<b>', '</b>', '…', 40) AS snippet,
      bm25(files_fts, 1.0, 1.0, 3.0, 0.5, 0.5) AS rank
    FROM files_fts
    JOIN files f ON f.rowid = files_fts.rowid
    WHERE files_fts MATCH ?
      AND f.path LIKE ?
    ORDER BY rank
    LIMIT ?
  `).all(terms, `${pathFilter}%`, Math.min(limit, 10))

  if (rows.length === 0) {
    console.log(`未找到「${query}」相关结果。${topic ? '（限定 topic: ' + topic + '）' : ''}`)
    process.exit(0)
  }

  console.log(`## FTS5 搜索: 「${query}」${topic ? '（' + topic + '）' : ''}`)
  console.log(`找到 ${rows.length} 条结果\n`)

  for (const r of rows) {
    const parts = r.path.split('/')
    const topicName = parts.length > 2 && parts[0] === '_wiki' ? parts[1] : (parts[0] || '根目录')
    const score = r.rank > 0 ? ` | 相关度: ${Math.round(r.rank * 100) / 100}` : ''

    // Extract summary from frontmatter
    let summary = ''
    try {
      if (r.frontmatter) {
        const fm = JSON.parse(r.frontmatter)
        summary = fm.summary || ''
      }
    } catch { /* ignore */ }

    console.log(`### ${r.title || r.path.split('/').pop()?.replace(/\.md$/, '')} (${topicName})`)
    console.log(`路径: ${r.path}${score}`)
    if (summary) console.log(`摘要: ${summary}`)
    if (r.tags) console.log(`标签: ${r.tags}`)
    console.log('```')
    console.log((r.snippet || '(匹配内容)').replace(/<b>/g, '**').replace(/<\/b>/g, '**'))
    console.log('```')
    console.log('')
  }
} catch (err) {
  console.log(`fts_search 错误: ${err.message}`)
  process.exit(1)
} finally {
  db.close()
}
