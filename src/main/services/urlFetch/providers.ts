/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import axios from 'axios'
import * as cheerio from 'cheerio'
import log from 'electron-log/main'
import type { URLFetchResult } from './types'
import { extractYouTubeId } from './utils'

const JINA_READER_BASE = 'https://r.jina.ai/'
const FETCH_TIMEOUT = 15000
const MIN_CONTENT_LENGTH = 20

/**
 * Jina Reader 抓取（通用方案）
 */
export async function fetchViaJina(url: string): Promise<URLFetchResult> {
  const jinaUrl = `${JINA_READER_BASE}${url}`
  const response = await axios.get(jinaUrl, {
    timeout: FETCH_TIMEOUT,
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'Mozilla/5.0 (compatible; xiaoyuan-vault/1.0)'
    },
    responseType: 'text'
  })

  const text: string = response.data
  if (!text || text.length < MIN_CONTENT_LENGTH) {
    throw new Error(`Jina returned insufficient content (${text?.length ?? 0} chars)`)
  }

  return {
    title: extractJinaTitle(text) ?? url,
    content: text,
    url: url,
    source: 'jina'
  }
}

function extractJinaTitle(text: string): string | undefined {
  // Jina often returns title on first line
  const lines = text.trim().split('\n')
  const firstLine = lines[0]?.replace(/^#+\s*/, '').trim()
  if (firstLine && firstLine.length < 200) return firstLine
  return undefined
}

/**
 * 直接 HTML 抓取（降级方案）
 */
export async function fetchDirectHTML(url: string): Promise<URLFetchResult> {
  const response = await axios.get(url, {
    timeout: FETCH_TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml'
    }
  })

  const html: string = response.data
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim() || url
  const author = $('meta[name="author"]').attr('content') ?? undefined
  const date =
    $('meta[property="article:published_time"]').attr('content') ??
    $('meta[name="date"]').attr('content') ??
    undefined

  // Remove unwanted elements
  $('script, style, nav, header, footer, iframe, .ads, #comments').remove()

  let content = ''
  // Try common article selectors
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.entry-content',
    '.article-content',
    'body'
  ]
  for (const sel of selectors) {
    const el = $(sel)
    if (el.length > 0) {
      content = el.text().trim()
      if (content.length > MIN_CONTENT_LENGTH) break
    }
  }

  if (!content || content.length < MIN_CONTENT_LENGTH) {
    content = $('body').text().trim()
  }

  return { title, content, author, date, url, source: 'direct' }
}

/**
 * 微信公众号文章
 */
export async function fetchWechat(url: string): Promise<URLFetchResult> {
  try {
    return await fetchViaJina(url)
  } catch {
    return await fetchDirectHTML(url)
  }
}

/**
 * YouTube 视频摘要
 */
export async function fetchYouTube(url: string): Promise<URLFetchResult> {
  const videoId = extractYouTubeId(url)
  if (!videoId) throw new Error('Invalid YouTube URL')

  // Try oEmbed API for basic info
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const oembedRes = await axios.get(oembedUrl, { timeout: FETCH_TIMEOUT })
    const data = oembedRes.data as Record<string, unknown>
    const title = String(data.title ?? 'YouTube Video')
    const author = String(data.author_name ?? '')
    const content = `Title: ${title}\nAuthor: ${author}\nURL: ${url}`
    return { title, content, author, date: undefined, url, source: 'youtube' }
  } catch (err) {
    log.warn('[YouTube] oEmbed failed:', (err as Error).message)
    return { title: 'YouTube Video', content: `YouTube video: ${url}`, url, source: 'youtube' }
  }
}

/**
 * Twitter/X
 */
export async function fetchTwitter(url: string): Promise<URLFetchResult> {
  // Use Jina as primary for Twitter
  try {
    return await fetchViaJina(url)
  } catch {
    return { title: 'Tweet', content: `Tweet: ${url}`, url, source: 'twitter' }
  }
}

/**
 * GitHub 仓库/文件
 */
export async function fetchGitHub(url: string): Promise<URLFetchResult> {
  // Convert to raw content URL
  const rawUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')

  try {
    const response = await axios.get(rawUrl, {
      timeout: FETCH_TIMEOUT,
      headers: { 'User-Agent': 'xiaoyuan-vault/1.0' }
    })
    const content: string = response.data
    const title = url.split('/').pop() ?? url
    return { title, content, url, source: 'github' }
  } catch {
    return await fetchDirectHTML(url)
  }
}

/**
 * Bilibili 视频元数据
 */
export async function fetchBilibili(url: string): Promise<URLFetchResult> {
  // Extract bvid from URL patterns like:
  // https://www.bilibili.com/video/BV1xx411c7mD
  // https://bilibili.com/video/BV1xx411c7mD
  const bvidMatch = url.match(/\/video\/([A-Za-z0-9]+)/)
  if (!bvidMatch) {
    // Fallback to Jina
    try {
      return await fetchViaJina(url)
    } catch {
      return await fetchDirectHTML(url)
    }
  }
  const bvid = bvidMatch[1]

  try {
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
    const res = await axios.get(apiUrl, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    })
    const data = (res.data as Record<string, unknown>).data as Record<string, unknown> | undefined
    if (!data) throw new Error('No data from Bilibili API')

    const title = String(data.title ?? 'B站视频')
    const owner = data.owner as Record<string, unknown> | undefined
    const stat = data.stat as Record<string, unknown> | undefined
    const pubdate = data.pubdate as number | undefined

    const content = [
      `标题：${title}`,
      `UP主：${owner?.name ?? '未知'}`,
      `分区：${data.tname ?? ''}`,
      `播放：${stat?.view ?? '?'}  点赞：${stat?.like ?? '?'}  投币：${stat?.coin ?? '?'}  收藏：${stat?.favorite ?? '?'}`,
      pubdate ? `发布时间：${new Date(pubdate * 1000).toLocaleString('zh-CN')}` : '',
      `简介：${data.desc ?? ''}`,
      `链接：${url}`
    ]
      .filter(Boolean)
      .join('\n')

    return {
      title,
      content,
      author: owner?.name as string | undefined,
      date: pubdate ? new Date(pubdate * 1000).toISOString() : undefined,
      url,
      source: 'bilibili'
    }
  } catch (err) {
    log.warn('[Bilibili] API failed, falling back:', (err as Error).message)
    try {
      return await fetchViaJina(url)
    } catch {
      return await fetchDirectHTML(url)
    }
  }
}

/**
 * 知乎（先试 Jina，降级到直接解析）
 */
export async function fetchZhihu(url: string): Promise<URLFetchResult> {
  try {
    return await fetchViaJina(url)
  } catch {
    return await fetchDirectHTML(url)
  }
}

export async function fetchReddit(url: string): Promise<URLFetchResult> {
  const jsonUrl = url.endsWith('/') ? `${url}.json` : `${url}.json`
  try {
    const response = await axios.get(jsonUrl, {
      timeout: FETCH_TIMEOUT,
      headers: { 'User-Agent': 'xiaoyuan-vault/1.0' }
    })
    const data = response.data as Array<Record<string, unknown>>
    const post = data[0]?.data?.children?.[0]?.data as Record<string, unknown> | undefined
    if (post) {
      return {
        title: String(post.title ?? ''),
        content: String(post.selftext ?? post.body ?? ''),
        author: String(post.author ?? ''),
        url,
        source: 'reddit'
      }
    }
    throw new Error('No post data')
  } catch {
    return await fetchDirectHTML(url)
  }
}
