import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createHeartbeat } from "./heartbeat"
import type { DailyConsolidationResult, DailyConsolidator } from "../consolidation/daily-consolidator"
import type { DailyMemory, SearchCandidate } from "../types"
import { createBrainPaths } from "../vault/paths"
import type { FtsSearcher, HybridSearcher } from "../search/types"

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * 86_400_000))
}

function makeDaily(overrides: Partial<DailyMemory> = {}): DailyMemory {
  return {
    date: "2026-02-20",
    summary: "Default summary",
    key_decisions: [],
    files_changed: [],
    topics: [],
    open_questions: [],
    continuation_notes: "",
    ...overrides,
  }
}

class FakeDailyConsolidator implements DailyConsolidator {
  public dailies = new Map<string, DailyMemory>()
  public readCalls = 0
  public throwAllReads = false

  async consolidateDate(date: Date): Promise<DailyConsolidationResult> {
    const daily = makeDaily({ date: toDateKey(date) })
    this.dailies.set(toDateKey(date), daily)
    return {
      daily,
      eventsProcessed: 0,
      timestamp: new Date().toISOString(),
    }
  }

  async hasDailySummary(date: Date): Promise<boolean> {
    return this.dailies.has(toDateKey(date))
  }

  async readDailySummary(date: Date): Promise<DailyMemory | null> {
    this.readCalls += 1
    if (this.throwAllReads) {
      throw new Error("daily read failed")
    }
    return this.dailies.get(toDateKey(date)) ?? null
  }
}

const fakeFts: FtsSearcher = {
  search(): SearchCandidate[] {
    return []
  },
  searchByPath(): SearchCandidate[] {
    return []
  },
  highlight(): Array<SearchCandidate & { highlighted: string }> {
    return []
  },
}

const fakeHybrid: HybridSearcher = {
  async search(): Promise<SearchCandidate[]> {
    return []
  },
}

