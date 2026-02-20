import { describe, test, expect } from "bun:test"
import type { BrainSearchConfig } from "../config"
import type { SearchCandidate } from "../types"
import { createHybridScorer } from "./hybrid-scorer"

function makeCandidate(id: string, overrides: Partial<SearchCandidate> = {}): SearchCandidate {
  return {
    id,
    path: `docs/${id}.md`,
    chunk_index: 0,
    content: `content for ${id}`,
    fts_score: 0,
    vec_score: 0,
    temporal_score: 1,
    combined_score: 0,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<BrainSearchConfig> = {}): BrainSearchConfig {
  return {
    fts_weight: 0.3,
    vec_weight: 0.7,
    mmr_lambda: 0.7,
    temporal_decay: true,
    max_candidates: 50,
    ...overrides,
  }
}

describe("brain/search/hybrid-scorer", () => {
  test("#given both lists empty → returns empty array", () => {
    // #given
    const scorer = createHybridScorer(makeConfig())

    // #when
    const fused = scorer.fuse([], [])

    // #then
    expect(fused).toEqual([])
  })

  test("#given only FTS results → orders by FTS rank", () => {
    // #given
    const scorer = createHybridScorer(makeConfig())
    const ftsResults = [
      makeCandidate("a", { fts_score: 9 }),
      makeCandidate("b", { fts_score: 8 }),
      makeCandidate("c", { fts_score: 7 }),
    ]

    // #when
    const fused = scorer.fuse(ftsResults, [])

    // #then
    expect(fused.map(candidate => candidate.id)).toEqual(["a", "b", "c"])
  })

  test("#given only vector results → orders by vector rank", () => {
    // #given
    const scorer = createHybridScorer(makeConfig())
    const vecResults = [
      makeCandidate("v1", { vec_score: 0.99 }),
      makeCandidate("v2", { vec_score: 0.88 }),
      makeCandidate("v3", { vec_score: 0.77 }),
    ]

    // #when
    const fused = scorer.fuse([], vecResults)

    // #then
    expect(fused.map(candidate => candidate.id)).toEqual(["v1", "v2", "v3"])
  })

  test("#given doc in both lists → has higher combined score than doc in one list", () => {
    // #given
    const scorer = createHybridScorer(makeConfig())
    const ftsResults = [
      makeCandidate("shared", { fts_score: 9 }),
      makeCandidate("fts-only", { fts_score: 8 }),
    ]
    const vecResults = [
      makeCandidate("shared", { vec_score: 0.99 }),
      makeCandidate("vec-only", { vec_score: 0.88 }),
    ]

    // #when
    const fused = scorer.fuse(ftsResults, vecResults)

    // #then
    const byId = new Map(fused.map(candidate => [candidate.id, candidate]))
    expect(byId.get("shared")!.combined_score).toBeGreaterThan(byId.get("fts-only")!.combined_score)
    expect(byId.get("shared")!.combined_score).toBeGreaterThan(byId.get("vec-only")!.combined_score)
  })

  test("#given fts_weight=0.9 → ranking is FTS-dominant", () => {
    // #given
    const scorer = createHybridScorer(makeConfig({ fts_weight: 0.9, vec_weight: 0.1 }))
    const ftsResults = [
      makeCandidate("fts-top", { fts_score: 10 }),
      makeCandidate("vec-top", { fts_score: 5 }),
    ]
    const vecResults = [
      makeCandidate("vec-top", { vec_score: 0.99 }),
      makeCandidate("fts-top", { vec_score: 0.5 }),
    ]

    // #when
    const fused = scorer.fuse(ftsResults, vecResults)

    // #then
    expect(fused[0].id).toBe("fts-top")
  })

  test("#given equal combined scores → sorts by id ascending", () => {
    // #given
    const scorer = createHybridScorer(makeConfig({ fts_weight: 0.5, vec_weight: 0.5 }))
    const ftsResults = [makeCandidate("b", { fts_score: 10 })]
    const vecResults = [makeCandidate("a", { vec_score: 0.99 })]

    // #when
    const fused = scorer.fuse(ftsResults, vecResults)

    // #then
    expect(fused.map(candidate => candidate.id)).toEqual(["a", "b"])
  })

  test("#given rich candidate fields → preserves SearchCandidate data", () => {
    // #given
    const scorer = createHybridScorer(makeConfig())
    const ftsCandidate = makeCandidate("doc-1", {
      path: "notes/project.md",
      chunk_index: 7,
      content: "Detailed project context",
      fts_score: 42,
      vec_score: 0.05,
      temporal_score: 0.8,
    })
    const vecCandidate = makeCandidate("doc-1", {
      path: "notes/project.md",
      chunk_index: 7,
      content: "Detailed project context",
      vec_score: 0.95,
      temporal_score: 0.8,
    })

    // #when
    const fused = scorer.fuse([ftsCandidate], [vecCandidate])

    // #then
    expect(fused.length).toBe(1)
    expect(fused[0].path).toBe("notes/project.md")
    expect(fused[0].chunk_index).toBe(7)
    expect(fused[0].content).toBe("Detailed project context")
    expect(fused[0].fts_score).toBe(42)
    expect(fused[0].vec_score).toBe(0.95)
    expect(fused[0].temporal_score).toBe(0.8)
    expect(fused[0].combined_score).toBeGreaterThan(0)
  })
})
