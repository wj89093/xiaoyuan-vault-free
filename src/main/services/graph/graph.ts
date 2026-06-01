// graph.ts — Public API facade
// Split into:
//   graphStorage.ts — persistence (load/save/getGraphPath)
//   graphBuild.ts    — rebuild logic (full + incremental)
//   graphTFIDF.ts   — algorithms (tokenize/tfidf/cosine/edges)
//   types.ts         — shared types

export { getGraphPath, loadGraph, saveGraph, loadFolderToTypeMap } from './graphStorage'
export { rebuildGraph, rebuildGraphIncremental } from './graphBuild'
export { tokenize, computeTFIDF, cosineSimilarity, buildEdges } from './graphTFIDF'
export { STOPWORDS } from './graphTFIDF'
export type { GraphNode, GraphEdge, GraphData, TFIDFDocument } from './types'
