import type { TFIDFDocument, GraphEdge } from './types'

// ============ Constants ============

export const STOPWORDS = new Set([
  '的',
  '了',
  '在',
  '是',
  '我',
  '有',
  '和',
  '就',
  '不',
  '人',
  '都',
  '一',
  '一个',
  '上',
  '也',
  '很',
  '到',
  '说',
  '要',
  '去',
  '你',
  '会',
  '着',
  '没有',
  '看',
  '好',
  '自己',
  '这',
  '他',
  '她',
  '它',
  '们',
  '那',
  '些',
  '什么',
  '怎么',
  '如何',
  '可以',
  '这个',
  '那个',
  '如果',
  '因为',
  '所以',
  '但是',
  '而且',
  '或者',
  '虽然',
  '不过',
  '已经',
  '还是',
  '这样',
  '那样',
  '大家',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'and',
  'but',
  'or',
  'it',
  'its'
])

export const MIN_TOKENS_FOR_SIMILARITY = 5
export const COSINE_EARLY_ZERO = 0.001
export const SIMILARITY_THRESHOLD = 0.15

// ============ Tokenization ============

export function tokenize(text: string): Map<string, number> {
  const tokenMap = new Map<string, number>()

  const cleaned = text
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[-*+]\s+/g, '')
    .replace(/^\|.*\|$/gm, '')
    .toLowerCase()

  // CJK bigrams
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g
  const cjkChars = cleaned.match(cjkPattern) ?? []
  for (let i = 0; i < cjkChars.length - 1; i++) {
    const bigram = cjkChars[i] + cjkChars[i + 1]
    if (!STOPWORDS.has(bigram)) {
      tokenMap.set(bigram, (tokenMap.get(bigram) ?? 0) + 1)
    }
  }

  // English words
  const words = cleaned.replace(/[^\u4e00-\u9fff\w]/g, ' ').split(/\s+/)
  for (const w of words) {
    if (w.length < 3 || w.length > 30) continue
    if (STOPWORDS.has(w)) continue
    if (/^\d+$/.test(w)) continue
    tokenMap.set(w, (tokenMap.get(w) ?? 0) + 1)
  }

  return tokenMap
}

// ============ TF-IDF ============

export function computeTFIDF(documents: TFIDFDocument[]): {
  vectors: Map<string, Map<string, number>>[]
  idf: Map<string, number>
} {
  const N = documents.length
  if (N === 0) return { vectors: [], idf: new Map() }

  // Document frequency
  const df = new Map<string, number>()
  for (const doc of documents) {
    const seen = new Set<string>()
    for (const term of doc.tokens.keys()) {
      if (!seen.has(term)) {
        df.set(term, (df.get(term) ?? 0) + 1)
        seen.add(term)
      }
    }
    for (const tag of doc.tags) {
      if (!seen.has(tag)) {
        df.set(tag, (df.get(tag) ?? 0) + 1)
        seen.add(tag)
      }
    }
  }

  // IDF
  const idf = new Map<string, number>()
  for (const [term, docCount] of df) {
    idf.set(term, Math.log((N + 1) / (docCount + 1)) + 1)
  }

  // TF-IDF vectors
  const vectors: Map<string, Map<string, number>>[] = []
  for (const doc of documents) {
    const vec = new Map<string, number>()
    const totalTokens = [...doc.tokens.values()].reduce((a, b) => a + b, 0) || 1
    for (const [term, count] of doc.tokens) {
      vec.set(term, (count / totalTokens) * (idf.get(term) ?? 1))
    }
    for (const tag of doc.tags) {
      vec.set(tag, (vec.get(tag) ?? 0) + 2 * (idf.get(tag) ?? 1))
    }
    vectors.push(vec)
  }

  return { vectors, idf }
}

// ============ Cosine Similarity ============

export function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const [term, valueA] of vecA) {
    const valueB = vecB.get(term) ?? 0
    dotProduct += valueA * valueB
    normA += valueA * valueA
  }
  for (const [, valueB] of vecB) {
    normB += valueB * valueB
  }

  if (normA === 0 || normB === 0) return 0
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (dotProduct < COSINE_EARLY_ZERO * denom) return 0
  return dotProduct / denom
}

// ============ Edge Building ============

function edgeKey(source: string, target: string, type: string): string {
  const [a, b] = source < target ? [source, target] : [target, source]
  return `${a}|${b}|${type}`
}

export function buildEdges(
  documents: TFIDFDocument[],
  vectors: Map<string, Map<string, number>>[],
  _idf: Map<string, number>
): GraphEdge[] {
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const MAX_EDGES = 200

  const nameToDocs = new Map<string, { doc: TFIDFDocument }[]>()
  for (const doc of documents) {
    const titles = [doc.title, ...doc.relationships.map((r) => r.target)]
    for (const name of titles) {
      const norm = name.toLowerCase().replace(/\s+/g, '')
      if (!nameToDocs.has(norm)) nameToDocs.set(norm, [])
      nameToDocs.get(norm)!.push({ doc })
    }
  }

  function addEdge(
    source: string,
    target: string,
    relation: GraphEdge['relation'],
    weight: number
  ): void {
    const key = edgeKey(source, target, relation)
    if (seen.has(key)) return
    if (edges.length >= MAX_EDGES) return
    seen.add(key)
    edges.push({ source, target, relation, weight })
  }

  // Typed-link edges
  for (const doc of documents) {
    for (const rel of doc.relationships) {
      const targetNorm = rel.target.toLowerCase().replace(/\s+/g, '')
      const matches = nameToDocs.get(targetNorm) ?? []
      for (const { doc: targetDoc } of matches) {
        if (targetDoc.file !== doc.file) {
          addEdge(doc.file, targetDoc.file, 'typed_link', 1.0)
        }
      }
    }
  }

  // Tag edges
  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const sharedTags = documents[i].tags.filter((t) => documents[j].tags.includes(t))
      if (sharedTags.length > 0) {
        addEdge(documents[i].file, documents[j].file, 'shared_tag', sharedTags.length * 0.3)
      }
    }
  }

  // Content similarity edges
  for (let i = 0; i < vectors.length; i++) {
    if (documents[i].tokens.size < MIN_TOKENS_FOR_SIMILARITY) continue
    for (let j = i + 1; j < vectors.length; j++) {
      if (documents[j].tokens.size < MIN_TOKENS_FOR_SIMILARITY) continue
      const existingKey = edgeKey(documents[i].file, documents[j].file, 'shared_tag')
      if (seen.has(existingKey)) continue

      const similarity = cosineSimilarity(vectors[i], vectors[j])
      if (similarity >= SIMILARITY_THRESHOLD) {
        addEdge(documents[i].file, documents[j].file, 'similar_content', similarity)
      }
    }
  }

  return edges
}
