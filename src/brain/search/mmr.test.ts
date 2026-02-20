import { describe, test, expect } from "bun:test"
import type { SearchCandidate } from "../types"
import { mmrRerank } from "./mmr"

function makeCandidate(id: string, combinedScore: number): SearchCandidate {
  return {
    id,
    path: `docs/${id}.md`,
    chunk_index: 0,
    content: `content for ${id}`,
    fts_score: 0,
    vec_score: 0,
    temporal_score: 1,
    combined_score: combinedScore,
  }
}

describe("brain/search/mmr", () => {
  test("#given empty candidates → returns empty array", () => {
    // #given
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank([], new Map(), queryEmbedding)

    // #then
    expect(reranked).toEqual([])
  })

  test("#given single candidate → returns that candidate", () => {
    // #given
    const candidate = makeCandidate("solo", 0.9)
    const embeddings = new Map<string, Float32Array>([["solo", new Float32Array([1, 0])]])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank([candidate], embeddings, queryEmbedding)

    // #then
    expect(reranked).toEqual([candidate])
  })

  test("#given similar and diverse docs → diverse doc leapfrogs after first selection", () => {
    // #given
    const candidates = [
      makeCandidate("a", 1.0),
      makeCandidate("b", 0.9),
      makeCandidate("c", 0.8),
    ]
    const embeddings = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 0])],
      ["b", new Float32Array([0.999, 0.001])],
      ["c", new Float32Array([0, 1])],
    ])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank(candidates, embeddings, queryEmbedding, 0.7, 3)

    // #then
    expect(reranked.map(candidate => candidate.id)).toEqual(["a", "c", "b"])
  })

  test("#given lambda=1.0 → returns relevance-first order", () => {
    // #given
    const candidates = [
      makeCandidate("a", 1.0),
      makeCandidate("b", 0.9),
      makeCandidate("c", 0.8),
    ]
    const embeddings = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 0])],
      ["b", new Float32Array([0.999, 0.001])],
      ["c", new Float32Array([0, 1])],
    ])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank(candidates, embeddings, queryEmbedding, 1.0, 3)

    // #then
    expect(reranked.map(candidate => candidate.id)).toEqual(["a", "b", "c"])
  })

  test("#given lambda=0.0 → prioritizes maximum diversity after first pick", () => {
    // #given
    const candidates = [
      makeCandidate("a", 1.0),
      makeCandidate("b", 0.9),
      makeCandidate("c", 0.8),
    ]
    const embeddings = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 0])],
      ["b", new Float32Array([0.999, 0.001])],
      ["c", new Float32Array([0, 1])],
    ])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank(candidates, embeddings, queryEmbedding, 0.0, 3)

    // #then
    expect(reranked.map(candidate => candidate.id)).toEqual(["a", "c", "b"])
  })

  test("#given missing embedding → falls back to relevance-only for that candidate", () => {
    // #given
    const candidates = [
      makeCandidate("a", 1.0),
      makeCandidate("b", 0.8),
      makeCandidate("missing", 0.6),
    ]
    const embeddings = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 0])],
      ["b", new Float32Array([0.999, 0.001])],
    ])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank(candidates, embeddings, queryEmbedding, 0.5, 3)

    // #then
    expect(reranked.map(candidate => candidate.id)).toEqual(["a", "missing", "b"])
  })

  test("#given limit smaller than pool → clips output size", () => {
    // #given
    const candidates = [
      makeCandidate("a", 1.0),
      makeCandidate("b", 0.9),
      makeCandidate("c", 0.8),
    ]
    const embeddings = new Map<string, Float32Array>([
      ["a", new Float32Array([1, 0])],
      ["b", new Float32Array([0.999, 0.001])],
      ["c", new Float32Array([0, 1])],
    ])
    const queryEmbedding = new Float32Array([1, 0])

    // #when
    const reranked = mmrRerank(candidates, embeddings, queryEmbedding, 0.7, 2)

    // #then
    expect(reranked.length).toBe(2)
    expect(reranked.map(candidate => candidate.id)).toEqual(["a", "c"])
  })
})
