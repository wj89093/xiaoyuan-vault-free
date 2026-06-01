/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
/**
 * Agent tool registry — 自研 Agent Loop 工具接口
 *
 * TOOL_DEFS = 4 atomic tools only.
 * All higher-level operations (writeWiki / triggerLint / appendWikiLog / etc.)
 * are defined as WORKFLOWS in Agents.md — LLM composes them from these 4 tools.
 *
 * ⚠️ DO NOT add higher-level tools here. If in doubt, add to Agents.md instead.
 */
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import type { ToolDef, ToolHandler } from './types'
import { getMainWindowRef } from '../../mainWindowRef'

// setVaultPath must be called before agent tools run

let _vaultPath = ''

export function setVaultPath(p: string): void { _vaultPath = p }

/** Resolve relative path → vault absolute path, guard path traversal */
function vaultResolve(p: string): string {
  const s = String(p ?? '')
  if (!s) throw new Error('vaultResolve: empty path (vault path=' + _vaultPath + ')')
  if (s.includes('..')) throw new Error('path traversal forbidden')
  return s.startsWith(_vaultPath) ? s : join(_vaultPath, s)
}

// ─── Tool definitions — 4 atomic tools only ────────────────────────────────

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read',
      description:
        '读取 vault 目录下的文件。path 为相对路径（如 _raw/文件.docx 或 _wiki/笔记.md）。' +
        '支持 .docx/.pdf/.xlsx/.pptx/.md/.txt 自动智能分段读取。' +
        '图片文件（.png/.jpg/.jpeg/.tiff/.bmp/.webp）自动 OCR 识别文字。' +
        '大文件（超 8000 字符）自动按段落/章节分割，chunkIndex 从 0 开始。' +
        '返回格式：内容末尾标注 ---CHUNK: 1/3--- 表示第 1 段共 3 段。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径' },
          chunkIndex: { type: 'number', description: '分段索引，从 0 开始（默认 0）', default: 0 },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description:
        '新建或覆盖 vault 目录下的文件，自动创建父目录。' +
        '用法：写入 wiki 页面 → path="_wiki/{topic}/{title}.md", content="内容（含 frontmatter）"',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径，如 _wiki/笔记.md' },
          content: { type: 'string', description: '文件内容（完整 markdown）' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description:
        '替换文件中的指定文本片段。oldText 必须精确匹配（包含前后空格/标点）。' +
        'occurrence 可指定替换第几个匹配（默认第1个）。' +
        '适合：追加日志条目 / 修正错误 / 插入内容到文件中间。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径' },
          oldText: { type: 'string', description: '要替换掉的原文（精确匹配）' },
          newText: { type: 'string', description: '替换成的内容' },
          occurrence: { type: 'number', description: '第几个匹配（默认1，从前往后数）' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        '在 vault 目录下执行受限 shell 命令（白名单模式）。' +
        '支持: ls, grep, cat, find, wc, head, tail（只读）| mkdir -p（建目录）| node server/tools/（脚本）。' +
        '禁止: rm, mv, cp, dd, sudo, curl, python 等。' +
        'stdout/stderr 实时推送，超时 60s。',
      parameters: {
        type: 'object',
        properties: { cmd: { type: 'string', description: 'shell 命令' } },
        required: ['cmd'],
      },
    },
  },
]

// ─── Tool handlers ────────────────────────────────────────────────────────────

