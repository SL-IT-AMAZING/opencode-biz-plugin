import { describe, expect, test } from "bun:test"
import type { BrainSearchConfig } from "../config"
import type { SearchCandidate } from "../types"
import { serializeEmbedding } from "./embedding-store"
import { createHybridSearcher, type HybridSearcherDeps } from "./hybrid-searcher"
import type { BrainDatabase, EmbeddingProvider, FtsSearcher, VectorSearcher } from "./types"

function makeCandidate(id: string, path: string, score: number): SearchCandidate {
  return {
    id,
    path,
    chunk_index: 0,
    content: `content-${id}`,
    fts_score: score,
    vec_score: score,
    temporal_score: 1,
    combined_score: score,
  }
}

function makeMockFts(results: SearchCandidate[]): FtsSearcher {
  return {
    search: () => results,
    searchByPath: (_query, path) => results.filter(result => result.path === path),
    highlight: () => [],
  }
}

function makeMockVectorSearcher(results: SearchCandidate[]): VectorSearcher {
  return {
    search: () => results,
    searchByPath: (_embedding, path) => results.filter(result => result.path === path),
    invalidateCache: () => {},
  }
}

function makeMockEmbeddingProvider(dimensions = 2): EmbeddingProvider {
  return {
    embed: async texts => texts.map(() => new Float32Array([1, 0])),
    dimensions,
    modelId: "test-model",
  }
}

function makeFailingEmbeddingProvider(): EmbeddingProvider {
  return {
    embed: async () => {
      throw new Error("API rate limit")
    },
    dimensions: 2,
    modelId: "failing-model",
  }
}

function makeMockDb(
  rows: Array<{ id: number; path: string; embedding: Buffer; created_at: string; updated_at: string; is_evergreen: number }> = [],
): BrainDatabase {
  return {
    getAllEmbeddingsForSearch: () => rows,
  } as unknown as BrainDatabase
}

