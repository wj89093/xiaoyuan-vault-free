import log from 'electron-log/main'
import {
  fetchViaJina,
  fetchDirectHTML,
  fetchWechat,
  fetchYouTube,
  fetchTwitter,
  fetchGitHub,
  fetchReddit,
  fetchBilibili,
  fetchZhihu
} from './providers'
import type { URLFetchResult } from './types'

export type { URLFetchResult }
export {
  fetchViaJina,
  fetchDirectHTML,
  fetchWechat,
  fetchYouTube,
  fetchTwitter,
  fetchGitHub,
  fetchReddit,
  fetchBilibili,
  fetchZhihu
} from './providers'

/**
 * 智能抓取：根据 URL 选择最佳抓取策略
 */
export async function fetchURL(url: string): Promise<URLFetchResult> {
  const cleanUrl = url.trim()
  if (!cleanUrl) throw new Error('Empty URL')

  // Platform-specific fetchers
  if (cleanUrl.includes('mp.weixin.qq.com')) return fetchWechat(cleanUrl)
  if (cleanUrl.includes('youtube.com/') || cleanUrl.includes('youtu.be/'))
    return fetchYouTube(cleanUrl)
  if (cleanUrl.includes('twitter.com/') || cleanUrl.includes('x.com/'))
    return fetchTwitter(cleanUrl)
  if (cleanUrl.includes('github.com/')) return fetchGitHub(cleanUrl)
  if (cleanUrl.includes('reddit.com/')) return fetchReddit(cleanUrl)
  if (cleanUrl.includes('bilibili.com/')) return fetchBilibili(cleanUrl)
  if (cleanUrl.includes('zhihu.com/')) return fetchZhihu(cleanUrl)

  // Jina Reader → Direct HTML 两级降级
  try {
    return await fetchViaJina(cleanUrl)
  } catch (jinaErr) {
    log.warn(`[Jina] failed: ${String(jinaErr)}, trying direct fetch`)
    try {
      return await fetchDirectHTML(cleanUrl)
    } catch (directErr) {
      throw new Error(`Jina: ${String(jinaErr as Error)} | Direct: ${String(directErr as Error)}`)
    }
  }
}

/**
 * 保存 URL 内容到 Vault
 */
export async function saveURLToVault(
  url: string,
  vaultPath: string,
  fileName?: string
): Promise<string> {
  const { join } = await import('path')
  const { mkdir, writeFile } = await import('fs/promises')

  const result = await fetchURL(url)
  const { downloadAndReplaceImages } = await import('./utils')
  const safeName = fileName ?? result.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 50)
  const filePath = join(vaultPath, '_raw', safeName)

  await mkdir(join(vaultPath, '_raw'), { recursive: true })
  const { content: finalContent } = await downloadAndReplaceImages(result.content, url, vaultPath)

  const frontmatter = [
    '---',
    `title: "${result.title}"`,
    result.author ? `author: "${result.author}"` : '',
    result.date ? `date: "${result.date}"` : '',
    `source: ${result.source}`,
    `url: "${url}"`,
    `archived: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    ''
  ]
    .filter((s): s is string => !!s)
    .join('\n')

  const content = frontmatter + finalContent
  await writeFile(filePath, content, 'utf-8')
  log.info(`[URL] saved: ${url} → ${filePath}`)
  return filePath
}
