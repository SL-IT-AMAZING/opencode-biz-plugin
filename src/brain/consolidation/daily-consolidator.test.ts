import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDailyConsolidator, toMarkdown } from "./daily-consolidator"
import type { AkashicReader } from "../akashic/types"
import type { AkashicEvent, DailyMemory, WorkingMemory } from "../types"
import type { SessionEntry } from "./types"
import type { BrainPaths } from "../vault/paths"

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

class FakeAkashicReader implements AkashicReader {
  public eventsByDate = new Map<string, AkashicEvent[]>()

  async readDate(date: Date): Promise<AkashicEvent[]> {
    return this.eventsByDate.get(toDateKey(date)) ?? []
  }

  async readRange(): Promise<AkashicEvent[]> {
    return []
  }

  async queryByType(): Promise<AkashicEvent[]> {
    return []
  }

  async queryByPath(): Promise<AkashicEvent[]> {
    return []
  }

  async count(): Promise<number> {
    let total = 0
    for (const events of this.eventsByDate.values()) {
      total += events.length
    }
    return total
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
    ceo: join(brainDir, "ceo"),
    peopleStore: join(brainDir, "ceo", "people"),
    decisionsStore: join(brainDir, "ceo", "decisions"),
    commitmentsStore: join(brainDir, "ceo", "commitments"),
    ceoMeetings: join(brainDir, "ceo", "meetings"),
  }
}

function makeEvent(overrides: Partial<AkashicEvent> & Pick<AkashicEvent, "id" | "timestamp" | "type" | "source" | "priority" | "data">): AkashicEvent {
  return { ...overrides }
}

async function writeSessionEntries(workingDir: string, entries: SessionEntry[]): Promise<void> {
  await mkdir(workingDir, { recursive: true })
  await writeFile(join(workingDir, "session.json"), JSON.stringify({ entries }, null, 2), "utf8")
}

async function writeWorkingSnapshot(workingDir: string, snapshot: WorkingMemory): Promise<void> {
  await mkdir(workingDir, { recursive: true })
  await writeFile(
    join(workingDir, `${snapshot.session_id}.working_memory.json`),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  )
}

