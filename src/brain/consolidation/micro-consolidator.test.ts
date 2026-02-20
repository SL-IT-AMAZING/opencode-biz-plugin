import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createMicroConsolidator } from "./micro-consolidator"
import { createWorkingMemoryWriter } from "./working-memory-writer"
import type { AkashicEvent } from "../types"
import type { AkashicLogger, AkashicReader } from "../akashic/types"
import type { BrainPaths } from "../vault/paths"
import type { BrainConsolidationConfig } from "../config"
import type { SessionEntry } from "./types"

class FakeAkashicReader implements AkashicReader {
  public events: AkashicEvent[] = []
  public shouldThrow = false

  async readDate(): Promise<AkashicEvent[]> {
    return []
  }

  async readRange(): Promise<AkashicEvent[]> {
    if (this.shouldThrow) {
      throw new Error("readRange failed")
    }
    return this.events
  }

  async queryByType(): Promise<AkashicEvent[]> {
    return []
  }

  async queryByPath(): Promise<AkashicEvent[]> {
    return []
  }

  async count(): Promise<number> {
    return this.events.length
  }
}

class FakeAkashicLogger implements AkashicLogger {
  public logged: Array<Omit<AkashicEvent, "id" | "timestamp">> = []
  public shouldThrow = false

  async log(event: Omit<AkashicEvent, "id" | "timestamp">): Promise<AkashicEvent> {
    this.logged.push(event)
    if (this.shouldThrow) {
      throw new Error("logger failed")
    }

    return {
      ...event,
      id: `evt-${this.logged.length}`,
      timestamp: new Date().toISOString(),
    }
  }

  async flush(): Promise<void> {
    return
  }

  getLogPath(): string {
    return ""
  }

  async close(): Promise<void> {
    return
  }
}

function makePaths(rootDir: string): BrainPaths {
  const brainDir = join(rootDir, "_brain")
  const workingDir = join(brainDir, "working")
  const archiveDir = join(brainDir, "archive")

  return {
    vault: rootDir,
    brain: brainDir,
    working: workingDir,
    daily: join(brainDir, "memory", "daily"),
    akashicDaily: join(brainDir, "akashic", "daily"),
    index: join(brainDir, "index"),
    locks: join(brainDir, "locks"),
    weeklyArchive: join(archiveDir, "weekly"),
    monthlyArchive: join(archiveDir, "monthly"),
    quarterlyArchive: join(archiveDir, "quarterly"),
    soulFile: join(brainDir, "soul.md"),
    configFile: join(brainDir, "config.md"),
    readmeFile: join(brainDir, "README.md"),
    dbFile: join(brainDir, "index", "brain.sqlite"),
    stateFile: join(brainDir, "index", "state.json"),
    lockFile: join(brainDir, "locks", "writer.lock"),
  }
}

function makeConfig(overrides: Partial<BrainConsolidationConfig> = {}): BrainConsolidationConfig {
  return {
    micro_interval_minutes: 30,
    sleep_hour: 3,
    decay_half_life_days: 30,
    evergreen_tags: ["evergreen"],
    ...overrides,
  }
}

function makeEvent(overrides: Partial<AkashicEvent> & Pick<AkashicEvent, "id" | "timestamp" | "type" | "source" | "priority" | "data">): AkashicEvent {
  return {
    ...overrides,
  }
}

async function writeSessionEntries(workingDir: string, entries: SessionEntry[]): Promise<void> {
  await mkdir(workingDir, { recursive: true })
  await writeFile(join(workingDir, "session.json"), JSON.stringify({ entries }, null, 2), "utf8")
}

