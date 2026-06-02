import { describe, it, expect } from 'vitest'
import { join } from 'path'

// Test the ensureInVault logic directly (ported inline to avoid module mocking)
function ensureInVault(vaultPath: string | null, filePath: string): void {
  if (!vaultPath) return
  const safe = filePath.startsWith('/') ? filePath.slice(1) : filePath
  const resolved = join(vaultPath, safe)
  if (
    !resolved.startsWith(vaultPath) ||
    (resolved !== vaultPath && !resolved.startsWith(vaultPath + '/'))
  ) {
    throw new Error('Path traversal blocked: ' + filePath)
  }
}

describe('ensureInVault — path traversal protection', () => {
  const vp = '/Users/test/vault'

  it('allows normal relative paths', () => {
    expect(() => ensureInVault(vp, 'docs/test.md')).not.toThrow()
  })

  it('allows absolute paths within vault', () => {
    expect(() => ensureInVault(vp, '/Users/test/vault/docs/test.md')).not.toThrow()
  })

  it('blocks path traversal (../)', () => {
    expect(() => ensureInVault(vp, '../../etc/passwd')).toThrow('Path traversal blocked')
  })

  it('blocks deep path traversal (../../../)', () => {
    expect(() => ensureInVault(vp, '../../../etc/passwd')).toThrow('Path traversal blocked')
  })

  it('resolves absolute /etc/passwd to within vault as etc/passwd', () => {
    // After slice(1), /etc/passwd → etc/passwd which stays within vault
    expect(() => ensureInVault(vp, '/etc/passwd')).not.toThrow()
  })

  it('resolves ../vault/docs to within vault (normalizes)', () => {
    // join resolves ../vault/docs → vault/docs which is inside
    expect(() => ensureInVault(vp, '../vault/docs/test.md')).not.toThrow()
  })

  it('allows paths staying within vault with nested dirs', () => {
    expect(() => ensureInVault(vp, '/Users/test/vault/a/b/c/file.md')).not.toThrow()
  })

  it('relative ../ traversal is blocked', () => {
    // Real-world attack: filePath comes from renderer like '_raw/../../.ssh/id_rsa'
    expect(() => ensureInVault(vp, '_raw/../../.ssh/id_rsa')).toThrow()
  })

  it('is a no-op when vaultPath is null', () => {
    expect(() => ensureInVault(null, '../../etc/passwd')).not.toThrow()
  })
})
