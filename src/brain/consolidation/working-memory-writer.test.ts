import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkingMemoryWriter } from "./working-memory-writer"
import type { ConsolidationCursor } from "./types"
import type { WorkingMemory } from "../types"

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return {
    session_id: "session-123",
    started_at: "2025-08-01T10:00:00.000Z",
    updated_at: "2025-08-01T11:00:00.000Z",
    context_summary: "Session summary.",
    active_files: ["src/brain/consolidation/event-aggregator.ts", "README.md"],
    decisions: [
      {
        timestamp: "2025-08-01T10:45:00.000Z",
        decision: "Ship the consolidation writer",
        reasoning: "Needed for phase 7",
        confidence: "high",
      },
    ],
    scratch: "Check cursor compatibility",
    retrieval_log: [
      {
        query: "consolidation cursor",
        results_count: 4,
        timestamp: "2025-08-01T10:30:00.000Z",
      },
    ],
    ...overrides,
  }
}

function makeCursor(overrides: Partial<ConsolidationCursor> = {}): ConsolidationCursor {
  return {
    lastConsolidatedAt: "2025-08-01T11:00:00.000Z",
    lastEventId: "01HZ0000000000000000000001",
    sessionId: "session-123",
    consolidationCount: 3,
    ...overrides,
  }
}

describe("brain/consolidation/working-memory-writer", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given a working memory snapshot #when writing and reading #then roundtrips JSON", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const memory = makeMemory()

    // #when
    await writer.writeSnapshot(memory, memory.session_id)
    const readBack = await writer.readSnapshot(memory.session_id)

    // #then
    expect(readBack).toEqual(memory)
  })

  test("#given nonexistent snapshot file #when reading snapshot #then returns null", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)

    // #when
    const readBack = await writer.readSnapshot("missing-session")

    // #then
    expect(readBack).toBeNull()
  })

  test("#given corrupted snapshot JSON #when reading snapshot #then returns null", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const snapshotPath = join(tempDir, "session-123.working_memory.json")
    await writeFile(snapshotPath, "{not-valid-json", "utf8")

    // #when
    const readBack = await writer.readSnapshot("session-123")

    // #then
    expect(readBack).toBeNull()
  })

  test("#given a consolidation cursor #when writing and reading #then roundtrips cursor JSON", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const cursor = makeCursor()

    // #when
    await writer.writeCursor(cursor)
    const readBack = await writer.readCursor(cursor.sessionId)

    // #then
    expect(readBack).toEqual(cursor)
  })

  test("#given nonexistent cursor file #when reading cursor #then returns null", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)

    // #when
    const readBack = await writer.readCursor("missing-session")

    // #then
    expect(readBack).toBeNull()
  })

  test("#given full working memory #when rendering markdown #then includes all sections", () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const memory = makeMemory()

    // #when
    const markdown = writer.toMarkdown(memory)

    // #then
    expect(markdown).toContain("# Working Memory")
    expect(markdown).toContain("**Session**: session-123")
    expect(markdown).toContain("## Context Summary")
    expect(markdown).toContain("Session summary.")
    expect(markdown).toContain("## Active Files")
    expect(markdown).toContain("- src/brain/consolidation/event-aggregator.ts")
    expect(markdown).toContain("## Decisions")
    expect(markdown).toContain("1. [high] Ship the consolidation writer")
    expect(markdown).toContain("## Scratch")
    expect(markdown).toContain("Check cursor compatibility")
    expect(markdown).toContain("## Retrieval Log")
    expect(markdown).toContain("- [2025-08-01T10:30:00.000Z] \"consolidation cursor\" → 4 results")
  })

  test("#given empty arrays and scratch #when rendering markdown #then renders graceful empty messages", () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const memory = makeMemory({
      active_files: [],
      decisions: [],
      scratch: "",
      retrieval_log: [],
    })

    // #when
    const markdown = writer.toMarkdown(memory)

    // #then
    expect(markdown).toContain("No active files.")
    expect(markdown).toContain("No decisions recorded.")
    expect(markdown).toContain("No scratch notes.")
    expect(markdown).toContain("No searches recorded.")
  })

  test("#given snapshot write #when writing snapshot #then writes markdown file alongside JSON", async () => {
    // #given
    const writer = createWorkingMemoryWriter(tempDir)
    const memory = makeMemory()

    // #when
    await writer.writeSnapshot(memory, memory.session_id)

    // #then
    const markdownPath = join(tempDir, "session-123.working_memory.md")
    const markdown = await readFile(markdownPath, "utf8")
    expect(markdown).toContain("# Working Memory")
  })
})
