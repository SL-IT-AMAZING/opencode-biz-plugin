import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createArchivalRollup, getISOWeekNumber, getWeekDates } from "./archival-rollup"
import { createBrainPaths } from "../vault/paths"
import type { ArchivalMemory, DailyMemory } from "../types"

function makeDaily(overrides: Partial<DailyMemory> = {}): DailyMemory {
  return {
    date: "2026-02-17",
    summary: "Worked on consolidation",
    key_decisions: [{ decision: "Adopt archival rollups", context: "Need weekly summaries" }],
    files_changed: [{ path: "src/brain/consolidation/archival-rollup.ts", summary: "Implemented rollup" }],
    topics: ["memory", "consolidation", "rollup"],
    open_questions: ["Should we add quarterly next?"],
    continuation_notes: "Continue tomorrow",
    ...overrides,
  }
}

function makeWeekly(overrides: Partial<ArchivalMemory> = {}): ArchivalMemory {
  return {
    period: "2026-W08",
    type: "weekly",
    summary: "Week summary",
    themes: ["consolidation", "memory"],
    key_decisions: [
      { date: "2026-02-17", decision: "Ship weekly rollup" },
    ],
    metrics: {
      days_active: 3,
      total_files_changed: 9,
      total_decisions: 4,
    },
    source_count: 3,
    ...overrides,
  }
}

