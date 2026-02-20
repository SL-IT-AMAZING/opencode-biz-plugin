export { createBrainDatabase } from "./db"
export { createFtsSearcher } from "./fts"
export { createMarkdownIndexer } from "./indexer"
export { splitMarkdownChunks } from "./chunker"
export { createEmbeddingProvider, createNullEmbeddingProvider } from "./embedding-provider"
export { serializeEmbedding, deserializeEmbedding, normalizeEmbedding } from "./embedding-store"
export type {
  BrainDatabase,
  ChunkInsert,
  FileIndexState,
  DatabaseStats,
  FtsSearcher,
  MarkdownIndexer,
  IndexFileResult,
  FullScanResult,
  EmbeddingProvider,
  VectorSearcher,
  HybridScorer,
  HybridSearcher,
  HybridSearchOptions,
} from "./types"
export { cosineSimilarity, dotProduct } from "./cosine"
export { createHybridScorer } from "./hybrid-scorer"
export { applyTemporalDecay } from "./temporal-decay"
export type { TemporalMetadata } from "./temporal-decay"
export { mmrRerank } from "./mmr"
export { createHybridSearcher, type HybridSearcherDeps } from "./hybrid-searcher"
export { createVectorSearcher } from "./vector-searcher"
