import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const indexSource = readFileSync(
  join(process.cwd(), 'src/main/services/urlFetch/index.ts'),
  'utf-8'
)

const providersSource = readFileSync(
  join(process.cwd(), 'src/main/services/urlFetch/providers.ts'),
  'utf-8'
)

describe('urlFetch/index.ts surface', () => {
  it('should export fetchURL', () => {
    expect(indexSource).toMatch(/export async function fetchURL/)
  })

  it('should export saveURLToVault', () => {
    expect(indexSource).toMatch(/export async function saveURLToVault/)
  })

  it('should route wechat URLs to fetchWechat', () => {
    expect(indexSource).toMatch(/mp\.weixin\.qq\.com/)
  })

  it('should route youtube URLs to fetchYouTube', () => {
    expect(indexSource).toMatch(/youtube\.com/)
    expect(indexSource).toMatch(/youtu\.be\//)
  })

  it('should route twitter/x URLs to fetchTwitter', () => {
    expect(indexSource).toMatch(/twitter\.com/)
    expect(indexSource).toMatch(/x\.com\//)
  })

  it('should route github URLs to fetchGitHub', () => {
    expect(indexSource).toMatch(/github\.com\//)
  })

  it('should route reddit URLs to fetchReddit', () => {
    expect(indexSource).toMatch(/reddit\.com\//)
  })

  it('should fallback to Jina then direct HTML', () => {
    expect(indexSource).toMatch(/fetchViaJina/)
    expect(indexSource).toMatch(/fetchDirectHTML/)
  })
})

describe('urlFetch/providers.ts surface', () => {
  it('should export fetchViaJina', () => {
    expect(providersSource).toMatch(/export async function fetchViaJina/)
  })

  it('should export fetchDirectHTML', () => {
    expect(providersSource).toMatch(/export async function fetchDirectHTML/)
  })

  it('should export fetchWechat', () => {
    expect(providersSource).toMatch(/export async function fetchWechat/)
  })

  it('should export fetchYouTube', () => {
    expect(providersSource).toMatch(/export async function fetchYouTube/)
  })

  it('should export fetchTwitter', () => {
    expect(providersSource).toMatch(/export async function fetchTwitter/)
  })

  it('should export fetchGitHub', () => {
    expect(providersSource).toMatch(/export async function fetchGitHub/)
  })

  it('should export fetchReddit', () => {
    expect(providersSource).toMatch(/export async function fetchReddit/)
  })
})
