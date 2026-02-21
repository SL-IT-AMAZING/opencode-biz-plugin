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
  upsertEntity(entity: { id: string; type: string; name: string; aliases: string[]; vault_path?: string }): void
  findEntities(query: string, limit?: number): Array<{ id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number }>
  getEntity(id: string): { id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number } | undefined
  updateEntitySeen(id: string): void
  upsertRelation(entityAId: string, entityBId: string): void
  getRelated(entityId: string, limit?: number): Array<{ entity_a_id: string; entity_b_id: string; co_occurrence_count: number; last_updated: string; related_id: string; related_name: string; related_type: string }>
  insertEntityEvent(entityId: string, eventId: string, role: string): void
  getEntityEvents(entityId: string): Array<{ event_id: string; role: string; created_at: string }>
  getEventEntities(eventId: string): Array<{ entity_id: string; role: string; created_at: string }>
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
  searchWithCitations?(query: string, options?: HybridSearchOptions): Promise<CitedSearchResult[]>
}

export interface CitedSearchResult {
  /** Original search candidate fields */
  id: string
  path: string
  chunk_index: number
  content: string
  fts_score: number
  vec_score: number
  temporal_score: number
  combined_score: number
  /** Citation / provenance fields */
  provenance: {
    source_file: string
    source_date: string
    original_quote: string
    event_id?: string
  }
}

export interface EntityIndex {
  /** Upsert an entity, returns the entity ID */
  upsertEntity(entity: { type: string; name: string; aliases?: string[]; vault_path?: string }): Promise<string>
  
  /** Find entities by name (partial, case-insensitive) or alias */
  findEntity(query: string, limit?: number): Promise<Array<{
    id: string
    type: string
    name: string
    aliases: string[]
    vault_path: string | null
    first_seen: string
    last_seen: string
    interaction_count: number
  }>>
  
  /** Record co-occurrence: multiple entities appeared together in one event */
  recordCoOccurrence(entityIds: string[], eventId: string, role?: string): Promise<void>
  
  /** Get entities related to a given entity via co-occurrence, with time-decayed weights */
  getRelated(entityId: string, limit?: number): Promise<Array<{
    entity: { id: string; type: string; name: string; aliases: string[]; vault_path: string | null }
    co_occurrence_count: number
    decayed_weight: number
  }>>
  
  /** Get entity by ID */
  getEntity(id: string): Promise<{ id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number } | undefined>
  
  /** List all entities, optionally filtered by type */
  listEntities(type?: string): Promise<Array<{ id: string; type: string; name: string; aliases: string[]; vault_path: string | null; interaction_count: number }>>
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
