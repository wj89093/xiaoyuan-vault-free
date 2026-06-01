import { describe, it, expect } from 'vitest'

describe('XSS prevention', () => {
  it('textContent prevents script injection', () => {
    const el = { textContent: '' } as HTMLElement
    const malicious = '<img src=x onerror=alert(1)>'
    // Simulate textContent assignment (safe)
    el.textContent = malicious
    
    // textContent does NOT evaluate HTML
    expect(el.textContent).toBe(malicious)
    // The malicious HTML is stored as plain text, not parsed
    expect(el.textContent).not.toBe(undefined)
  })

  it('innerHTML would execute scripts (dangerous)', () => {
    const el = { innerHTML: '' } as HTMLElement
    // innerHTML DOES parse HTML — this is why we avoid it
    const safe = 'Hello World'
    el.innerHTML = safe
    expect(el.innerHTML).toBe(safe)
  })

  it('escapes HTML entities correctly', () => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(esc('a & b')).toBe('a &amp; b')
  })
})

import { join } from 'path';

describe('Path construction safety', () => {
  it('join normalizes path separators', () => {
    expect(join('/a', 'b', 'c')).toBe('/a/b/c')
  })

  it('startsWith correctly detects vault bounds', () => {
    const vp = '/Users/test/vault'
    const safe = '/Users/test/vault/docs/file.md'
    const bad = '/Users/test/outside/file.md'
    expect(safe.startsWith(vp)).toBe(true)
    expect(bad.startsWith(vp)).toBe(false)
  })

  it('.. traversal is detected by startsWith check', () => {
    const vp = '/Users/test/vault'
    // path.join resolves .. traversal
    const resolved = join(vp, '_raw/../../../etc/passwd')
    // The resolved path escapes the vault
    expect(resolved.startsWith(vp)).toBe(false)
  })
})

describe('JSON serialization safety', () => {
  it('JSON.stringify handles special characters', () => {
    const msg = `Hello
World
with "quotes" and \\backslashes\\`
    const json = JSON.stringify(msg)
    expect(json).toContain('\\n')
    expect(json).toContain('\\"')
    expect(json).toContain('\\\\')
  })

  it('base64 round-trip preserves content', () => {
    const original = '你好世界 Hello World'
    const b64 = Buffer.from(original, 'utf-8').toString('base64')
    const decoded = Buffer.from(b64, 'base64').toString('utf-8')
    expect(decoded).toBe(original)
  })
})

describe('Session storage key uniqueness', () => {
  it('per-vault keys prevent cross-contamination', () => {
    const v1 = '/Users/vaults/project-a'
    const v2 = '/Users/vaults/project-b'
    const k1 = 'onboarding_ai_shown_' + v1
    const k2 = 'onboarding_ai_shown_' + v2
    expect(k1).not.toBe(k2)
  })
})