describe("brain/consolidation/daily-consolidator", () => {
  let tempDir: string
  let paths: BrainPaths
  let reader: FakeAkashicReader

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-daily-consolidator-"))
    paths = makePaths(tempDir)
    reader = new FakeAkashicReader()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given empty events for date #when consolidating #then returns no activity daily memory", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.eventsProcessed).toBe(0)
    expect(result.daily.date).toBe("2026-02-19")
    expect(result.daily.summary).toBe("No activity recorded.")
    expect(result.daily.files_changed).toEqual([])
  })

  test("#given file events #when consolidating #then files_changed populated with diff summaries", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    reader.eventsByDate.set("2026-02-19", [
      makeEvent({
        id: "evt-1",
        timestamp: "2026-02-19T10:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 50,
        data: { path: "src/auth/middleware.ts", diff_summary: "Updated auth checks" },
      }),
      makeEvent({
        id: "evt-2",
        timestamp: "2026-02-19T10:10:00.000Z",
        type: "file.created",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/notes.md" },
      }),
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.files_changed).toEqual([
      { path: "docs/notes.md", summary: "Modified" },
      { path: "src/auth/middleware.ts", summary: "Updated auth checks" },
    ])
  })

  test("#given decision entries #when consolidating #then key_decisions extracted", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    await writeSessionEntries(paths.working, [
      {
        type: "decision",
        content: "Use daily markdown output",
        reasoning: "Improves readability",
        confidence: "high",
        timestamp: "2026-02-19T09:00:00.000Z",
      },
      {
        type: "decision",
        content: "Ignore this older day",
        reasoning: "Wrong day",
        confidence: "low",
        timestamp: "2026-02-18T23:59:59.000Z",
      },
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.key_decisions).toEqual([
      { decision: "Use daily markdown output", context: "Improves readability" },
    ])
  })

  test("#given file paths #when consolidating #then topics extracted from directory segments", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    reader.eventsByDate.set("2026-02-19", [
      makeEvent({
        id: "evt-topic-1",
        timestamp: "2026-02-19T10:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "src/auth/middleware.ts" },
      }),
      makeEvent({
        id: "evt-topic-2",
        timestamp: "2026-02-19T10:01:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "docs/api/README.md" },
      }),
      makeEvent({
        id: "evt-topic-3",
        timestamp: "2026-02-19T10:02:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "src/auth/service.ts" },
      }),
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.topics[0]).toBe("auth")
    expect(result.daily.topics).toContain("docs")
    expect(result.daily.topics).toContain("api")
  })

  test("#given generic path segments #when consolidating #then generic segments are filtered", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    reader.eventsByDate.set("2026-02-19", [
      makeEvent({
        id: "evt-generic-1",
        timestamp: "2026-02-19T11:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "src/lib/cache/store.ts" },
      }),
      makeEvent({
        id: "evt-generic-2",
        timestamp: "2026-02-19T11:01:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "tests/unit/cache.test.ts" },
      }),
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.topics).not.toContain("src")
    expect(result.daily.topics).not.toContain("lib")
    expect(result.daily.topics).not.toContain("tests")
  })

  test("#given scratch entries with questions #when consolidating #then extracts question sentences", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    await writeSessionEntries(paths.working, [
      {
        type: "scratch",
        content: "Should we split this module? We need confidence. Done",
        timestamp: "2026-02-19T09:30:00.000Z",
      },
      {
        type: "scratch",
        content: "No question here.",
        timestamp: "2026-02-19T09:31:00.000Z",
      },
      {
        type: "scratch",
        content: "Should we split this module?",
        timestamp: "2026-02-19T09:32:00.000Z",
      },
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.open_questions).toEqual([
      "Should we split this module? We need confidence",
      "Should we split this module?",
    ])
  })

  test("#given working memory snapshots #when consolidating #then uses latest context summary as continuation notes", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    await writeWorkingSnapshot(paths.working, {
      session_id: "ses-old",
      started_at: "2026-02-19T07:00:00.000Z",
      updated_at: "2026-02-19T08:00:00.000Z",
      context_summary: "Older context",
      active_files: [],
      decisions: [],
      scratch: "",
      retrieval_log: [],
    })
    await writeWorkingSnapshot(paths.working, {
      session_id: "ses-new",
      started_at: "2026-02-19T09:00:00.000Z",
      updated_at: "2026-02-19T10:00:00.000Z",
      context_summary: "Latest continuation context",
      active_files: [],
      decisions: [],
      scratch: "",
      retrieval_log: [],
    })
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.continuation_notes).toBe("Latest continuation context")
  })

  test("#given no working memory snapshots #when consolidating #then continuation notes is empty", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.continuation_notes).toBe("")
  })

  test("#given no daily summary file #when checking hasDailySummary #then returns false", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const hasDaily = await consolidator.hasDailySummary(date)

    // #then
    expect(hasDaily).toBe(false)
  })

  test("#given consolidated daily summary #when checking hasDailySummary #then returns true", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })
    await consolidator.consolidateDate(date)

    // #when
    const hasDaily = await consolidator.hasDailySummary(date)

    // #then
    expect(hasDaily).toBe(true)
  })

  test("#given consolidated daily summary #when reading summary #then roundtrips daily memory", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    reader.eventsByDate.set("2026-02-19", [
      makeEvent({
        id: "evt-roundtrip",
        timestamp: "2026-02-19T11:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "docs/spec.md", diff_summary: "Updated spec" },
      }),
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })
    const written = await consolidator.consolidateDate(date)

    // #when
    const readBack = await consolidator.readDailySummary(date)

    // #then
    expect(readBack).toEqual(written.daily)
  })

  test("#given missing summary file #when reading daily summary #then returns null", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const readBack = await consolidator.readDailySummary(date)

    // #then
    expect(readBack).toBeNull()
  })

  test("#given a daily memory #when rendering markdown #then includes all sections", () => {
    // #given
    const daily: DailyMemory = {
      date: "2026-02-19",
      summary: "2026-02-19: 2 files changed, 1 decisions made. auth, api.",
      key_decisions: [{ decision: "Keep factory", context: "Matches existing architecture" }],
      files_changed: [{ path: "src/auth/service.ts", summary: "Added validation" }],
      topics: ["auth", "api"],
      open_questions: ["Do we need retries?"],
      continuation_notes: "Continue from auth middleware",
    }

    // #when
    const markdown = toMarkdown(daily)

    // #then
    expect(markdown).toContain("# Daily Summary: 2026-02-19")
    expect(markdown).toContain("## Summary")
    expect(markdown).toContain("## Key Decisions")
    expect(markdown).toContain("1. Keep factory — Matches existing architecture")
    expect(markdown).toContain("## Files Changed")
    expect(markdown).toContain("- src/auth/service.ts: Added validation")
    expect(markdown).toContain("## Topics")
    expect(markdown).toContain("auth, api")
    expect(markdown).toContain("## Open Questions")
    expect(markdown).toContain("- Do we need retries?")
    expect(markdown).toContain("## Continuation Notes")
    expect(markdown).toContain("Continue from auth middleware")
  })

  test("#given events and decisions #when consolidating #then summary template includes counts", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    reader.eventsByDate.set("2026-02-19", [
      makeEvent({
        id: "evt-summary-1",
        timestamp: "2026-02-19T11:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "src/auth/login.ts" },
      }),
      makeEvent({
        id: "evt-summary-2",
        timestamp: "2026-02-19T11:01:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/api/login.md" },
      }),
    ])
    await writeSessionEntries(paths.working, [
      {
        type: "decision",
        content: "Keep login flow linear",
        reasoning: "Avoid branching complexity",
        timestamp: "2026-02-19T11:02:00.000Z",
      },
    ])
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.summary).toContain("2026-02-19: 2 files changed, 1 decisions made.")
  })

  test("#given more than 30 file activities #when consolidating #then files_changed is capped at 30", async () => {
    // #given
    const date = new Date("2026-02-19T12:00:00.000Z")
    const events: AkashicEvent[] = []
    for (let index = 0; index < 35; index += 1) {
      events.push(makeEvent({
        id: `evt-${index}`,
        timestamp: `2026-02-19T11:${String(index).padStart(2, "0")}:00.000Z`,
        type: "file.modified",
        source: "thalamus",
        priority: 10,
        data: { path: `docs/file-${index}.md` },
      }))
    }
    reader.eventsByDate.set("2026-02-19", events)
    const consolidator = createDailyConsolidator({ paths, akashicReader: reader })

    // #when
    const result = await consolidator.consolidateDate(date)

    // #then
    expect(result.daily.files_changed).toHaveLength(30)
  })
})
