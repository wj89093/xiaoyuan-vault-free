import { join } from 'path'
import { existsSync } from 'fs'
import { getVaultPath } from '../../services/database/database'

export const CONVERTED_MARKER = '.converted'
export const TRASH_DIR = '.vault-trash'

export function ensureInVault(filePath: string): void {
  const vp = getVaultPath()
  if (!vp) return
  const safe = filePath.startsWith('/') ? filePath.slice(1) : filePath
  const resolved = join(vp, safe)
  if (!resolved.startsWith(vp) || (resolved !== vp && !resolved.startsWith(vp + '/'))) {
    throw new Error('Path traversal blocked: ' + filePath)
  }
}

export async function ensureUniquePath(dest: string): Promise<string> {
  if (!existsSync(dest)) return dest
  let counter = 1
  const ext = dest.lastIndexOf('.')
  const base = ext > 0 ? dest.slice(0, ext) : dest
  const extPart = ext > 0 ? dest.slice(ext) : ''
  while (existsSync(dest)) {
    dest = `${base} (${counter})${extPart}`
    counter++
  }
  return dest
}

export async function isConverted(rawPath: string): Promise<boolean> {
  return existsSync(rawPath + CONVERTED_MARKER)
}

export async function markConverted(rawPath: string): Promise<void> {
  const { writeFile } = await import('fs/promises')
  await writeFile(rawPath + CONVERTED_MARKER, '')
}

export function getTrashDir(vaultPath: string): string {
  return join(vaultPath, TRASH_DIR)
}
