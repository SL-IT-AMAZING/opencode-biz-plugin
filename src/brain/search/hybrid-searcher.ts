import type { BrainSearchConfig } from "../config"
import type { SearchCandidate } from "../types"
import { createHybridScorer } from "./hybrid-scorer"
import { deserializeEmbedding } from "./embedding-store"
import { mmrRerank } from "./mmr"
import { applyTemporalDecay, type TemporalMetadata } from "./temporal-decay"
import type {
  BrainDatabase,
  CitedSearchResult,
  EmbeddingProvider,
  FtsSearcher,
  HybridSearchOptions,
  HybridSearcher,
  VectorSearcher,
} from "./types"

export interface HybridSearcherDeps {
  fts: FtsSearcher
  vectorSearcher: VectorSearcher | null
  embeddingProvider: EmbeddingProvider | null
  db: BrainDatabase
  searchConfig: BrainSearchConfig
  decayHalfLifeDays: number
  embeddingDimensions: number
}

export function createHybridSearcher(deps: HybridSearcherDeps): HybridSearcher {
  const scorer = createHybridScorer(deps.searchConfig)

  return {
    async search(query: string, options?: HybridSearchOptions): Promise<SearchCandidate[]> {
      try {
        const limit = Math.max(0, options?.limit ?? 10)
        const maxCandidates = Math.max(1, deps.searchConfig.max_candidates ?? 50)
        const path = options?.path

        let ftsResults: SearchCandidate[]
        try {
          ftsResults = path
            ? deps.fts.searchByPath(query, path, maxCandidates)
            : deps.fts.search(query, maxCandidates)
        } catch {
          ftsResults = []
        }

        let vecResults: SearchCandidate[] = []
        let queryEmbedding: Float32Array | null = null
        if (deps.embeddingProvider && deps.vectorSearcher) {
          try {
            const [embedding] = await deps.embeddingProvider.embed([query])
            if (embedding) {
              queryEmbedding = embedding
              vecResults = path
                ? deps.vectorSearcher.searchByPath(embedding, path, maxCandidates)
                : deps.vectorSearcher.search(embedding, maxCandidates)
            }
          } catch {
            vecResults = []
            queryEmbedding = null
          }
        }

        let candidates = scorer.fuse(ftsResults, vecResults)

        let cachedRows: ReturnType<BrainDatabase["getAllEmbeddingsForSearch"]> | null = null
        const getEmbeddingRows = (): ReturnType<BrainDatabase["getAllEmbeddingsForSearch"]> => {
          if (cachedRows) return cachedRows
          try {
            cachedRows = deps.db.getAllEmbeddingsForSearch()
          } catch {
            cachedRows = []
          }
          return cachedRows
        }

        if (deps.searchConfig.temporal_decay && candidates.length > 0) {
          const metadata = buildTemporalMetadata(candidates, getEmbeddingRows())
          candidates = applyTemporalDecay(candidates, metadata, deps.decayHalfLifeDays, 0.1)
        }

        if (queryEmbedding && candidates.length > 0) {
          const embeddings = buildEmbeddingMap(candidates, getEmbeddingRows(), deps.embeddingDimensions)
          candidates = mmrRerank(candidates, embeddings, queryEmbedding, deps.searchConfig.mmr_lambda, limit)
        } else {
          candidates = candidates.slice(0, limit)
        }

        return candidates
      } catch {
        return []
      }
    },
    async searchWithCitations(query: string, options?: HybridSearchOptions): Promise<CitedSearchResult[]> {
      const candidates = await this.search(query, options)

      return candidates.map(candidate => {
        const dateMatch = candidate.path.match(/(\d{4}[-/]\d{2}[-/]\d{2})/)
        const sourceDate = dateMatch ? dateMatch[1].replace(/\//g, "-") : new Date().toISOString().slice(0, 10)

        const originalQuote = candidate.content.length > 200
          ? `${candidate.content.slice(0, 200)}...`
          : candidate.content

        return {
          ...candidate,
          provenance: {
            source_file: candidate.path,
            source_date: sourceDate,
            original_quote: originalQuote,
          },
        }
      })
    },
  }
}

function buildTemporalMetadata(
  candidates: SearchCandidate[],
  rows: ReturnType<BrainDatabase["getAllEmbeddingsForSearch"]>,
): Map<string, TemporalMetadata> {
  const rowMap = new Map(rows.map(row => [String(row.id), row]))
  const metadata = new Map<string, TemporalMetadata>()

  for (const candidate of candidates) {
    const row = rowMap.get(candidate.id)
    if (!row) continue

    metadata.set(candidate.id, {
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_evergreen: row.is_evergreen === 1,
    })
  }

  return metadata
}

function buildEmbeddingMap(
  candidates: SearchCandidate[],
  rows: ReturnType<BrainDatabase["getAllEmbeddingsForSearch"]>,
  dimensions: number,
): Map<string, Float32Array> {
  const rowMap = new Map(rows.map(row => [String(row.id), row]))
  const embeddings = new Map<string, Float32Array>()

  for (const candidate of candidates) {
    const row = rowMap.get(candidate.id)
    if (!row) continue

    try {
      embeddings.set(candidate.id, deserializeEmbedding(row.embedding, dimensions))
    } catch {
      continue
    }
  }

  return embeddings
}
