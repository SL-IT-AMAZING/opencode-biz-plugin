import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir } from "node:fs/promises"
import { rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBrainPaths, type BrainPaths } from "../vault/paths"
import { createBrainDatabase } from "./db"
import { createMarkdownIndexer } from "./indexer"
import type { BrainDatabase, MarkdownIndexer } from "./types"

describe("brain/search/indexer", () => {
  let tmpDir: string
  let paths: BrainPaths
  let db: BrainDatabase
  let indexer: MarkdownIndexer

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "brain-indexer-test-"))
    paths = createBrainPaths(tmpDir)
    await mkdir(paths.index, { recursive: true })
    db = createBrainDatabase(paths)
    indexer = createMarkdownIndexer(db, paths)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("#when indexFile → creates chunks in database", async () => {
    // #given
    const filePath = join(tmpDir, "test.md")
    await Bun.write(
      filePath,
      "# Test Document\n\nThis is a test document with enough content to produce at least one chunk when processed by the markdown chunker.",
    )

    // #when
    const result = await indexer.indexFile(filePath)

    // #then
    expect(result.skipped).toBe(false)
    expect(result.chunks).toBeGreaterThan(0)
    expect(result.path).toBe("test.md")

    const stored = db.getChunks("test.md")
    expect(stored.length).toBe(result.chunks)
  })

  test("#when indexFile same content twice → skips (returns skipped: true)", async () => {
    // #given
    const filePath = join(tmpDir, "unchanged.md")
    await Bun.write(
      filePath,
      "# Unchanged Document\n\nThis document stays the same between indexing runs and should be skipped on re-index.",
    )
    await indexer.indexFile(filePath)

    // #when
    const result = await indexer.indexFile(filePath)

    // #then
    expect(result.skipped).toBe(true)
    expect(result.reason).toBe("unchanged")
  })

  test("#when indexFile modified content → re-indexes", async () => {
    // #given
    const filePath = join(tmpDir, "modified.md")
    await Bun.write(
      filePath,
      "# Original Document\n\nThis is the original version of the document content for initial indexing.",
    )
    const firstResult = await indexer.indexFile(filePath)
    expect(firstResult.skipped).toBe(false)

    // #when
    await Bun.write(
      filePath,
      "# Updated Document\n\nThis is the completely rewritten version with different content that should trigger re-indexing.",
    )
    const secondResult = await indexer.indexFile(filePath)

    // #then
    expect(secondResult.skipped).toBe(false)
    expect(secondResult.chunks).toBeGreaterThan(0)

    const stored = db.getChunks("modified.md")
    expect(stored[0].content).toContain("rewritten")
  })

  test("#when removeFile → removes from database", async () => {
    // #given
    const filePath = join(tmpDir, "removable.md")
    await Bun.write(
      filePath,
      "# Removable Document\n\nThis document will be removed from the database after being indexed initially.",
    )
    await indexer.indexFile(filePath)
    expect(db.getChunks("removable.md").length).toBeGreaterThan(0)

    // #when
    indexer.removeFile(filePath)

    // #then
    expect(db.getChunks("removable.md")).toEqual([])
    expect(db.getFileState("removable.md")).toBeUndefined()
  })

  test("#when fullScan → indexes all matching files", async () => {
    // #given
    await Bun.write(
      join(tmpDir, "hello.md"),
      "# Hello World\n\nThis is a hello world document with sufficient content for chunk creation by the indexer.",
    )
    await Bun.write(
      join(tmpDir, "guide.md"),
      "# Quick Guide\n\nThis guide covers the basics of using the system and includes enough text to pass chunking.",
    )

    // #when
    const result = await indexer.fullScan(paths.vault, ["**/*.md"])

    // #then
    expect(result.indexed).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors.length).toBe(0)

    expect(db.getChunks("hello.md").length).toBeGreaterThan(0)
    expect(db.getChunks("guide.md").length).toBeGreaterThan(0)
  })

  test("#when fullScan → removes stale entries for deleted files", async () => {
    // #given
    const keepPath = join(tmpDir, "keep.md")
    const deletePath = join(tmpDir, "delete-me.md")
    await Bun.write(
      keepPath,
      "# Keep This\n\nThis document should remain in the database after the second full scan operation.",
    )
    await Bun.write(
      deletePath,
      "# Delete Me\n\nThis document will be deleted from disk before the second full scan to test stale removal.",
    )
    await indexer.fullScan(paths.vault, ["**/*.md"])
    expect(db.getChunks("delete-me.md").length).toBeGreaterThan(0)

    // #when
    unlinkSync(deletePath)
    const result = await indexer.fullScan(paths.vault, ["**/*.md"])

    // #then
    expect(result.removed).toBe(1)
    expect(result.skipped).toBe(1)
    expect(db.getChunks("delete-me.md")).toEqual([])
    expect(db.getChunks("keep.md").length).toBeGreaterThan(0)
  })

  test("#then getState returns correct IndexState", async () => {
    // #given
    await Bun.write(
      join(tmpDir, "state-test.md"),
      "# State Test\n\nDocument used for verifying the getState method returns the correct IndexState structure.",
    )
    await indexer.indexFile(join(tmpDir, "state-test.md"))

    // #when
    const state = indexer.getState()

    // #then
    expect(state.schema_version).toBe(1)
    expect(state.last_full_scan).toBeDefined()
    expect(state.files["state-test.md"]).toBeDefined()
    expect(state.files["state-test.md"].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(state.files["state-test.md"].chunk_count).toBeGreaterThan(0)
    expect(state.files["state-test.md"].mtime).toBeGreaterThan(0)
    expect(state.files["state-test.md"].last_indexed).toBeDefined()
  })
})