describe("brain/heartbeat", () => {
  let tempDir: string
  let paths: ReturnType<typeof createBrainPaths>
  let dailyConsolidator: FakeDailyConsolidator
  let originalDateNow: () => number

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-heartbeat-"))
    paths = createBrainPaths(tempDir)
    dailyConsolidator = new FakeDailyConsolidator()
    originalDateNow = Date.now
  })

  afterEach(async () => {
    Date.now = originalDateNow
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given new user with no memory files #when getSystemContext #then returns empty array", async () => {
    // #given
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-empty")

    // #then
    expect(context).toEqual([])
  })

  test("#given soul file exists #when getSystemContext #then returns identity section", async () => {
    // #given
    await mkdir(dirname(paths.soulFile), { recursive: true })
    await writeFile(paths.soulFile, "I am a persistent engineering memory focused on clarity.", "utf8")
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-soul")

    // #then
    expect(context[0]).toContain("<brain-heartbeat>")
    expect(context.join("\n")).toContain("<brain-identity>")
    expect(context.join("\n")).toContain("persistent engineering memory")
  })

  test("#given yesterday daily summary exists #when getSystemContext #then returns yesterday section", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({
      date: toDateKey(yesterday),
      summary: "Yesterday we stabilized consolidation behavior.",
      continuation_notes: "Continue on heartbeat integration",
    }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-yesterday")

    // #then
    const joined = context.join("\n")
    expect(joined).toContain("<brain-yesterday>")
    expect(joined).toContain("stabilized consolidation behavior")
    expect(joined).toContain("Continuation: Continue on heartbeat integration")
  })

  test("#given decision-rich dailies #when getSystemContext #then returns recent decisions", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    const twoDaysAgo = addDays(startOfUtcDay(new Date()), -2)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({
      key_decisions: [
        { decision: "Prefer factory pattern", context: "Consistency" },
        { decision: "Cache by session", context: "Isolation" },
        { decision: "Use lazy reads", context: "Resilience" },
      ],
    }))
    dailyConsolidator.dailies.set(toDateKey(twoDaysAgo), makeDaily({
      key_decisions: [
        { decision: "Fallback on errors", context: "Graceful degradation" },
        { decision: "Limit output", context: "Token budget" },
        { decision: "Ignore stale cache", context: "TTL" },
      ],
    }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-decisions")

    // #then
    const decisionsSection = context.find(section => section.includes("<brain-decisions>"))
    expect(decisionsSection).toBeDefined()
    expect(decisionsSection).toContain("Prefer factory pattern")
    expect(decisionsSection).toContain("Limit output")
    const decisionLines = decisionsSection?.split("\n").filter(line => line.startsWith("- ")) ?? []
    expect(decisionLines).toHaveLength(5)
  })

  test("#given open questions in dailies #when getSystemContext #then returns open questions section", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({
      open_questions: [
        "Should we surface archival summaries proactively?",
        "Do we need ranking for decisions?",
      ],
    }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-questions")

    // #then
    const joined = context.join("\n")
    expect(joined).toContain("<brain-open-questions>")
    expect(joined).toContain("surface archival summaries")
    expect(joined).toContain("ranking for decisions")
  })

  test("#given cached context #when getSystemContext called twice #then second call reuses cache", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Original summary" }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const first = await heartbeat.getSystemContext("ses-cache")
    const callsAfterFirst = dailyConsolidator.readCalls
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Updated summary" }))
    const second = await heartbeat.getSystemContext("ses-cache")

    // #then
    expect(second).toEqual(first)
    expect(dailyConsolidator.readCalls).toBe(callsAfterFirst)
  })

  test("#given cache ttl expires #when getSystemContext called again #then context refreshes", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Before TTL" }))
    let now = 1_000
    Date.now = () => now
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid }, { cacheTtlMs: 10 })

    // #when
    const first = await heartbeat.getSystemContext("ses-ttl")
    now = 1_020
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "After TTL" }))
    const second = await heartbeat.getSystemContext("ses-ttl")

    // #then
    expect(first.join("\n")).toContain("Before TTL")
    expect(second.join("\n")).toContain("After TTL")
    expect(dailyConsolidator.readCalls).toBeGreaterThan(3)
  })

  test("#given cache exists #when invalidateSession called #then next read recomputes", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Before invalidation" }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const first = await heartbeat.getSystemContext("ses-invalidate")
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "After invalidation" }))
    heartbeat.invalidateSession("ses-invalidate")
    const second = await heartbeat.getSystemContext("ses-invalidate")

    // #then
    expect(first.join("\n")).toContain("Before invalidation")
    expect(second.join("\n")).toContain("After invalidation")
  })

  test("#given missing soul file #when getSystemContext #then handles missing file gracefully", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Daily context without soul" }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-no-soul")

    // #then
    const joined = context.join("\n")
    expect(joined).toContain("Daily context without soul")
    expect(joined).not.toContain("<brain-identity>")
  })

  test("#given missing daily summaries #when getSystemContext #then skips daily-driven sections", async () => {
    // #given
    await mkdir(dirname(paths.soulFile), { recursive: true })
    await writeFile(paths.soulFile, "Identity survives when daily memory is missing.", "utf8")
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-missing-dailies")

    // #then
    const joined = context.join("\n")
    expect(joined).toContain("<brain-identity>")
    expect(joined).not.toContain("<brain-yesterday>")
    expect(joined).not.toContain("<brain-decisions>")
    expect(joined).not.toContain("<brain-open-questions>")
  })

  test("#given daily consolidator throws #when getSystemContext #then degrades gracefully", async () => {
    // #given
    await mkdir(dirname(paths.soulFile), { recursive: true })
    await writeFile(paths.soulFile, "Identity remains available despite read failures.", "utf8")
    dailyConsolidator.throwAllReads = true
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const context = await heartbeat.getSystemContext("ses-daily-errors")

    // #then
    const joined = context.join("\n")
    expect(joined).toContain("<brain-identity>")
    expect(joined).not.toContain("<brain-yesterday>")
  })

  test("#given large context sections #when getSystemContext #then respects maxTokenBudget truncation", async () => {
    // #given
    await mkdir(dirname(paths.soulFile), { recursive: true })
    await writeFile(paths.soulFile, "S".repeat(600), "utf8")
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({
      summary: "Y".repeat(450),
      continuation_notes: "C".repeat(200),
      key_decisions: [{ decision: "D".repeat(200), context: "K".repeat(120) }],
      open_questions: ["Q".repeat(180)],
    }))
    const heartbeat = createHeartbeat(
      { paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid },
      { maxTokenBudget: 30 },
    )

    // #when
    const context = await heartbeat.getSystemContext("ses-budget")

    // #then
    const total = context.reduce((sum, section) => sum + section.length, 0)
    expect(total).toBeLessThanOrEqual(120)
    expect(context.some(section => section.includes("..."))).toBe(true)
  })

  test("#given two sessions #when reading context #then caches are independent per session", async () => {
    // #given
    const yesterday = addDays(startOfUtcDay(new Date()), -1)
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Initial shared summary" }))
    const heartbeat = createHeartbeat({ paths, dailyConsolidator, fts: fakeFts, hybridSearcher: fakeHybrid })

    // #when
    const sessionAFirst = await heartbeat.getSystemContext("ses-a")
    dailyConsolidator.dailies.set(toDateKey(yesterday), makeDaily({ summary: "Updated for new session" }))
    const sessionB = await heartbeat.getSystemContext("ses-b")
    const sessionASecond = await heartbeat.getSystemContext("ses-a")

    // #then
    expect(sessionAFirst.join("\n")).toContain("Initial shared summary")
    expect(sessionASecond.join("\n")).toContain("Initial shared summary")
    expect(sessionB.join("\n")).toContain("Updated for new session")
  })
})
