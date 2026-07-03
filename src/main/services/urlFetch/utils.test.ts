/**
 * utils.test.ts — urlFetch 纯函数补测
 *
 * 2026-07-03 v1.9 audit N8 后续 (Free 仓)
 *  - extractYouTubeId 是 urlFetch 唯一纯函数（其他都涉及 fs/network）
 *  - YouTube ID 提取错 = 整个 video preview 失效
 *  - 11 case 覆盖各种 URL 格式 + 边界
 */
import { describe, it, expect } from 'vitest'
import { extractYouTubeId } from './utils'

describe('extractYouTubeId', () => {
  describe('standard YouTube watch URLs', () => {
    it('extracts from basic watch URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts from watch URL with extra params', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=abc12345678&t=42s')).toBe('abc12345678')
    })

    it('extracts from watch URL without www', () => {
      expect(extractYouTubeId('https://youtube.com/watch?v=xyz98765432')).toBe('xyz98765432')
    })
  })

  describe('short YouTube URLs', () => {
    it('extracts from youtu.be short URL', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('extracts from youtu.be with trailing path', () => {
      expect(extractYouTubeId('https://youtu.be/abc_-123456?t=10')).toBe('abc_-123456')
    })
  })

  describe('embed URLs', () => {
    it('extracts from /embed/ URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })
  })

  describe('bare video ID', () => {
    it('accepts bare 11-char video ID', () => {
      expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    })

    it('accepts ID with underscores and hyphens', () => {
      expect(extractYouTubeId('abc_-123XYZ')).toBe('abc_-123XYZ')
    })
  })

  describe('invalid inputs', () => {
    it('returns null for non-YouTube URL', () => {
      expect(extractYouTubeId('https://example.com/video/123')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractYouTubeId('')).toBeNull()
    })

    it('returns null for ID that is too short', () => {
      expect(extractYouTubeId('short')).toBeNull()
    })
  })
})