describe("brain/consolidation/archival-rollup", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-archival-rollup-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given empty dailies #when rolling up weekly #then summary says no activity", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const archive = rollup.rollupWeekly(2026, 8, [])

    // #then
    expect(archive.period).toBe("2026-W08")
    expect(archive.type).toBe("weekly")
    expect(archive.summary).toBe("No activity this week.")
    expect(archive.source_count).toBe(0)
  })

  test("#given multiple dailies #when rolling up weekly #then themes aggregate by frequency", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = [
      makeDaily({ topics: ["memory", "memory", "architecture"] }),
      makeDaily({ date: "2026-02-18", topics: ["memory", "rollup"] }),
      makeDaily({ date: "2026-02-19", topics: ["rollup", "testing"] }),
    ]

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.themes.slice(0, 4)).toEqual(["memory", "rollup", "architecture", "testing"])
  })

  test("#given many unique weekly themes #when rolling up weekly #then limits themes to 15 sorted by frequency", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const manyTopics = [
      "t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10",
      "t11", "t12", "t13", "t14", "t15", "t16", "t17", "t18",
    ]
    const dailies = [
      makeDaily({ topics: ["t05", "t05", "t01", ...manyTopics] }),
      makeDaily({ date: "2026-02-18", topics: ["t01", "t01", "t02", "t03"] }),
    ]

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.themes.length).toBe(15)
    expect(archive.themes[0]).toBe("t01")
    expect(archive.themes[1]).toBe("t05")
  })

  test("#given unsorted dailies with decisions #when rolling up weekly #then decisions are chronological", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = [
      makeDaily({
        date: "2026-02-19",
        key_decisions: [{ decision: "third", context: "late" }],
      }),
      makeDaily({
        date: "2026-02-17",
        key_decisions: [{ decision: "first", context: "early" }],
      }),
      makeDaily({
        date: "2026-02-18",
        key_decisions: [{ decision: "second", context: "middle" }],
      }),
    ]

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.key_decisions.map(entry => entry.decision)).toEqual(["first", "second", "third"])
  })

  test("#given more than 20 weekly decisions #when rolling up weekly #then limits key decisions to 20", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = Array.from({ length: 5 }, (_, dayIndex) => makeDaily({
      date: `2026-02-${String(17 + dayIndex).padStart(2, "0")}`,
      key_decisions: Array.from({ length: 6 }, (_, decisionIndex) => ({
        decision: `decision-${dayIndex}-${decisionIndex}`,
        context: "context",
      })),
    }))

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.key_decisions.length).toBe(20)
  })

  test("#given weekly dailies #when rolling up weekly #then metrics are calculated", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = [
      makeDaily({
        topics: ["a", "b", "c"],
        files_changed: [{ path: "a.ts", summary: "a" }, { path: "b.ts", summary: "b" }],
        key_decisions: [{ decision: "d1", context: "c1" }, { decision: "d2", context: "c2" }],
        open_questions: ["q1", "q2"],
      }),
      makeDaily({
        date: "2026-02-18",
        topics: ["a", "d"],
        files_changed: [{ path: "c.ts", summary: "c" }],
        key_decisions: [{ decision: "d3", context: "c3" }],
        open_questions: [],
      }),
    ]

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.metrics).toEqual({
      days_active: 2,
      total_files_changed: 3,
      total_decisions: 3,
      total_topics: 4,
      open_questions: 2,
    })
  })

  test("#given weekly dailies #when rolling up weekly #then source daily paths are populated", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = [
      makeDaily({ date: "2026-02-17" }),
      makeDaily({ date: "2026-02-18" }),
    ]

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.source_daily_paths).toEqual([
      "memory/daily/2026-02-17.json",
      "memory/daily/2026-02-18.json",
    ])
  })

  test("#given weekly dailies #when rolling up weekly #then source event ids default to empty array", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const archive = rollup.rollupWeekly(2026, 8, [makeDaily()])

    // #then
    expect(archive.source_event_ids).toEqual([])
  })

  test("#given less than limit themes and decisions #when rolling up weekly #then information loss notes are omitted", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const archive = rollup.rollupWeekly(2026, 8, [makeDaily()])

    // #then
    expect(archive.information_loss_notes).toBeUndefined()
  })

  test("#given truncated themes and decisions #when rolling up weekly #then information loss notes describe truncation", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const dailies = Array.from({ length: 4 }, (_, dayIndex) => makeDaily({
      date: `2026-02-${String(17 + dayIndex).padStart(2, "0")}`,
      topics: Array.from({ length: 6 }, (_, topicIndex) => `topic-${dayIndex}-${topicIndex}`),
      key_decisions: Array.from({ length: 8 }, (_, decisionIndex) => ({
        decision: `decision-${dayIndex}-${decisionIndex}`,
        context: "context",
      })),
    }))

    // #when
    const archive = rollup.rollupWeekly(2026, 8, dailies)

    // #then
    expect(archive.information_loss_notes).toContain("Themes: 24 total reduced to 15.")
    expect(archive.information_loss_notes).toContain("Decisions: 32 total reduced to 20.")
  })

  test("#given weekly dailies count #when rolling up weekly #then confidence is normalized and capped", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const zeroArchive = rollup.rollupWeekly(2026, 8, [])
    const partialArchive = rollup.rollupWeekly(2026, 8, Array.from({ length: 3 }, () => makeDaily()))
    const cappedArchive = rollup.rollupWeekly(2026, 8, Array.from({ length: 10 }, () => makeDaily()))

    // #then
    expect(zeroArchive.confidence).toBe(0)
    expect(partialArchive.confidence).toBeCloseTo(3 / 7, 5)
    expect(cappedArchive.confidence).toBe(1)
  })

  test("#given weekly archives #when rolling up monthly #then produces monthly archive", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({ period: "2026-W05", source_count: 2 }),
      makeWeekly({ period: "2026-W06", source_count: 3 }),
      makeWeekly({ period: "2026-W07", source_count: 4 }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.period).toBe("2026-02")
    expect(archive.type).toBe("monthly")
    expect(archive.source_count).toBe(3)
    expect(archive.summary).toContain("Month 2026-02: 3 weeks of activity.")
  })

  test("#given weekly themes #when rolling up monthly #then themes aggregate by frequency", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({ themes: ["memory", "rollup", "testing"] }),
      makeWeekly({ period: "2026-W09", themes: ["memory", "architecture"] }),
      makeWeekly({ period: "2026-W10", themes: ["rollup", "memory"] }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.themes.slice(0, 4)).toEqual(["memory", "rollup", "architecture", "testing"])
  })

  test("#given weekly metrics #when rolling up monthly #then metrics are summed", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({
        metrics: { days_active: 2, total_files_changed: 5, total_decisions: 3 },
      }),
      makeWeekly({
        period: "2026-W09",
        metrics: { days_active: 4, total_files_changed: 8, total_decisions: 6 },
      }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.metrics).toEqual({
      weeks_active: 2,
      total_days_active: 6,
      total_files_changed: 13,
      total_decisions: 9,
    })
  })

  test("#given weekly archives #when rolling up monthly #then source paths map to weekly archive files", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({ period: "2026-W05" }),
      makeWeekly({ period: "2026-W06" }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.source_daily_paths).toEqual([
      "archive/weekly/2026-W05.json",
      "archive/weekly/2026-W06.json",
    ])
  })

  test("#given weekly source event ids #when rolling up monthly #then event ids aggregate from weeklies", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({ source_event_ids: ["evt-1", "evt-2"] }),
      makeWeekly({ period: "2026-W09", source_event_ids: ["evt-3"] }),
      makeWeekly({ period: "2026-W10" }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.source_event_ids).toEqual(["evt-1", "evt-2", "evt-3"])
  })

  test("#given weekly confidences #when rolling up monthly #then confidence is averaged from weeklies", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = [
      makeWeekly({ confidence: 0.4 }),
      makeWeekly({ period: "2026-W09", confidence: 0.8 }),
      makeWeekly({ period: "2026-W10" }),
    ]

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.confidence).toBeCloseTo(0.6, 5)
  })

  test("#given no weekly confidences #when rolling up monthly #then confidence falls back to source count normalized", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const partialArchive = rollup.rollupMonthly(2026, 2, [
      makeWeekly(),
      makeWeekly({ period: "2026-W09" }),
      makeWeekly({ period: "2026-W10" }),
    ])
    const cappedArchive = rollup.rollupMonthly(2026, 2, [
      makeWeekly(),
      makeWeekly({ period: "2026-W09" }),
      makeWeekly({ period: "2026-W10" }),
      makeWeekly({ period: "2026-W11" }),
      makeWeekly({ period: "2026-W12" }),
    ])

    // #then
    expect(partialArchive.confidence).toBeCloseTo(0.75, 5)
    expect(cappedArchive.confidence).toBe(1)
  })

  test("#given truncated monthly themes and decisions #when rolling up monthly #then information loss notes describe truncation", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const weeklies = Array.from({ length: 5 }, (_, weekIndex) => makeWeekly({
      period: `2026-W${String(8 + weekIndex).padStart(2, "0")}`,
      themes: Array.from({ length: 5 }, (_, themeIndex) => `theme-${weekIndex}-${themeIndex}`),
      key_decisions: Array.from({ length: 7 }, (_, decisionIndex) => ({
        date: `2026-02-${String(10 + weekIndex).padStart(2, "0")}`,
        decision: `decision-${weekIndex}-${decisionIndex}`,
      })),
    }))

    // #when
    const archive = rollup.rollupMonthly(2026, 2, weeklies)

    // #then
    expect(archive.information_loss_notes).toContain("Themes: 25 total reduced to 20.")
    expect(archive.information_loss_notes).toContain("Decisions: 35 total reduced to 30.")
  })

  test("#given weekly archive #when writing and reading #then weekly roundtrip works", async () => {
    // #given
    const paths = createBrainPaths(tempDir)
    const rollup = createArchivalRollup(paths)
    const archive = rollup.rollupWeekly(2026, 8, [makeDaily()])

    // #when
    await rollup.writeWeeklyArchive(archive, 2026, 8)
    const readBack = await rollup.readWeeklyArchive(2026, 8)
    const markdown = await readFile(join(paths.weeklyArchive, "2026-W08.md"), "utf8")

    // #then
    expect(readBack).toEqual(archive)
    expect(markdown).toContain("# Weekly Archive: 2026-W08")
  })

  test("#given missing weekly archive #when reading #then returns null", async () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))

    // #when
    const archive = await rollup.readWeeklyArchive(2026, 8)

    // #then
    expect(archive).toBeNull()
  })

  test("#given weekly archive presence #when checking existence #then hasWeeklyArchive returns correct boolean", async () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const archive = rollup.rollupWeekly(2026, 8, [makeDaily()])

    // #when
    const beforeWrite = await rollup.hasWeeklyArchive(2026, 8)
    await rollup.writeWeeklyArchive(archive, 2026, 8)
    const afterWrite = await rollup.hasWeeklyArchive(2026, 8)

    // #then
    expect(beforeWrite).toBe(false)
    expect(afterWrite).toBe(true)
  })

  test("#given monthly archive #when writing and reading #then monthly roundtrip works", async () => {
    // #given
    const paths = createBrainPaths(tempDir)
    const rollup = createArchivalRollup(paths)
    const archive = rollup.rollupMonthly(2026, 2, [makeWeekly()])

    // #when
    await rollup.writeMonthlyArchive(archive, 2026, 2)
    const readBack = await rollup.readMonthlyArchive(2026, 2)
    const markdown = await readFile(join(paths.monthlyArchive, "2026-02.md"), "utf8")

    // #then
    expect(readBack).toEqual(archive)
    expect(markdown).toContain("# Monthly Archive: 2026-02")
  })

  test("#given populated archive #when rendering markdown #then includes all sections and metrics", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const archive: ArchivalMemory = {
      period: "2026-W08",
      type: "weekly",
      summary: "Week summary",
      themes: ["memory", "rollup"],
      key_decisions: [
        { date: "2026-02-17", decision: "Decision one" },
        { date: "2026-02-18", decision: "Decision two" },
      ],
      metrics: { total_decisions: 2, total_files_changed: 5 },
      source_count: 2,
    }

    // #when
    const markdown = rollup.toMarkdown(archive)

    // #then
    expect(markdown).toContain("# Weekly Archive: 2026-W08")
    expect(markdown).toContain("## Summary")
    expect(markdown).toContain("## Themes")
    expect(markdown).toContain("memory, rollup")
    expect(markdown).toContain("## Key Decisions")
    expect(markdown).toContain("1. [2026-02-17] Decision one")
    expect(markdown).toContain("## Metrics")
    expect(markdown).toContain("- total_decisions: 2")
    expect(markdown).toContain("## Audit Trail")
    expect(markdown).toContain("Source paths:")
    expect(markdown).toContain("- None")
  })

  test("#given audit metadata #when rendering markdown #then includes audit details", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const archive: ArchivalMemory = {
      period: "2026-W08",
      type: "weekly",
      summary: "Week summary",
      themes: ["memory", "rollup"],
      key_decisions: [{ date: "2026-02-17", decision: "Decision one" }],
      source_count: 2,
      source_daily_paths: [
        "memory/daily/2026-02-17.json",
        "memory/daily/2026-02-18.json",
      ],
      information_loss_notes: "Themes: 22 total reduced to 15.",
      confidence: 0.625,
      reviewed_by: "ai",
    }

    // #when
    const markdown = rollup.toMarkdown(archive)

    // #then
    expect(markdown).toContain("## Audit Trail")
    expect(markdown).toContain("- memory/daily/2026-02-17.json")
    expect(markdown).toContain("- memory/daily/2026-02-18.json")
    expect(markdown).toContain("Information loss notes: Themes: 22 total reduced to 15.")
    expect(markdown).toContain("Confidence: 62.5%")
    expect(markdown).toContain("Reviewed by: ai")
  })

  test("#given empty archive sections #when rendering markdown #then renders graceful defaults", () => {
    // #given
    const rollup = createArchivalRollup(createBrainPaths(tempDir))
    const archive: ArchivalMemory = {
      period: "2026-W08",
      type: "weekly",
      summary: "No activity this week.",
      themes: [],
      key_decisions: [],
      source_count: 0,
    }

    // #when
    const markdown = rollup.toMarkdown(archive)

    // #then
    expect(markdown).toContain("No themes identified.")
    expect(markdown).toContain("No decisions recorded.")
    expect(markdown).not.toContain("## Metrics")
  })

  test("#given known dates #when calculating iso week number #then returns correct year and week", () => {
    // #given
    const dates = [
      new Date("2021-01-01T12:00:00.000Z"),
      new Date("2026-01-01T12:00:00.000Z"),
      new Date("2026-02-20T12:00:00.000Z"),
    ]

    // #when
    const weeks = dates.map(date => getISOWeekNumber(date))

    // #then
    expect(weeks).toEqual([
      { year: 2020, week: 53 },
      { year: 2026, week: 1 },
      { year: 2026, week: 8 },
    ])
  })

  test("#given iso week reference #when getting week dates #then returns monday to sunday range", () => {
    // #given
    const year = 2026
    const week = 8

    // #when
    const { start, end } = getWeekDates(year, week)

    // #then
    expect(start.toISOString().slice(0, 10)).toBe("2026-02-16")
    expect(end.toISOString().slice(0, 10)).toBe("2026-02-22")
    expect(start.getUTCDay()).toBe(1)
    expect(end.getUTCDay()).toBe(0)
  })
})
