import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir } from "node:fs/promises"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBrainPaths } from "../vault/paths"
import { createBrainDatabase } from "./db"
import { createFtsSearcher } from "./fts"
import type { BrainDatabase, ChunkInsert, FtsSearcher } from "./types"

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

describe("brain/search/fts", () => {
  let tmpDir: string
  let db: BrainDatabase
  let fts: FtsSearcher

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "brain-fts-test-"))
    const paths = createBrainPaths(tmpDir)
    await mkdir(paths.index, { recursive: true })
    db = createBrainDatabase(paths)

    db.upsertChunks(
      "docs/javascript.md",
      makeChunks([
        "JavaScript is a dynamic programming language used extensively for web development and browser scripting.",
        "Node.js allows JavaScript to run on the server side enabling full-stack development with a single language.",
      ]),
    )

    db.upsertChunks(
      "docs/python.md",
      makeChunks([
        "Python is a versatile programming language popular in data science and machine learning applications.",
        "Django and Flask are popular Python web frameworks used for building scalable server applications.",
      ]),
    )

    db.upsertChunks(
      "notes/cooking.md",
      makeChunks([
        "Italian pasta recipes require fresh ingredients like tomatoes, basil, and high quality olive oil for the best flavor.",
      ]),
    )

    fts = createFtsSearcher(db.raw)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("#given indexed content → search finds matching chunks", () => {
    // #when
    const results = fts.search("JavaScript")

    // #then
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.content.includes("JavaScript"))).toBe(true)
  })

  test("#given query matching nothing → returns empty array", () => {
    // #when
    const results = fts.search("xyzzyplughnonexistent")

    // #then
    expect(results).toEqual([])
  })

  test("#when searchByPath → filters by path", () => {
    // #when
    const results = fts.searchByPath("programming", "docs/python.md")

    // #then
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.path).toBe("docs/python.md")
    }
  })

  test("#when highlight → returns highlighted snippets with <mark> tags", () => {
    // #when
    const results = fts.highlight("JavaScript")

    // #then
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].highlighted).toContain("<mark>")
    expect(results[0].highlighted).toContain("</mark>")
  })

  test("#given empty query → returns empty array", () => {
    // #when
    const results = fts.search("")

    // #then
    expect(results).toEqual([])
  })

  test("#then results have positive fts_score (BM25 negated)", () => {
    // #when
    const results = fts.search("programming language")

    // #then
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.fts_score).toBeGreaterThan(0)
    }
  })

  test("#then results sorted by relevance (highest score first)", () => {
    // #when
    const results = fts.search("programming")

    // #then
    expect(results.length).toBeGreaterThan(1)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].fts_score).toBeLessThanOrEqual(results[i - 1].fts_score)
    }
  })
})
