/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import axios from 'axios'
import log from 'electron-log/main'

/**
 * Download remote images, replace URLs with local paths
 */
export async function downloadAndReplaceImages(
  htmlContent: string,
  pageUrl: string,
  vaultPath: string
): Promise<{ content: string; downloaded: number }> {
  const { join } = await import('path')
  const { mkdir, writeFile } = await import('fs/promises')
  const urlObj = new URL(pageUrl)
  const domain = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '-')
  const assetDir = join(vaultPath, '_raw', 'assets', domain)

  try {
    await mkdir(assetDir, { recursive: true })
  } catch {
    log.warn('[urlFetch] mkdir assetDir failed, returning fallback', assetDir)
    return { content: htmlContent, downloaded: 0 }
  }

  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match
  let downloaded = 0
  let content = htmlContent

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const imgUrl = match[1].trim()
    if (!imgUrl || imgUrl.startsWith('data:') || imgUrl.startsWith('blob:')) continue

    try {
      const response = await axios.get(imgUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })

      const ext = response.headers['content-type']?.split('/')?.[1] ?? 'png'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = join(assetDir, filename)
      await writeFile(filePath, Buffer.from(response.data))
      const localPath = `../_raw/assets/${domain}/${filename}`
      content = content.replace(imgUrl, localPath)
      downloaded++
      log.info(`[Image] downloaded: ${imgUrl} → ${filePath}`)
    } catch (err) {
      log.warn(`[Image] failed: ${imgUrl}`, (err as Error).message)
    }
  }

  return { content, downloaded }
}

/**
 * Extract YouTube video ID from URL
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}