function makeConfig(overrides: Partial<BrainSearchConfig> = {}): BrainSearchConfig {
  return {
    fts_weight: 0.3,
    vec_weight: 0.7,
    mmr_lambda: 0.7,
    temporal_decay: false,
    max_candidates: 50,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<HybridSearcherDeps> = {}): HybridSearcherDeps {
  return {
    fts: makeMockFts([]),
    vectorSearcher: null,
    embeddingProvider: null,
    db: makeMockDb(),
    searchConfig: makeConfig(),
    decayHalfLifeDays: 30,
    embeddingDimensions: 2,
    ...overrides,
  }
}

describe("brain/search/hybrid-searcher", () => {
  test("#given FTS results only (no embedding provider) -> returns FTS results", async () => {
    const ftsResults = [
      makeCandidate("1", "docs/a.md", 1.0),
      makeCandidate("2", "docs/b.md", 0.9),
    ]
    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      embeddingProvider: null,
      vectorSearcher: null,
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results.map(result => result.id)).toEqual(["1", "2"])
  })

  test("#given both FTS and vector results -> fuses via RRF and returns merged", async () => {
    const ftsResults = [
      makeCandidate("shared", "docs/shared.md", 1.0),
      makeCandidate("fts-only", "docs/fts.md", 0.8),
    ]
    const vecResults = [
      makeCandidate("shared", "docs/shared.md", 1.0),
      makeCandidate("vec-only", "docs/vec.md", 0.7),
    ]

    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      vectorSearcher: makeMockVectorSearcher(vecResults),
      embeddingProvider: makeMockEmbeddingProvider(),
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results.map(result => result.id)).toEqual(["shared", "vec-only", "fts-only"])
  })

  test("#given embedding provider throws -> gracefully falls back to FTS-only", async () => {
    const ftsResults = [
      makeCandidate("1", "docs/a.md", 1.0),
      makeCandidate("2", "docs/b.md", 0.9),
    ]
    let vectorSearchCount = 0
    const vectorSearcher: VectorSearcher = {
      search: () => {
        vectorSearchCount += 1
        return []
      },
      searchByPath: () => {
        vectorSearchCount += 1
        return []
      },
      invalidateCache: () => {},
    }

    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      vectorSearcher,
      embeddingProvider: makeFailingEmbeddingProvider(),
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results.map(result => result.id)).toEqual(["1", "2"])
    expect(vectorSearchCount).toBe(0)
  })

  test("#given temporal_decay enabled -> applies decay to results", async () => {
    const oldDate = new Date(Date.now() - (120 * 24 * 60 * 60 * 1000)).toISOString()
    const ftsResults = [makeCandidate("1", "docs/old.md", 1.0)]

    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      searchConfig: makeConfig({ temporal_decay: true }),
      db: makeMockDb([
        {
          id: 1,
          path: "docs/old.md",
          embedding: serializeEmbedding(new Float32Array([1, 0])),
          created_at: oldDate,
          updated_at: oldDate,
          is_evergreen: 0,
        },
      ]),
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results.length).toBe(1)
    expect(results[0].temporal_score).toBeLessThan(1)
  })

  test("#given query with path filter -> uses searchByPath on both FTS and vector", async () => {
    let ftsPathCalls = 0
    let vecPathCalls = 0

    const fts: FtsSearcher = {
      search: () => [],
      searchByPath: (_query, path) => {
        ftsPathCalls += 1
        return [makeCandidate("1", path, 1)]
      },
      highlight: () => [],
    }
    const vectorSearcher: VectorSearcher = {
      search: () => [],
      searchByPath: (_embedding, path) => {
        vecPathCalls += 1
        return [makeCandidate("2", path, 1)]
      },
      invalidateCache: () => {},
    }

    const searcher = createHybridSearcher(makeDeps({
      fts,
      vectorSearcher,
      embeddingProvider: makeMockEmbeddingProvider(),
    }))

    const results = await searcher.search("project", { path: "docs/a.md", limit: 10 })

    expect(ftsPathCalls).toBe(1)
    expect(vecPathCalls).toBe(1)
    expect(results.map(result => result.path)).toEqual(["docs/a.md", "docs/a.md"])
  })

  test("#given limit option -> returns at most limit results", async () => {
    const ftsResults = [
      makeCandidate("1", "docs/a.md", 1.0),
      makeCandidate("2", "docs/b.md", 0.9),
      makeCandidate("3", "docs/c.md", 0.8),
    ]
    const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

    const results = await searcher.search("project", { limit: 2 })

    expect(results.length).toBe(2)
  })

  test("#given empty FTS and empty vector -> returns empty array", async () => {
    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts([]),
      vectorSearcher: makeMockVectorSearcher([]),
      embeddingProvider: makeMockEmbeddingProvider(),
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results).toEqual([])
  })

  test("#given vectorSearcher null but embeddingProvider exists -> FTS-only", async () => {
    const ftsResults = [makeCandidate("1", "docs/a.md", 1.0)]
    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      vectorSearcher: null,
      embeddingProvider: makeMockEmbeddingProvider(),
    }))

    const results = await searcher.search("project", { limit: 10 })

    expect(results.map(result => result.id)).toEqual(["1"])
  })

  test("#given both FTS and vector with MMR -> diverse results returned", async () => {
    const ftsResults = [
      makeCandidate("1", "docs/a.md", 1.0),
      makeCandidate("2", "docs/b.md", 0.9),
      makeCandidate("3", "docs/c.md", 0.8),
    ]
    const vecResults = [
      makeCandidate("1", "docs/a.md", 1.0),
      makeCandidate("2", "docs/b.md", 0.9),
      makeCandidate("3", "docs/c.md", 0.8),
    ]

    const rows = [
      {
        id: 1,
        path: "docs/a.md",
        embedding: serializeEmbedding(new Float32Array([1, 0])),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_evergreen: 0,
      },
      {
        id: 2,
        path: "docs/b.md",
        embedding: serializeEmbedding(new Float32Array([0.999, 0.001])),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_evergreen: 0,
      },
      {
        id: 3,
        path: "docs/c.md",
        embedding: serializeEmbedding(new Float32Array([0, 1])),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_evergreen: 0,
      },
    ]

    const embeddingProvider: EmbeddingProvider = {
      embed: async () => [new Float32Array([1, 0])],
      dimensions: 2,
      modelId: "test-model",
    }

    const searcher = createHybridSearcher(makeDeps({
      fts: makeMockFts(ftsResults),
      vectorSearcher: makeMockVectorSearcher(vecResults),
      embeddingProvider,
      db: makeMockDb(rows),
      searchConfig: makeConfig({ mmr_lambda: 0 }),
    }))

    const results = await searcher.search("project", { limit: 3 })

    expect(results.map(result => result.id)).toEqual(["1", "3", "2"])
  })
})
