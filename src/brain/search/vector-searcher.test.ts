import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir } from "node:fs/promises"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBrainPaths } from "../vault/paths"
import { createBrainDatabase } from "./db"
import { createVectorSearcher } from "./vector-searcher"
import { serializeEmbedding } from "./embedding-store"
import type { BrainDatabase } from "./types"
import type { BrainPaths } from "../vault/paths"

function makeEmbedding(dims: number, dominantIndex: number): Float32Array {
  const arr = new Float32Array(dims)
  arr[dominantIndex] = 1
  return arr
}

function makeHash(content: string): string {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

describe("brain/search/vector-searcher", () => {
  let tmpDir: string
  let paths: BrainPaths
  let db: BrainDatabase

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "brain-vec-test-"))
    paths = createBrainPaths(tmpDir)
    await mkdir(paths.index, { recursive: true })
    db = createBrainDatabase(paths)
  })

  afterEach(() => {
    db.close()
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  function insertWithEmbedding(path: string, contents: string[], embeddings: Float32Array[]) {
    const chunks = contents.map((content, i) => ({
      content,
      chunk_index: i,
      content_hash: makeHash(content),
      is_evergreen: false,
    }))

    db.upsertChunks(path, chunks)
    const stored = db.getChunks(path)
    for (let i = 0; i < stored.length; i++) {
      db.setEmbedding(Number(stored[i].id), serializeEmbedding(embeddings[i]), "test-model")
    }
  }

  test("#given no embeddings → search returns empty array", () => {
    const searcher = createVectorSearcher(db, 4)

    const results = searcher.search(makeEmbedding(4, 0))

    expect(results).toEqual([])
  })

  test("#given 3 embeddings → search returns sorted by cosine similarity desc", () => {
    insertWithEmbedding("docs/alpha.md", ["alpha"], [makeEmbedding(4, 0)])
    insertWithEmbedding("docs/beta.md", ["beta"], [makeEmbedding(4, 1)])
    insertWithEmbedding("docs/gamma.md", ["gamma"], [makeEmbedding(4, 2)])

    const searcher = createVectorSearcher(db, 4)
    const query = makeEmbedding(4, 1)

    const results = searcher.search(query, 3)

    expect(results.length).toBe(3)
    expect(results[0].path).toBe("docs/beta.md")
    expect(results[0].vec_score).toBeCloseTo(1)
    expect(results[1].vec_score).toBeLessThanOrEqual(results[0].vec_score)
    expect(results[2].vec_score).toBeLessThanOrEqual(results[1].vec_score)
  })

  test("#given query similar to first doc → first doc has highest vec_score", () => {
    insertWithEmbedding("docs/first.md", ["first"], [makeEmbedding(4, 0)])
    insertWithEmbedding("docs/second.md", ["second"], [makeEmbedding(4, 1)])

    const searcher = createVectorSearcher(db, 4)
    const query = makeEmbedding(4, 0)

    const results = searcher.search(query, 2)

    expect(results[0].path).toBe("docs/first.md")
    expect(results[0].vec_score).toBeGreaterThan(results[1].vec_score)
  })

  test("#given limit=1 → returns only 1 result", () => {
    insertWithEmbedding("docs/one.md", ["one"], [makeEmbedding(4, 0)])
    insertWithEmbedding("docs/two.md", ["two"], [makeEmbedding(4, 1)])

    const searcher = createVectorSearcher(db, 4)

    const results = searcher.search(makeEmbedding(4, 0), 1)

    expect(results.length).toBe(1)
  })

  test("#given searchByPath → filters to matching path only", () => {
    insertWithEmbedding("docs/a.md", ["a0", "a1"], [makeEmbedding(4, 0), makeEmbedding(4, 1)])
    insertWithEmbedding("docs/b.md", ["b0"], [makeEmbedding(4, 0)])

    const searcher = createVectorSearcher(db, 4)

    const results = searcher.searchByPath(makeEmbedding(4, 0), "docs/a.md", 10)

    expect(results.length).toBe(2)
    expect(results.every((result) => result.path === "docs/a.md")).toBe(true)
  })

  test("#given cache enabled → second search reuses loaded embeddings", () => {
    insertWithEmbedding("docs/cache.md", ["cache"], [makeEmbedding(4, 0)])

    let loadCalls = 0
    const original = db.getAllEmbeddingsForSearch.bind(db)
    db.getAllEmbeddingsForSearch = () => {
      loadCalls += 1
      return original()
    }

    const searcher = createVectorSearcher(db, 4, true)
    searcher.search(makeEmbedding(4, 0))
    searcher.search(makeEmbedding(4, 0))

    expect(loadCalls).toBe(1)
  })

  test("#given invalidateCache → next search reloads from DB", () => {
    insertWithEmbedding("docs/cache-reset.md", ["cache reset"], [makeEmbedding(4, 0)])

    let loadCalls = 0
    const original = db.getAllEmbeddingsForSearch.bind(db)
    db.getAllEmbeddingsForSearch = () => {
      loadCalls += 1
      return original()
    }

    const searcher = createVectorSearcher(db, 4, true)
    searcher.search(makeEmbedding(4, 0))
    searcher.invalidateCache()
    searcher.search(makeEmbedding(4, 0))

    expect(loadCalls).toBe(2)
  })

  test("#given cache disabled → each search loads from DB", () => {
    insertWithEmbedding("docs/no-cache.md", ["no cache"], [makeEmbedding(4, 0)])

    let loadCalls = 0
    const original = db.getAllEmbeddingsForSearch.bind(db)
    db.getAllEmbeddingsForSearch = () => {
      loadCalls += 1
      return original()
    }

    const searcher = createVectorSearcher(db, 4, false)
    searcher.search(makeEmbedding(4, 0))
    searcher.search(makeEmbedding(4, 0))

    expect(loadCalls).toBe(2)
  })

  test("#given embeddings with different paths → searchByPath isolates correctly", () => {
    insertWithEmbedding("docs/isolated-a.md", ["a0", "a1"], [makeEmbedding(4, 0), makeEmbedding(4, 1)])
    insertWithEmbedding("docs/isolated-b.md", ["b0", "b1"], [makeEmbedding(4, 2), makeEmbedding(4, 3)])

    const searcher = createVectorSearcher(db, 4)

    const resultsA = searcher.searchByPath(makeEmbedding(4, 0), "docs/isolated-a.md", 10)
    const resultsB = searcher.searchByPath(makeEmbedding(4, 0), "docs/isolated-b.md", 10)

    expect(resultsA.length).toBe(2)
    expect(resultsB.length).toBe(2)
    expect(resultsA.every((result) => result.path === "docs/isolated-a.md")).toBe(true)
    expect(resultsB.every((result) => result.path === "docs/isolated-b.md")).toBe(true)
  })
})
