import type { SearchCandidate } from "../types"
import type { BrainDatabase, VectorSearcher } from "./types"
import { cosineSimilarity } from "./cosine"
import { deserializeEmbedding } from "./embedding-store"

interface CachedEmbedding {
  id: number
  path: string
  embedding: Float32Array
  created_at: string
  updated_at: string
  is_evergreen: number
}

interface ScoredEmbedding {
  embedding: CachedEmbedding
  similarity: number
}

function toSearchCandidate(item: ScoredEmbedding): SearchCandidate {
  return {
    id: String(item.embedding.id),
    path: item.embedding.path,
    chunk_index: 0,
    content: "",
    fts_score: 0,
    vec_score: item.similarity,
    temporal_score: 0,
    combined_score: item.similarity,
  }
}

/**
 * Creates a VectorSearcher that loads embeddings from DB and computes
 * brute-force cosine similarity. Optionally caches embeddings in memory.
 *
 * @param db - BrainDatabase with getAllEmbeddingsForSearch()
 * @param dimensions - Expected embedding dimensions (e.g. 384)
 * @param enableCache - If true, caches all embeddings in memory. Default: true.
 */
export function createVectorSearcher(
  db: BrainDatabase,
  dimensions: number,
  enableCache = true,
): VectorSearcher {
  let cachedEmbeddings: CachedEmbedding[] | null = null

  function loadEmbeddings(): CachedEmbedding[] {
    const rows = db.getAllEmbeddingsForSearch()
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      embedding: deserializeEmbedding(new Uint8Array(row.embedding), dimensions),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_evergreen: row.is_evergreen,
    }))
  }

  function getEmbeddings(): CachedEmbedding[] {
    if (!enableCache) {
      return loadEmbeddings()
    }

    if (cachedEmbeddings === null) {
      cachedEmbeddings = loadEmbeddings()
    }

    return cachedEmbeddings
  }

  function rankEmbeddings(queryEmbedding: Float32Array, embeddings: CachedEmbedding[], limit: number): SearchCandidate[] {
    const scored: ScoredEmbedding[] = embeddings.map((embedding) => ({
      embedding,
      similarity: cosineSimilarity(queryEmbedding, embedding.embedding),
    }))

    scored.sort((a, b) => {
      const scoreDelta = b.similarity - a.similarity
      if (scoreDelta !== 0) return scoreDelta
      return a.embedding.id - b.embedding.id
    })

    return scored.slice(0, limit).map(toSearchCandidate)
  }

  return {
    search(queryEmbedding: Float32Array, limit = 20): SearchCandidate[] {
      const embeddings = getEmbeddings()
      return rankEmbeddings(queryEmbedding, embeddings, limit)
    },

    searchByPath(queryEmbedding: Float32Array, path: string, limit = 20): SearchCandidate[] {
      const embeddings = getEmbeddings()
      const filtered = embeddings.filter((embedding) => embedding.path === path)
      return rankEmbeddings(queryEmbedding, filtered, limit)
    },

    invalidateCache() {
      cachedEmbeddings = null
    },
  }
}