describe("brain/consolidation/micro-consolidator", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-micro-consolidator-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given no prior state #when consolidate called #then creates working memory snapshot", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const reader = new FakeAkashicReader()
    const logger = new FakeAkashicLogger()
    const consolidator = createMicroConsolidator({ paths, akashicReader: reader, akashicLogger: logger, config: makeConfig() })

    // #when
    const result = await consolidator.consolidate()
    const writer = createWorkingMemoryWriter(paths.working)
    const snapshot = await writer.readSnapshot(result.workingMemory.session_id)

    // #then
    expect(snapshot).not.toBeNull()
    expect(snapshot?.session_id).toBe(result.workingMemory.session_id)
    expect(result.eventsProcessed).toBe(0)
    expect(result.entriesProcessed).toBe(0)
  })

  test("#given no prior state #when consolidate called #then generates session ID", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate()

    // #then
    expect(result.workingMemory.session_id).toMatch(/^ses-\d{8}-\d{6}-[0-9a-f]{4}$/)
  })

  test("#given session entries exist #when consolidate #then decisions extracted correctly", async () => {
    // #given
    const paths = makePaths(tempDir)
    const entries: SessionEntry[] = [
      {
        type: "decision",
        content: "Use working memory snapshots",
        timestamp: "2026-02-20T10:00:00.000Z",
        reasoning: "Keeps state resumable",
        confidence: "high",
      },
      {
        type: "decision",
        content: "Retain fallback behavior",
        timestamp: "2026-02-20T10:10:00.000Z",
      },
    ]
    await writeSessionEntries(paths.working, entries)
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-test-decisions")

    // #then
    expect(result.workingMemory.decisions).toEqual([
      {
        timestamp: "2026-02-20T10:10:00.000Z",
        decision: "Retain fallback behavior",
        reasoning: "No reasoning",
        confidence: "medium",
      },
      {
        timestamp: "2026-02-20T10:00:00.000Z",
        decision: "Use working memory snapshots",
        reasoning: "Keeps state resumable",
        confidence: "high",
      },
    ])
  })

  test("#given akashic events exist #when consolidate #then active files populated", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const reader = new FakeAkashicReader()
    reader.events = [
      makeEvent({
        id: "evt-1",
        timestamp: "2026-02-20T10:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "src/brain/consolidation/micro-consolidator.ts" },
      }),
      makeEvent({
        id: "evt-2",
        timestamp: "2026-02-20T10:05:00.000Z",
        type: "file.created",
        source: "thalamus",
        priority: 40,
        data: { path: "src/brain/consolidation/micro-consolidator.test.ts" },
      }),
    ]
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: reader,
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-active-files")

    // #then
    expect(result.workingMemory.active_files).toEqual([
      "src/brain/consolidation/micro-consolidator.test.ts",
      "src/brain/consolidation/micro-consolidator.ts",
    ])
  })

  test("#given prior cursor exists #when consolidate #then cursor updated with incremented count", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const sessionId = "ses-cursor"
    const writer = createWorkingMemoryWriter(paths.working)
    await writer.writeCursor({
      lastConsolidatedAt: "2026-02-20T09:00:00.000Z",
      lastEventId: "evt-old",
      sessionId,
      consolidationCount: 2,
    })

    const reader = new FakeAkashicReader()
    reader.events = [
      makeEvent({
        id: "evt-old",
        timestamp: "2026-02-20T09:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 10,
        data: { path: "docs/old.md" },
      }),
      makeEvent({
        id: "evt-new",
        timestamp: "2026-02-20T09:10:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 10,
        data: { path: "docs/new.md" },
      }),
    ]
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: reader,
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    await consolidator.consolidate(sessionId)
    const updatedCursor = await writer.readCursor(sessionId)

    // #then
    expect(updatedCursor).not.toBeNull()
    expect(updatedCursor?.consolidationCount).toBe(3)
    expect(updatedCursor?.lastEventId).toBe("evt-new")
  })

  test("#given no events and no entries #when consolidate #then returns empty but valid WorkingMemory", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-empty")

    // #then
    expect(result.workingMemory.session_id).toBe("ses-empty")
    expect(result.workingMemory.active_files).toEqual([])
    expect(result.workingMemory.decisions).toEqual([])
    expect(result.workingMemory.scratch).toBe("")
    expect(result.workingMemory.retrieval_log).toEqual([])
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("#given activity count below threshold #when shouldConsolidate #then returns false", () => {
    // #given
    const consolidator = createMicroConsolidator({
      paths: makePaths(tempDir),
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    for (let index = 0; index < 19; index += 1) {
      consolidator.notifyActivity()
    }
    const shouldConsolidate = consolidator.shouldConsolidate()

    // #then
    expect(shouldConsolidate).toBe(false)
  })

  test("#given activity count above 200 #when shouldConsolidate #then returns true", () => {
    // #given
    const consolidator = createMicroConsolidator({
      paths: makePaths(tempDir),
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    for (let index = 0; index < 200; index += 1) {
      consolidator.notifyActivity()
    }
    const shouldConsolidate = consolidator.shouldConsolidate()

    // #then
    expect(shouldConsolidate).toBe(true)
  })

  test("#given elapsed time exceeds interval with some activity #when shouldConsolidate #then returns true", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig({ micro_interval_minutes: 0 }),
    })
    await consolidator.consolidate("ses-interval")

    // #when
    for (let index = 0; index < 5; index += 1) {
      consolidator.notifyActivity()
    }
    const shouldConsolidate = consolidator.shouldConsolidate()

    // #then
    expect(shouldConsolidate).toBe(true)
  })

  test("#given notifyActivity called N times #when shouldConsolidate checked #then reflects count", () => {
    // #given
    const consolidator = createMicroConsolidator({
      paths: makePaths(tempDir),
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    for (let index = 0; index < 20; index += 1) {
      consolidator.notifyActivity()
    }
    const shouldConsolidate = consolidator.shouldConsolidate()

    // #then
    expect(shouldConsolidate).toBe(true)
  })

  test("#given akashicReader throws #when consolidate #then gracefully returns with 0 events", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const reader = new FakeAkashicReader()
    reader.shouldThrow = true
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: reader,
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-read-error")

    // #then
    expect(result.eventsProcessed).toBe(0)
    expect(result.workingMemory.active_files).toEqual([])
    expect(result.workingMemory.context_summary).toBe("No activity recorded yet.")
  })

  test("#given consolidate succeeds #when memory.consolidated event logged #then event has correct metadata", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    await writeSessionEntries(paths.working, [
      {
        type: "scratch",
        content: "Track follow-up",
        timestamp: "2026-02-20T11:00:00.000Z",
      },
    ])

    const reader = new FakeAkashicReader()
    reader.events = [
      makeEvent({
        id: "evt-a",
        timestamp: "2026-02-20T11:01:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 25,
        data: { metadata: { query: "cursor", results_count: 2 } },
      }),
    ]
    const logger = new FakeAkashicLogger()
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: reader,
      akashicLogger: logger,
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-log")
    const event = logger.logged.at(-1)

    // #then
    expect(event?.type).toBe("memory.consolidated")
    expect(event?.source).toBe("consolidator")
    expect(event?.priority).toBe(50)
    expect(event?.data.metadata).toEqual({
      session_id: "ses-log",
      events_processed: 1,
      entries_processed: 1,
      consolidation_count: 1,
    })
    expect(result.timestamp).toBeDefined()
  })

  test("#given explicit sessionId provided #when consolidate #then uses provided sessionId", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    const result = await consolidator.consolidate("ses-explicit")

    // #then
    expect(result.workingMemory.session_id).toBe("ses-explicit")
  })

  test("#given markdown file written #when readSnapshot #then json still accessible", async () => {
    // #given
    const paths = makePaths(tempDir)
    await mkdir(paths.working, { recursive: true })
    const sessionId = "ses-markdown"
    const consolidator = createMicroConsolidator({
      paths,
      akashicReader: new FakeAkashicReader(),
      akashicLogger: new FakeAkashicLogger(),
      config: makeConfig(),
    })

    // #when
    await consolidator.consolidate(sessionId)
    const writer = createWorkingMemoryWriter(paths.working)
    const snapshot = await writer.readSnapshot(sessionId)
    const markdownPath = join(paths.working, `${sessionId}.working_memory.md`)
    const markdown = await readFile(markdownPath, "utf8")

    // #then
    expect(snapshot).not.toBeNull()
    expect(snapshot?.session_id).toBe(sessionId)
    expect(markdown).toContain("# Working Memory")
  })
})
