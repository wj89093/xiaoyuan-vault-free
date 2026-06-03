/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import log from 'electron-log/main'
import { readFile, readdir } from 'fs/promises'
import { basename, join } from 'path'
import { callAI } from '../ai/aiService'
import { getVaultPath } from '../database/database'
import { searchFiles } from '../search/search'
import { parseFrontmatter } from '../frontmatter/index'
import { loadGraph } from '../graph/graph'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

export interface QueryResult {
  question: string
  answer: string
  sources: { path: string; title: string; snippet: string }[]
}

// ─── Query: search + AI synthesize ────────────────────────────────────

export async function queryVault(question: string): Promise<QueryResult> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    return { question, answer: '未打开知识库', sources: [] }
  }

  try {
    // ── Step 0: Wiki-first search ──────────────────────────────────
    // Read _wiki/index.md to understand available topics, then search matching topic dirs
    const wikiDir = join(vaultPath, '_wiki')
    const wikiContexts: {
      path: string
      title: string
      content: string
      summary?: string
      tags?: string[]
      relationships?: string[]
      type?: string
    }[] = []

    try {
      const indexPath = join(wikiDir, 'index.md')
      const indexContent = await readFile(indexPath, 'utf-8').catch(() => '')
      if (indexContent) {
        // Extract topic names from index.md (## headers)
        const topicMatches = indexContent.match(/^##\s+(.+)/gm) ?? []
        const topics = topicMatches.map((m) => m.replace(/^##\s+/, '').trim())

        // Search each topic directory for relevant pages
        for (const topic of topics.slice(0, 5)) {
          try {
            const topicDir = join(wikiDir, topic)
            const files = await readdir(topicDir)
            const mdFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('Lint报告'))

            for (const file of mdFiles.slice(0, 6)) {
              try {
                const filePath = join(topicDir, file)
                const raw = await readFile(filePath, 'utf-8')
                const { frontmatter, content: body } = parseFrontmatter(raw)
                const fileText = `${frontmatter.title ?? ''} ${body}`.toLowerCase()
                const questionLower = question.toLowerCase()

                // Simple relevance: title/body contains question keywords
                if (
                  fileText.includes(questionLower) ||
                  questionLower
                    .split(' ')
                    .filter((w) => w.length > 2)
                    .every((w) => fileText.includes(w))
                ) {
                  const displayContent = frontmatter.summary
                    ? `${frontmatter.summary}\n\n${body.slice(0, 800)}`
                    : body.slice(0, 2000)
                  const rels: string[] = Array.isArray(frontmatter.relationships)
                    ? frontmatter.relationships.map((r) => `${r.type}: ${r.target}`)
                    : []
                  wikiContexts.push({
                    path: filePath,
                    title: frontmatter.title ?? file.replace('.md', ''),
                    content: displayContent,
                    summary: frontmatter.summary,
                    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
                    relationships: rels.length > 0 ? rels : undefined,
                    type: frontmatter.type
                  })
                }
              } catch {
                /* skip individual file errors */
              }
            }
          } catch {
            /* skip topic dir errors */
          }
        }
      }
    } catch {
      /* index.md not available */
    }

    // ── Step 1: FTS5 search ───────────────────────────────────────
    const searchResults = await searchFiles(question)
    if (searchResults.length === 0 && wikiContexts.length === 0) {
      return { question, answer: '知识库中没有找到相关内容', sources: [] }
    }

    // ── Step 2: Merge wiki + FTS5 results (dedupe by path) ───────
    const seenPaths = new Set<string>()
    const allContexts: typeof wikiContexts = []

    // Wiki results first (higher quality, AI-curated)
    for (const ctx of wikiContexts) {
      if (!seenPaths.has(ctx.path)) {
        seenPaths.add(ctx.path)
        allContexts.push(ctx)
      }
    }

    // FTS5 results next
    const topFiles = searchResults.slice(0, 5)
    for (const file of topFiles) {
      if (!seenPaths.has(file.path)) {
        seenPaths.add(file.path)
        try {
          const raw = await readFile(file.path, 'utf-8')
          const { frontmatter, content: body } = parseFrontmatter(raw)
          const displayContent = frontmatter.summary
            ? `${frontmatter.summary}\n\n${body.slice(0, 800)}`
            : body.slice(0, 2000)
          const rels: string[] = Array.isArray(frontmatter.relationships)
            ? frontmatter.relationships.map((r) => `${r.type}: ${r.target}`)
            : []
          allContexts.push({
            path: file.path,
            title: frontmatter.title ?? file.title ?? file.name,
            content: displayContent,
            summary: frontmatter.summary,
            tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : undefined,
            relationships: rels.length > 0 ? rels : undefined,
            type: frontmatter.type
          })
        } catch {
          /* skip unreadable files */
        }
      }
    }

    // Step 3: Optionally expand via typed-link relationships
    const relatedFiles: { path: string; title: string; content: string }[] = []
    try {
      const graph = await loadGraph()
      if (graph) {
        for (const ctx of allContexts) {
          // Find nodes that link to or are linked from the current file
          const related = graph.edges
            .filter(
              (e) => (e.source === ctx.path || e.target === ctx.path) && e.relation === 'typed_link'
            )
            .map((e) => (e.source === ctx.path ? e.target : e.source))
            .filter((p) => p !== ctx.path)
            .slice(0, 3)
          for (const relPath of related) {
            try {
              const relRaw = await readFile(relPath, 'utf-8')
              const { frontmatter: relFm, content: relBody } = parseFrontmatter(relRaw)
              relatedFiles.push({
                path: relPath,
                title: relFm.title ?? basename(relPath, '.md'),
                content: relFm.summary
                  ? `${relFm.summary}\n\n${relBody.slice(0, 500)}`
                  : relBody.slice(0, 800)
              })
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch {
      /* graph not available */
    }

    // Step 4: Build RAG context — structured frontmatter first, then body
    const contextText = allContexts
      .map((c) => {
        const meta: string[] = []
        if (c.type) meta.push(`类型：${c.type}`)
        if (c.tags?.length) meta.push(`标签：${c.tags.join(', ')}`)
        if (c.summary) meta.push(`摘要：${c.summary}`)
        if (c.relationships?.length) meta.push(`关系：${c.relationships.join('；')}`)
        const metaStr =
          meta.length > 0
            ? `【${c.title}】(${c.path})\n${meta.join('\n')}\n\n正文：${c.content}`
            : `【${c.title}】(${c.path})\n${c.content}`
        return metaStr
      })
      .join('\n\n---\n\n')

    const relContextText =
      relatedFiles.length > 0
        ? `\n\n---\n\n【相关页面（通过关系网络扩展）】\n` +
          relatedFiles.map((r) => `【${r.title}】\n${r.content.slice(0, 500)}`).join('\n\n')
        : ''

    // Step 5: AI synthesize answer
    const prompt = `你是晓园知识库的查询助手。基于以下知识库内容回答用户问题。
知识库内容：
${contextText}${relContextText}

用户问题：${question}

要求：
1. 优先使用【摘要】和【关系】回答，这些是 AI 已整理的结构化信息
2. 引用来源时使用格式：[[页面标题]]
3. 如果知识库内容不足以回答，明确说明
4. 回答简洁，直接给出结论

回答：`

    const answer = (await callAI('reason', { question: prompt, context: [] })) as string

    // Step 6: Build source list
    const sources = allContexts.map((c) => ({
      path: c.path,
      title: c.title,
      snippet: c.content.slice(0, 100) + '...'
    }))

    return {
      question,
      answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
      sources
    }
  } catch (err) {
    log.error('[Query] failed:', (err as any).message)
    return { question, answer: `查询失败: ${(err as any).message}`, sources: [] }
  }
}
