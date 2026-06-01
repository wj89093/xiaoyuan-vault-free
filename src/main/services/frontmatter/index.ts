/**
 * frontmatter — shared frontmatter parsing utilities
 *
 * Re-exports all public API from sub-modules so external imports
 * continue to work: `import { parseFrontmatter } from './frontmatter'`
 */

export type { Relationship, OpenThread, Frontmatter } from './types'
export { parseFrontmatter, stringifyFrontmatter, applyFrontmatter, extractDisplayTitle } from './parse'
export { extractWikiLinks, extractTypedLinks, addRelationship } from './links'
export { generateFileTemplate, touchFrontmatter } from './template'
