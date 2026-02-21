import { describe, expect, test } from "bun:test"
import type { BrainSearchConfig } from "../config"
import type { SearchCandidate } from "../types"
import { serializeEmbedding } from "./embedding-store"
import { createHybridSearcher, type HybridSearcherDeps } from "./hybrid-searcher"
import type { BrainDatabase, CitedSearchResult, EmbeddingProvider, FtsSearcher, VectorSearcher } from "./types"

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

  describe("searchWithCitations", () => {
    test("#returns cited search results with provenance field", async () => {
      const ftsResults = [makeCandidate("1", "docs/a.md", 1.0)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const results = await searcher.searchWithCitations!("project", { limit: 10 })

      const typed: CitedSearchResult[] = results
      expect(typed.length).toBe(1)
      expect(results[0].provenance).toEqual({
        source_file: "docs/a.md",
        source_date: expect.any(String),
        original_quote: "content-1",
      })
    })

    test("#provenance source_file matches candidate path", async () => {
      const ftsResults = [makeCandidate("2", "notes/project/alpha.md", 0.9)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.path).toBe("notes/project/alpha.md")
      expect(result.provenance.source_file).toBe(result.path)
    })

    test("#original quote uses full content when shorter than 200 chars", async () => {
      const shortContent = "short citation quote"
      const ftsResults = [{ ...makeCandidate("3", "docs/short.md", 0.8), content: shortContent }]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.original_quote).toBe(shortContent)
    })

    test("#extracts YYYY-MM-DD date from path", async () => {
      const ftsResults = [makeCandidate("4", "daily/2024-01-15.md", 1.0)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.source_date).toBe("2024-01-15")
    })

    test("#extracts and normalizes YYYY/MM/DD date from path", async () => {
      const ftsResults = [makeCandidate("5", "meetings/2024/01/15-standup.md", 1.0)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.source_date).toBe("2024-01-15")
    })

    test("#falls back to today's date when path has no date", async () => {
      const today = new Date().toISOString().slice(0, 10)
      const ftsResults = [makeCandidate("6", "docs/no-date-note.md", 1.0)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.source_date).toBe(today)
    })

    test("#reuses search results and preserves candidate ordering", async () => {
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

      const searchResults = await searcher.search("project", { limit: 10 })
      const citedResults = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(citedResults.map(result => result.id)).toEqual(searchResults.map(result => result.id))
      expect(citedResults.map(result => result.path)).toEqual(searchResults.map(result => result.path))
      expect(citedResults.map(result => result.combined_score)).toEqual(searchResults.map(result => result.combined_score))
    })

    test("#returns empty array when underlying search returns empty", async () => {
      const searcher = createHybridSearcher(makeDeps({
        fts: makeMockFts([]),
        vectorSearcher: makeMockVectorSearcher([]),
        embeddingProvider: makeMockEmbeddingProvider(),
      }))

      const results = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(results).toEqual([])
    })

    test("#respects limit option", async () => {
      const ftsResults = [
        makeCandidate("1", "docs/a.md", 1.0),
        makeCandidate("2", "docs/b.md", 0.9),
        makeCandidate("3", "docs/c.md", 0.8),
      ]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const results = await searcher.searchWithCitations!("project", { limit: 2 })

      expect(results.length).toBe(2)
      expect(results.map(result => result.id)).toEqual(["1", "2"])
    })

    test("#respects path option", async () => {
      const fts: FtsSearcher = {
        search: () => [makeCandidate("x", "docs/other.md", 1)],
        searchByPath: (_query, path) => [makeCandidate("1", path, 1)],
        highlight: () => [],
      }
      const vectorSearcher: VectorSearcher = {
        search: () => [makeCandidate("y", "docs/other.md", 1)],
        searchByPath: (_embedding, path) => [makeCandidate("2", path, 1)],
        invalidateCache: () => {},
      }
      const searcher = createHybridSearcher(makeDeps({
        fts,
        vectorSearcher,
        embeddingProvider: makeMockEmbeddingProvider(),
      }))

      const results = await searcher.searchWithCitations!("project", { path: "docs/target.md", limit: 10 })

      expect(results.length).toBe(2)
      expect(results.map(result => result.path)).toEqual(["docs/target.md", "docs/target.md"])
      expect(results.map(result => result.provenance.source_file)).toEqual(["docs/target.md", "docs/target.md"])
    })

    test("#content exactly 200 chars does not truncate", async () => {
      const exact200 = "a".repeat(200)
      const ftsResults = [{ ...makeCandidate("7", "docs/exact.md", 1.0), content: exact200 }]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.original_quote.length).toBe(200)
      expect(result.provenance.original_quote).toBe(exact200)
    })

    test("#content longer than 200 chars truncates with ellipsis", async () => {
      const over200 = "b".repeat(201)
      const ftsResults = [{ ...makeCandidate("8", "docs/long.md", 1.0), content: over200 }]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.original_quote.length).toBe(203)
      expect(result.provenance.original_quote).toBe(`${"b".repeat(200)}...`)
    })

    test("#event_id is undefined by default", async () => {
      const ftsResults = [makeCandidate("9", "docs/a.md", 1.0)]
      const searcher = createHybridSearcher(makeDeps({ fts: makeMockFts(ftsResults) }))

      const [result] = await searcher.searchWithCitations!("project", { limit: 10 })

      expect(result.provenance.event_id).toBeUndefined()
    })
  })
})