/** Notify renderer that vault files changed, triggering file tree refresh */
function notifyFilesChanged(): void {
  try {
    const main = getMainWindowRef()
    if (main && !main.isDestroyed()) main.webContents.send('import:completed', [])
  } catch { /* window may not exist */ }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {

  read: async (args) => {
    try {
      if (!args.path) return 'read 失败: path 为空。提示：传入相对路径如 _raw/doc.pdf 或 _wiki/topic/note.md。不确定文件在哪？先用 bash ls 扫描目录。'
      const fp = vaultResolve(String(args.path))
      const ext = extname(fp).toLowerCase()
      const chunkIndex = Number(args.chunkIndex ?? 0)
      const CHUNK_SIZE = 8000

      // Smart split by paragraphs/sections, respecting chunk size
      const smartSplit = (text: string, size: number): string[] => {
        const paras = text.split(/\n\s*\n/)
        const chunks: string[] = []
        let current = ''
        for (const p of paras) {
          if (current.length + p.length + 2 > size && current.length > 0) {
            chunks.push(current)
            current = p
          } else {
            current = current ? current + '\n\n' + p : p
          }
        }
        if (current) chunks.push(current)
        if (chunks.length === 0) {
          const lines = text.split('\n')
          current = ''
          for (const line of lines) {
            if (current.length + line.length + 1 > size && current.length > 0) {
              chunks.push(current)
              current = line
            } else {
              current = current ? current + '\n' + line : line
            }
          }
          if (current) chunks.push(current)
        }
        return chunks.filter(c => c.trim())
      }

      const fmtChunk = (content: string, idx: number, total: number) =>
        total > 1 ? content + `\n\n---CHUNK: ${idx + 1}/${total}---` : content

      if (ext === '.docx') {
        const { extractRawText } = await import('mammoth')
        const r = await extractRawText({ path: fp })
        const raw = r.value || '(empty docx)'
        const parts = smartSplit(raw, CHUNK_SIZE)
        return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
      }
      if (ext === '.pdf') {
        try {
          // Step 1: Try text extraction first
          const out = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', fp, '-'], {
            cwd: _vaultPath,
            encoding: 'utf-8',
          })
          let result = ''
          for await (const chunk of out.stdout) { result += chunk }

          // Step 2: If result is empty/very short, fall back to OCR via pdftoppm + tesseract
          if (!result || result.trim().length < 100) {
            const pages: string[] = []
            // pdftoppm -r 200 (200 DPI), -png output to stdout as PNG
            const imgOut = spawn('pdftoppm', ['-r', '200', '-png', fp, 'page'], {
              cwd: _vaultPath,
            })
            // Wait for pdftoppm to finish writing all page files to disk
            await new Promise<void>((resolve, reject) => {
              imgOut.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`pdftoppm exited with code ${code}`))
              })
              imgOut.on('error', reject)
            })
            // pdftoppm writes to working dir, files are read from disk below
            const { readdirSync, unlinkSync } = await import('fs')
            const { join: pjoin } = await import('path')
            const tmpDir = _vaultPath
            const pageFilesList = readdirSync(tmpDir).filter(f => f.startsWith('page-') && f.endsWith('.png')).sort()
            for (const pf of pageFilesList) {
              try {
                const tOut = spawn('tesseract', [pjoin(tmpDir, pf), 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], { cwd: tmpDir, encoding: 'utf-8' })
                let txt = ''
                for await (const c of tOut.stdout) { txt += c }
                pages.push(txt.trim())
                unlinkSync(pjoin(tmpDir, pf))
              } catch { /* skip failed pages */ }
            }
            result = pages.join('\n\n')
          }

          const raw = result || '(empty PDF)'
          const parts = smartSplit(raw, CHUNK_SIZE)
          return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
        } catch (e: any) {
          return `read (pdf) 失败: ${e.message}`
        }
      }
      if (ext === '.xlsx' || ext === '.xls') {
        try {
          const XLSX = await import('xlsx')
          const wb = XLSX.readFile(fp)
          const raw = wb.SheetNames.map(sn => {
            return '## ' + sn + '\n' + XLSX.utils.sheet_to_csv(wb.Sheets[sn])
          }).join('\n\n')
          const parts = smartSplit(raw, CHUNK_SIZE)
          return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
        } catch (e: any) {
          return `read (xlsx) 失败: ${e.message}`
        }
      }
      if (ext === '.pptx') {
        try {
          const JSZip = await import('jszip')
          const buf = await readFile(fp)
          const zip = await JSZip.loadAsync(buf)
          const texts: string[] = []
          for (const [n, file] of Object.entries(zip.files)) {
            if (n.startsWith('ppt/slides/slide') && n.endsWith('.xml') && !file.dir) {
              const xml = await file.async('string')
              texts.push([...xml.matchAll(/<a:t>([^<]+)<\/a:t>/g)].map((m: any) => m[1]).join('\n'))
            }
          }
          const raw = texts.join('\n\n')
          const parts = smartSplit(raw, CHUNK_SIZE)
          return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
        } catch (e: any) {
          return `read (pptx) 失败: ${e.message}`
        }
      }

      // OCR for image files
      const OCR_EXTS = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp', '.gif']
      if (OCR_EXTS.includes(ext)) {
        try {
          const out = spawn('tesseract', [fp, 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], {
            cwd: _vaultPath,
            encoding: 'utf-8',
          })
          let result = ''
          for await (const chunk of out.stdout) { result += chunk }
          const raw = result.trim() || '(empty or no text found)'
          const parts = smartSplit(raw, CHUNK_SIZE)
          return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
        } catch (e: any) {
          return `read (ocr) 失败: ${e.message}`
        }
      }

      const raw = await readFile(fp, 'utf-8')
      const parts = smartSplit(raw, CHUNK_SIZE)
      return fmtChunk(parts[chunkIndex] ?? parts[0] ?? '', chunkIndex, parts.length)
    } catch (e: any) {
      return `read 失败: ${e.message}。提示：如果文件较大（>8000字），用 chunkIndex 分段读取（0开始）。`
    }
  },

  write: async (args) => {
    try {
      if (!args.path) return 'write 失败: path 为空。提示：传入相对路径如 _wiki/topic/note.md，content 为完整 markdown。'
      let filePath = String(args.path)
      const ext = filePath.split('.').pop()?.toLowerCase()
      const knownDirs = ['_raw/', '_wiki/', '_briefing/', '_output/', 'log.md', 'index.md', 'LLM-wiki.md', 'Agents.md']
      const inKnownDir = knownDirs.some(d => filePath.startsWith(d))
      if (ext !== 'md' && !inKnownDir) {
        filePath = '_output/' + filePath
      }
      const fp = vaultResolve(filePath)
      const parent = fp.split('/').slice(0, -1).join('/')
      if (parent) await mkdir(parent, { recursive: true })
      await writeFile(fp, args.content as string, 'utf-8')
      notifyFilesChanged()
      // Keep FTS index in sync
      try { const { reindexFile } = await import('../database/database'); reindexFile(filePath) } catch { /* ignore */ }
      return '✅ 已写入: ' + fp
    } catch (e: any) {
      return `write 失败: ${e.message}。提示：检查路径是否合法（无..，有扩展名如 .md），父目录自动创建。`
    }
  },

  edit: async (args) => {
    try {
      const fp = vaultResolve(args.path as string)
      const raw = await readFile(fp, 'utf-8')
      const oldText = args.oldText as string
      const newText = args.newText as string
      const occurrence = args.occurrence as number | undefined

      // Find all match positions
      const matches: number[] = []
      let idx = 0
      while (true) {
        const pos = raw.indexOf(oldText, idx)
        if (pos === -1) break
        matches.push(pos)
        idx = pos + oldText.length
      }

      if (matches.length === 0) {
        return `edit 失败: 未找到要替换的文本 [${oldText}]。提示：先用 read 查看文件内容，确保 oldText 精确匹配（含空格标点）。`
      }

      if (matches.length > 1 && !occurrence) {
        return `edit 失败: 找到 ${matches.length} 处匹配，请指定 occurrence（第几个，从1开始）。提示：先 read 确认是哪一处匹配需要替换。`
      }

      const targetPos = occurrence ? matches[occurrence - 1] : matches[0]
      const next = raw.slice(0, targetPos) + newText + raw.slice(targetPos + oldText.length)
      await writeFile(fp, next, 'utf-8')
      notifyFilesChanged()
      // Keep FTS index in sync
      try { const { reindexFile } = await import('../database/database'); reindexFile(String(args.path)) } catch { /* ignore */ }
      return '✅ 已修改: ' + fp
    } catch (e: any) {
      return `edit 失败: ${e.message}。提示：confirm path is under vault, with no .. traversal.`
    }
  },

  bash: async (args, signal?: AbortSignal): Promise<string> => {
    const cmd = String(args.cmd as string).trim()
    if (!cmd) return 'bash 失败: 空命令。提示：传入合法 shell 命令如 ls _raw/ 或 grep pattern file。'

    // ── Security: pattern-based allowlisting ──────────────────────
    // First, hard blocks (before pattern check)
    if (/\|\|\s*|&&\s*|;\s*|`|\$\(|\)/.test(cmd)) {
      return 'bash 失败: 禁止命令链/子shell。提示：每次运行一个命令。'
    }
    if (/\.\./.test(cmd)) return 'bash 失败: 路径遍历禁止。'
    if (/\/etc|\/proc|\/sys|\/tmp\//.test(cmd)) {
      return 'bash 失败: 禁止访问系统目录。'
    }
    if (cmd.startsWith('/')) return 'bash 失败: 绝对路径禁止。提示：所有路径以 vault 根为基准。'
    // blocked command guard (before pattern checks that could also fire)
    const blocked = ['rm', 'dd', 'sudo', 'chmod', 'chown', 'mv', 'cp', 'curl', 'wget', 'nc', 'ncat', 'telnet', 'ssh', 'scp', 'sh', 'bash', 'zsh', 'python', 'python3', 'perl', 'ruby', 'php', 'lua', 'awk', 'sed', 'xargs', 'kill', 'pkill', 'reboot', 'shutdown']
    if (blocked.some(b => cmd.split(/\s+/)[0] === b)) {
      return `bash 失败: 禁止 '${cmd.split(/\s+/)[0]}' — 用只读命令(ls/grep/cat/find/wc) 或 node server/tools/ 脚本。`
    }

    if (/\s\//.test(cmd)) return 'bash 失败: 绝对路径禁止。用相对路径如 _wiki/topic/ 代替。'

    // Pattern-based whitelist: extract first word, validate against allowed set
    const firstWord = cmd.split(/\s+/)[0]
    const allowedReadOnly = ['ls', 'cat', 'grep', 'find', 'wc', 'head', 'tail', 'sort', 'uniq', 'echo', 'date', 'basename', 'dirname', 'realpath', 'du', 'diff', 'file', 'stat']
    const allowedSafeOps = ['mkdir', 'node']

    // Check for output redirection (dangerous: can overwrite files)
    if (/\d*>\s*\S/.test(cmd)) return 'bash 失败: 禁止输出重定向(>)。提示：结果直接返回。'

    if (blocked.includes(firstWord)) {
      return `bash 失败: 禁止 '${firstWord}' — 用只读命令(ls/grep/cat/find/wc) 或 node server/tools/ 脚本。`
    }
    if (!allowedReadOnly.includes(firstWord) && !allowedSafeOps.includes(firstWord)) {
      return `bash 失败: 不支持 '${firstWord}' — 支持的命令: ${[...allowedReadOnly.slice(0, 6), ...allowedSafeOps].join(', ')}, ...`
    }

    // Special: 'node' only with server/tools/ prefix
    if (firstWord === 'node') {
      const secondWord = cmd.split(/\s+/)[1]
      if (!secondWord?.startsWith('server/tools/')) {
        return 'bash 失败: node 只允许 server/tools/ 下的脚本。提示：如 node server/tools/sys_health.js --scope _wiki/'
      }
    }

    // Special: 'mkdir' only with -p flag
    if (firstWord === 'mkdir') {
      if (!cmd.includes('-p')) return 'bash 失败: mkdir 必须带 -p 参数。'
      if (!/^mkdir\s+-p\s+[^/]/.test(cmd)) return 'bash 失败: mkdir -p 只允许相对路径。'
    }

    // Resolve server/tools/ paths against app root (not vault root)
    let resolvedCmd = cmd
    if (/node\s+server\/tools\//.test(cmd)) {
      const { app } = await import('electron')
      const { join: pathJoin } = await import('path')
      const { existsSync } = await import('fs')
      let toolsDir = pathJoin(app.getAppPath(), 'server', 'tools')
      if (!existsSync(pathJoin(toolsDir, 'sys_health.js'))) {
        // Dev mode fallback: project root
        toolsDir = pathJoin(app.getAppPath(), '..', 'server', 'tools')
      }
      resolvedCmd = cmd.replace(/server\/tools\/(\S+)/, pathJoin(toolsDir, '$1'))
    }

    return new Promise((resolve) => {
      const webContents = getMainWindowRef()?.webContents
      const chunks: string[] = []
      let settled = false

      const finish = (text: string) => {
        if (settled) return
        settled = true
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('bash:done', { result: text })
        }
        resolve(text)
      }

      const proc = spawn('sh', ['-c', resolvedCmd], {
        cwd: _vaultPath,
        encoding: 'utf-8',
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          proc.kill('SIGTERM')
          finish('bash 已取消')
        }, { once: true })
      }

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString('utf-8')
        chunks.push(text)
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('bash:chunk', { chunk: text })
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8')
        chunks.push('[stderr] ' + text)
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('bash:chunk', { chunk: '[stderr] ' + text })
        }
      })

      proc.on('close', (code) => {
        const full = chunks.join('')
        finish(full || (code === 0 ? '（无输出）' : `退出码 ${code}`))
      })

      proc.on('error', (err: Error) => {
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('bash:error', { error: err.message })
        }
        resolve('bash 失败: ' + err.message + '。提示：检查命令拼写、文件是否存在、参数格式是否正确。超时也有可能是命令卡住了。')
      })
    })
  },
}