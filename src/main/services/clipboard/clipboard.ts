// clipboard.ts — Facade: delegates to sub-modules
//   clipboardImport.ts  — File/text import to vault
import { initDatabase } from '../database/database'

export { importFilesToVault, saveToVault } from './clipboardImport'

export function setVaultPath(path: string): void {
  initDatabase(path)
}
