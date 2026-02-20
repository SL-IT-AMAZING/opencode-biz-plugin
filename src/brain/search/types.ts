import type { SearchCandidate, ChunkRecord, IndexState } from "../types"
import type { Database } from "bun:sqlite"

export interface BrainDatabase {
  readonly raw: Database
  close(): void
  getChunks(path: string): ChunkRecord[]
  upsertChunks(path: string, chunks: ChunkInsert[]): void
  setEmbedding(chunkId: number, embedding: Buffer, model: string): void
  getEmbedding(chunkId: number): { embedding: Buffer; model: string } | undefined
  getAllEmbeddingsForSearch(): Array<{ id: number; path: string; embedding: Buffer; created_at: string; updated_at: string; is_evergreen: number }>
  getChunksNeedingEmbedding(model: string): Array<{ id: number; content: string }>
  clearEmbeddings(): void
  removeFile(path: string): void
  getFileState(path: string): FileIndexState | undefined
  setFileState(path: string, state: FileIndexState): void
  getAllFileStates(): Record<string, FileIndexState>
  getStats(): DatabaseStats
  optimize(): void
}

export interface DatabaseStats {
  totalChunks: number
  totalFiles: number
  dbSizeBytes: number
}

export interface ChunkInsert {
  content: string
  chunk_index: number
  content_hash: string
  is_evergreen: boolean
}

export interface FileIndexState {
  hash: string
  mtime: number
  chunk_count: number
  last_indexed: string
}

export interface FtsSearcher {
  search(query: string, limit?: number): SearchCandidate[]
  searchByPath(query: string, path: string, limit?: number): SearchCandidate[]
  highlight(query: string, limit?: number): Array<SearchCandidate & { highlighted: string }>
}

export interface MarkdownIndexer {
  indexFile(absolutePath: string): Promise<IndexFileResult>
  removeFile(absolutePath: string): void
  fullScan(vaultPath: string, patterns: string[]): Promise<FullScanResult>
  getState(): IndexState
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<Float32Array[]>
  readonly dimensions: number
  readonly modelId: string
}

export interface VectorSearcher {
  search(queryEmbedding: Float32Array, limit?: number): SearchCandidate[]
  searchByPath(queryEmbedding: Float32Array, path: string, limit?: number): SearchCandidate[]
  invalidateCache(): void
}

export interface HybridScorer {
  fuse(ftsResults: SearchCandidate[], vecResults: SearchCandidate[]): SearchCandidate[]
}

export interface HybridSearchOptions {
  limit?: number
  path?: string
}

export interface HybridSearcher {
  search(query: string, options?: HybridSearchOptions): Promise<SearchCandidate[]>
}

export interface IndexFileResult {
  path: string
  chunks: number
  skipped: boolean
  reason?: string
}

export interface FullScanResult {
  indexed: number
  skipped: number
  removed: number
  errors: string[]
}
