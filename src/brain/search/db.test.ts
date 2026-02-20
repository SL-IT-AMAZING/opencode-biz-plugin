import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir } from "node:fs/promises"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBrainPaths, type BrainPaths } from "../vault/paths"
import { createBrainDatabase } from "./db"
import type { BrainDatabase, ChunkInsert, FileIndexState } from "./types"

function makeHash(content: string): string {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex")
}

function makeChunks(contents: string[]): ChunkInsert[] {
  return contents.map((content, i) => ({
    content,
    chunk_index: i,
    content_hash: makeHash(content),
    is_evergreen: false,
  }))
}

describe("brain/search/db", () => {
  let tmpDir: string
  let paths: BrainPaths
  let db: BrainDatabase
  let dbClosed: boolean

  beforeEach(async () => {
    dbClosed = false
    tmpDir = await mkdtemp(join(tmpdir(), "brain-db-test-"))
    paths = createBrainPaths(tmpDir)
    await mkdir(paths.index, { recursive: true })
    db = createBrainDatabase(paths)
  })

  afterEach(() => {
    if (!dbClosed) db.close()
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test("#given new database → creates SQLite file at paths.dbFile", () => {
    // #then
    expect(existsSync(paths.dbFile)).toBe(true)
  })

  test("#when upsertChunks → stores chunks retrievable via getChunks", () => {
    // #given
    const chunks = makeChunks([
      "First chunk of content about JavaScript and web development frameworks.",
      "Second chunk of content about TypeScript and type safety in applications.",
    ])

    // #when
    db.upsertChunks("docs/test.md", chunks)

    // #then
    const stored = db.getChunks("docs/test.md")
    expect(stored.length).toBe(2)
    expect(stored[0].content).toBe(chunks[0].content)
    expect(stored[0].chunk_index).toBe(0)
    expect(stored[0].content_hash).toBe(chunks[0].content_hash)
    expect(stored[0].is_evergreen).toBe(false)
    expect(stored[1].content).toBe(chunks[1].content)
    expect(stored[1].chunk_index).toBe(1)
  })

  test("#when upsertChunks same path twice → replaces old chunks", () => {
    // #given
    const oldChunks = makeChunks(["Old content that will be replaced during the upsert operation."])
    db.upsertChunks("docs/replace.md", oldChunks)

    const newChunks = makeChunks([
      "New first chunk after replacement with completely different text content.",
      "New second chunk added during the replacement operation with more details.",
    ])

    // #when
    db.upsertChunks("docs/replace.md", newChunks)

    // #then
    const stored = db.getChunks("docs/replace.md")
    expect(stored.length).toBe(2)
    expect(stored[0].content).toBe(newChunks[0].content)
    expect(stored[1].content).toBe(newChunks[1].content)
  })

  test("#when removeFile → removes chunks and file state", () => {
    // #given
    const chunks = makeChunks(["Content that will be removed from the database shortly."])
    db.upsertChunks("docs/remove.md", chunks)
    db.setFileState("docs/remove.md", {
      hash: "abc123",
      mtime: Date.now(),
      chunk_count: 1,
      last_indexed: new Date().toISOString(),
    })

    // #when
    db.removeFile("docs/remove.md")

    // #then
    expect(db.getChunks("docs/remove.md")).toEqual([])
    expect(db.getFileState("docs/remove.md")).toBeUndefined()
  })

  test("#when setFileState + getFileState → round-trips correctly", () => {
    // #given
    const state: FileIndexState = {
      hash: "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      mtime: 1700000000000,
      chunk_count: 5,
      last_indexed: "2025-01-15T10:30:00.000Z",
    }

    // #when
    db.setFileState("docs/state.md", state)
    const retrieved = db.getFileState("docs/state.md")

    // #then
    expect(retrieved).toBeDefined()
    expect(retrieved!.hash).toBe(state.hash)
    expect(retrieved!.mtime).toBe(state.mtime)
    expect(retrieved!.chunk_count).toBe(state.chunk_count)
    expect(retrieved!.last_indexed).toBe(state.last_indexed)
  })

  test("#when getAllFileStates → returns all file states", () => {
    // #given
    const stateA: FileIndexState = {
      hash: "aaa",
      mtime: 1000,
      chunk_count: 2,
      last_indexed: "2025-01-01T00:00:00.000Z",
    }
    const stateB: FileIndexState = {
      hash: "bbb",
      mtime: 2000,
      chunk_count: 3,
      last_indexed: "2025-01-02T00:00:00.000Z",
    }
    db.setFileState("docs/a.md", stateA)
    db.setFileState("docs/b.md", stateB)

    // #when
    const allStates = db.getAllFileStates()

    // #then
    expect(Object.keys(allStates).length).toBe(2)
    expect(allStates["docs/a.md"].hash).toBe("aaa")
    expect(allStates["docs/b.md"].hash).toBe("bbb")
    expect(allStates["docs/b.md"].chunk_count).toBe(3)
  })

  test("#when getStats → returns correct counts", () => {
    // #given
    db.upsertChunks("docs/one.md", makeChunks(["Chunk A content for the first file in the database."]))
    db.upsertChunks("docs/two.md", makeChunks([
      "Chunk B content for the second file, first chunk in that file.",
      "Chunk C content for the second file, second chunk in that file.",
    ]))

    // #when
    const stats = db.getStats()

    // #then
    expect(stats.totalChunks).toBe(3)
    expect(stats.totalFiles).toBe(2)
    expect(stats.dbSizeBytes).toBeGreaterThan(0)
  })

  test("#when close → no errors", () => {
    // #given
    const stats = db.getStats()
    expect(stats).toBeDefined()

    // #when
    db.close()
    dbClosed = true

    // #then
    expect(existsSync(paths.dbFile)).toBe(true)
  })

  test("#when setEmbedding + getEmbedding → round-trips correctly", () => {
    // #given
    const chunks = makeChunks(["Chunk for embedding test with enough content."])
    db.upsertChunks("docs/embed.md", chunks)
    const stored = db.getChunks("docs/embed.md")
    const chunkId = Number(stored[0].id)
    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer)

    // #when
    db.setEmbedding(chunkId, embedding, "test-model-v1")

    // #then
    const result = db.getEmbedding(chunkId)
    expect(result).toBeDefined()
    expect(result!.model).toBe("test-model-v1")
    const f32 = new Float32Array(result!.embedding.buffer, result!.embedding.byteOffset, result!.embedding.byteLength / 4)
    expect(f32[0]).toBeCloseTo(0.1)
    expect(f32[1]).toBeCloseTo(0.2)
    expect(f32[2]).toBeCloseTo(0.3)
    expect(f32[3]).toBeCloseTo(0.4)
  })

  test("#when getEmbedding on chunk without embedding → returns undefined", () => {
    // #given
    const chunks = makeChunks(["Chunk without embedding data yet."])
    db.upsertChunks("docs/no-embed.md", chunks)
    const stored = db.getChunks("docs/no-embed.md")
    const chunkId = Number(stored[0].id)

    // #when
    const result = db.getEmbedding(chunkId)

    // #then
    expect(result).toBeUndefined()
  })

  test("#when getAllEmbeddingsForSearch → returns only chunks with embeddings", () => {
    // #given
    const chunks = makeChunks([
      "First chunk eligible for embedding.",
      "Second chunk eligible for embedding.",
      "Third chunk left without embedding.",
    ])
    db.upsertChunks("docs/all-embeddings.md", chunks)
    const stored = db.getChunks("docs/all-embeddings.md")
    db.setEmbedding(Number(stored[0].id), Buffer.from(new Float32Array([1, 2, 3, 4]).buffer), "model-x")
    db.setEmbedding(Number(stored[1].id), Buffer.from(new Float32Array([5, 6, 7, 8]).buffer), "model-x")

    // #when
    const allEmbeddings = db.getAllEmbeddingsForSearch()

    // #then
    expect(allEmbeddings.length).toBe(2)
    const returnedIds = allEmbeddings.map((entry) => entry.id).sort((a, b) => a - b)
    expect(returnedIds).toEqual([Number(stored[0].id), Number(stored[1].id)].sort((a, b) => a - b))
  })

  test("#when getChunksNeedingEmbedding → returns chunks without embeddings or different model", () => {
    // #given
    const chunks = makeChunks([
      "Model test chunk one.",
      "Model test chunk two.",
      "Model test chunk three.",
    ])
    db.upsertChunks("docs/model-check.md", chunks)
    const stored = db.getChunks("docs/model-check.md")
    db.setEmbedding(Number(stored[0].id), Buffer.from(new Float32Array([0.01, 0.02, 0.03, 0.04]).buffer), "model-a")

    // #when
    const needsModelA = db.getChunksNeedingEmbedding("model-a")
    const needsModelB = db.getChunksNeedingEmbedding("model-b")

    // #then
    expect(needsModelA.length).toBe(2)
    expect(needsModelA.every((entry) => entry.id !== Number(stored[0].id))).toBe(true)
    expect(needsModelB.length).toBe(3)
  })

  test("#when clearEmbeddings → removes all embeddings", () => {
    // #given
    const chunks = makeChunks([
      "Embedding clear test chunk one.",
      "Embedding clear test chunk two.",
    ])
    db.upsertChunks("docs/clear-embeddings.md", chunks)
    const stored = db.getChunks("docs/clear-embeddings.md")
    const firstId = Number(stored[0].id)
    const secondId = Number(stored[1].id)
    db.setEmbedding(firstId, Buffer.from(new Float32Array([9, 8, 7, 6]).buffer), "model-clear")
    db.setEmbedding(secondId, Buffer.from(new Float32Array([6, 7, 8, 9]).buffer), "model-clear")

    // #when
    db.clearEmbeddings()

    // #then
    expect(db.getEmbedding(firstId)).toBeUndefined()
    expect(db.getEmbedding(secondId)).toBeUndefined()
    expect(db.getAllEmbeddingsForSearch()).toEqual([])
  })
})
