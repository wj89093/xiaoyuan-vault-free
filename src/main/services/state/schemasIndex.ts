/**
 * schemasIndex.ts — _state/schemas/INDEX.json
 *
 * AI-readable index of all vault folder schemas. Companion to
 * .xiaoyuan/schemas/<folder>.json (per-folder schema files).
 *
 * Why this exists:
 * - Schemas tell AI "this folder's files MUST have these frontmatter fields"
 * - Without an index, AI must read every .xiaoyuan/schemas/*.json to find
 *   which folders have schemas
 * - INDEX.json gives AI: folder list + field names + confirmed status
 *   in one read; drill-down per folder only when AI needs field details
 *
 * Design (v1.9, 2026-06-12): two-layer state model
 *   _state/schemas/INDEX.json  ← AI default (this file)
 *   .xiaoyuan/schemas/<folder>.json  ← per-folder source, drill-down
 *
 * Trigger: schemaStorage.saveFolderSchema. Silent fail.
 */
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { listFolderSchemas } from '../schema/schemaStorage'
import type { FolderSchema } from '../schema/schemaStorage'
import log from 'electron-log/main'

export interface SchemaEntry {
  folder: string
  version: string
  confirmed: boolean
  description: string
  /** Field names only (no details) — AI can list this without detail file */
  fieldNames: string[]
  /** Path to full schema file (relative to vault root) */
  source: string
  createdAt: number
  confirmedAt?: number
  updatedAt?: number
}

export interface SchemasIndex {
  updatedAt: string
  total: number
  confirmed: number
  pending: number
  /** All schemas (newest updated first) */
  entries: SchemaEntry[]
  /** Path format string (AI can construct a path with folder name) */
  sourceFormat: string
}

/**
 * Build index from a list of FolderSchemas. Pure function — testable.
 */
export function buildSchemasIndex(
  schemas: FolderSchema[]
): Omit<SchemasIndex, 'updatedAt' | 'sourceFormat'> {
  const entries: SchemaEntry[] = schemas.map((s) => ({
    folder: s.folder,
    version: s.version,
    confirmed: s.confirmed,
    description: s.description,
    fieldNames: s.fields.map((f) => f.key),
    source: `.xiaoyuan/schemas/${s.folder.replace(/[/\\?*:]/g, '_')}.json`,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt,
    updatedAt: s.updatedAt
  }))

  // Newest updated first; fall back to createdAt
  entries.sort((a, b) => {
    const ta = a.updatedAt ?? a.createdAt
    const tb = b.updatedAt ?? b.createdAt
    return tb - ta
  })

  return {
    total: entries.length,
    confirmed: entries.filter((e) => e.confirmed).length,
    pending: entries.filter((e) => !e.confirmed).length,
    entries
  }
}

/**
 * Write _state/schemas/INDEX.json. Silent fail.
 * Call this after a schema is saved.
 */
export async function writeSchemasIndex(): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return

  try {
    const schemas = await listFolderSchemas()
    const partial = buildSchemasIndex(schemas)
    const index: SchemasIndex = {
      ...partial,
      updatedAt: new Date().toISOString(),
      sourceFormat: '.xiaoyuan/schemas/<folder>.json'
    }

    const dir = join(vaultPath, '_state', 'schemas')
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'INDEX.json'), JSON.stringify(index, null, 2), 'utf-8')
  } catch (e) {
    log.warn('[SCHEMAS_INDEX] write failed:', e)
  }
}
