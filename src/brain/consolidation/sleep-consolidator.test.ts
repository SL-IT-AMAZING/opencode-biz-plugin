import { describe, expect, test } from "bun:test"
import { createSleepConsolidator } from "./sleep-consolidator"
import { getISOWeekNumber, getWeekDates } from "./archival-rollup"
import type { ArchivalRollup } from "./archival-rollup"
import type { DailyConsolidationResult, DailyConsolidator } from "./daily-consolidator"
import type { ArchivalMemory, DailyMemory } from "../types"
import type { BrainPaths } from "../vault/paths"

const DAY_MS = 86_400_000

interface YearWeek {
  year: number
  week: number
}

interface YearMonth {
  year: number
  month: number
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS))
}

function getLastThirtyOneDays(today: Date): Date[] {
  const start = addDays(today, -30)
  return Array.from({ length: 31 }, (_, index) => addDays(start, index))
}

function weekKey(year: number, week: number): string {
  return `${year}-W${week}`
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

function isCompleteWeek(isoWeek: YearWeek, today: Date): boolean {
  const { end } = getWeekDates(isoWeek.year, isoWeek.week)
  return startOfUtcDay(end).getTime() < today.getTime()
}

function isCompleteMonth(month: YearMonth, today: Date): boolean {
  const monthEnd = new Date(Date.UTC(month.year, month.month, 0))
  return monthEnd.getTime() < today.getTime()
}

function collectUniqueWeeks(windowDates: Date[]): YearWeek[] {
  const seen = new Set<string>()
  const weeks: YearWeek[] = []

  for (const date of windowDates) {
    const isoWeek = getISOWeekNumber(date)
    const key = weekKey(isoWeek.year, isoWeek.week)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    weeks.push(isoWeek)
  }

  return weeks
}

function collectUniqueMonths(windowDates: Date[]): YearMonth[] {
  const seen = new Set<string>()
  const months: YearMonth[] = []

  for (const date of windowDates) {
    const month = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
    }
    const key = monthKey(month.year, month.month)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    months.push(month)
  }

  return months
}

function makePaths(rootDir: string): BrainPaths {
  return {
    vault: rootDir,
    brain: `${rootDir}/_brain`,
    working: `${rootDir}/_brain/working`,
    daily: `${rootDir}/_brain/memory/daily`,
    akashicDaily: `${rootDir}/_brain/akashic/daily`,
    index: `${rootDir}/_brain/index`,
    locks: `${rootDir}/_brain/locks`,
    weeklyArchive: `${rootDir}/_brain/archive/weekly`,
    monthlyArchive: `${rootDir}/_brain/archive/monthly`,
    quarterlyArchive: `${rootDir}/_brain/archive/quarterly`,
    soulFile: `${rootDir}/_brain/soul.md`,
    configFile: `${rootDir}/_brain/config.md`,
    readmeFile: `${rootDir}/_brain/README.md`,
    dbFile: `${rootDir}/_brain/index/brain.sqlite`,
    stateFile: `${rootDir}/_brain/index/state.json`,
    lockFile: `${rootDir}/_brain/locks/writer.lock`,
    ceo: `${rootDir}/_brain/ceo`,
    peopleStore: `${rootDir}/_brain/ceo/people`,
    decisionsStore: `${rootDir}/_brain/ceo/decisions`,
    commitmentsStore: `${rootDir}/_brain/ceo/commitments`,
    ceoMeetings: `${rootDir}/_brain/ceo/meetings`,
  }
}

function makeDailyMemory(dateKey: string, summary = "No activity recorded."): DailyMemory {
  return {
    date: dateKey,
    summary,
    key_decisions: [],
    files_changed: [],
    topics: [],
    open_questions: [],
    continuation_notes: "",
  }
}

class FakeDailyConsolidator implements DailyConsolidator {
  public existingDailySummaries = new Set<string>()
  public dailyByDate = new Map<string, DailyMemory>()
  public hasDailyCalls: string[] = []
  public consolidateCalls: string[] = []
  public readDailyCalls: string[] = []
  public throwOnHasDaily = new Set<string>()
  public throwOnConsolidate = new Set<string>()
  public throwOnReadDaily = new Set<string>()

  async consolidateDate(date: Date): Promise<DailyConsolidationResult> {
    const key = toDateKey(date)
    this.consolidateCalls.push(key)
    if (this.throwOnConsolidate.has(key)) {
      throw new Error(`consolidate failed for ${key}`)
    }

    const daily = this.dailyByDate.get(key) ?? makeDailyMemory(key)
    this.dailyByDate.set(key, daily)
    this.existingDailySummaries.add(key)

    return {
      daily,
      eventsProcessed: 0,
      timestamp: new Date().toISOString(),
    }
  }

  async hasDailySummary(date: Date): Promise<boolean> {
    const key = toDateKey(date)
    this.hasDailyCalls.push(key)
    if (this.throwOnHasDaily.has(key)) {
      throw new Error(`hasDaily failed for ${key}`)
    }
    return this.existingDailySummaries.has(key)
  }

  async readDailySummary(date: Date): Promise<DailyMemory | null> {
    const key = toDateKey(date)
    this.readDailyCalls.push(key)
    if (this.throwOnReadDaily.has(key)) {
      throw new Error(`readDaily failed for ${key}`)
    }
    return this.dailyByDate.get(key) ?? null
  }
}

class FakeArchivalRollup implements ArchivalRollup {
  public weeklyArchives = new Map<string, ArchivalMemory>()
  public monthlyArchives = new Map<string, ArchivalMemory>()
  public hasWeeklyCalls: string[] = []
  public hasMonthlyCalls: string[] = []
  public writeWeeklyCalls: string[] = []
  public writeMonthlyCalls: string[] = []
  public readWeeklyCalls: string[] = []
  public rollupWeeklyCalls: Array<{ year: number; week: number; sourceCount: number }> = []
  public rollupMonthlyCalls: Array<{ year: number; month: number; sourceCount: number }> = []
  public throwOnWriteWeekly = new Set<string>()
  public throwOnWriteMonthly = new Set<string>()

  rollupWeekly(year: number, weekNumber: number, dailies: DailyMemory[]): ArchivalMemory {
    this.rollupWeeklyCalls.push({ year, week: weekNumber, sourceCount: dailies.length })
    return {
      period: weekKey(year, weekNumber),
      type: "weekly",
      summary: `weekly ${year}-W${weekNumber}`,
      themes: [],
      key_decisions: [],
      metrics: { days_active: dailies.length },
      source_count: dailies.length,
    }
  }

  rollupMonthly(year: number, month: number, weeklies: ArchivalMemory[]): ArchivalMemory {
    this.rollupMonthlyCalls.push({ year, month, sourceCount: weeklies.length })
    return {
      period: monthKey(year, month),
      type: "monthly",
      summary: `monthly ${year}-${month}`,
      themes: [],
      key_decisions: [],
      metrics: { weeks_active: weeklies.length },
      source_count: weeklies.length,
    }
  }

  async writeWeeklyArchive(archive: ArchivalMemory, year: number, weekNumber: number): Promise<void> {
    const key = weekKey(year, weekNumber)
    this.writeWeeklyCalls.push(key)
    if (this.throwOnWriteWeekly.has(key)) {
      throw new Error(`writeWeekly failed for ${key}`)
    }
    this.weeklyArchives.set(key, archive)
  }

  async writeMonthlyArchive(archive: ArchivalMemory, year: number, month: number): Promise<void> {
    const key = monthKey(year, month)
    this.writeMonthlyCalls.push(key)
    if (this.throwOnWriteMonthly.has(key)) {
      throw new Error(`writeMonthly failed for ${key}`)
    }
    this.monthlyArchives.set(key, archive)
  }

  async readWeeklyArchive(year: number, weekNumber: number): Promise<ArchivalMemory | null> {
    const key = weekKey(year, weekNumber)
    this.readWeeklyCalls.push(key)
    return this.weeklyArchives.get(key) ?? null
  }

  async readMonthlyArchive(year: number, month: number): Promise<ArchivalMemory | null> {
    return this.monthlyArchives.get(monthKey(year, month)) ?? null
  }

  async hasWeeklyArchive(year: number, weekNumber: number): Promise<boolean> {
    const key = weekKey(year, weekNumber)
    this.hasWeeklyCalls.push(key)
    return this.weeklyArchives.has(key)
  }

  async hasMonthlyArchive(year: number, month: number): Promise<boolean> {
    const key = monthKey(year, month)
    this.hasMonthlyCalls.push(key)
    return this.monthlyArchives.has(key)
  }

  toMarkdown(archive: ArchivalMemory): string {
    return archive.summary
  }
}

async function withFrozenDate<T>(frozenIso: string, run: () => Promise<T>): Promise<T> {
  const frozen = new Date(frozenIso)
  const RealDate = globalThis.Date

  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value ?? frozen.getTime())
    }

    static now(): number {
      return frozen.getTime()
    }

    static parse(text: string): number {
      return RealDate.parse(text)
    }

    static UTC(...args: Parameters<typeof Date.UTC>): number {
      return RealDate.UTC(...args)
    }
  }

  globalThis.Date = MockDate as unknown as DateConstructor
  try {
    return await run()
  } finally {
    globalThis.Date = RealDate
  }
}

describe("brain/consolidation/sleep-consolidator", () => {
  test("#given no date #when consolidate daily #then generates today's daily summary", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      const result = await consolidator.consolidate("daily")

      expect(result.dailiesGenerated).toBe(1)
      expect(result.weekliesGenerated).toBe(0)
      expect(result.monthliesGenerated).toBe(0)
      expect(result.errors).toEqual([])
      expect(daily.consolidateCalls).toEqual(["2026-02-20"])
    })
  })

  test("#given specific date #when consolidate daily #then generates for provided date", async () => {
    const daily = new FakeDailyConsolidator()
    const archival = new FakeArchivalRollup()
    const consolidator = createSleepConsolidator({
      dailyConsolidator: daily,
      archivalRollup: archival,
      paths: makePaths("/tmp/brain"),
    })

    const result = await consolidator.consolidate("daily", new Date("2026-01-15T10:00:00.000Z"))

    expect(result.dailiesGenerated).toBe(1)
    expect(result.errors).toEqual([])
    expect(daily.consolidateCalls).toEqual(["2026-01-15"])
  })

  test("#given missing dailies in window #when consolidate full #then backfills all missing dailies", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates.slice(0, 5)) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "existing daily"))
      }

      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })
      const result = await consolidator.consolidate("full")

      expect(result.dailiesGenerated).toBe(26)
      expect(daily.consolidateCalls).toHaveLength(26)
      expect(result.errors).toEqual([])
    })
  })

  test("#given all dailies already exist #when consolidate full #then skips daily backfill", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "pre-existing"))
      }

      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })
      const result = await consolidator.consolidate("full")

      expect(result.dailiesGenerated).toBe(0)
      expect(daily.consolidateCalls).toEqual([])
      expect(result.errors).toEqual([])
    })
  })

  test("#given complete past weeks with no archives #when consolidate full #then generates weekly rollups", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "available"))
      }

      const expectedCompleteWeeks = collectUniqueWeeks(windowDates).filter(week => isCompleteWeek(week, today))
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })
      const result = await consolidator.consolidate("full")

      expect(result.weekliesGenerated).toBe(expectedCompleteWeeks.length)
      expect(archival.rollupWeeklyCalls).toHaveLength(expectedCompleteWeeks.length)
      expect(result.errors).toEqual([])
    })
  })

  test("#given current week is incomplete #when consolidate full #then skips current week rollup", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "available"))
      }

      const currentWeek = getISOWeekNumber(today)
      const currentWeekKey = weekKey(currentWeek.year, currentWeek.week)
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      await consolidator.consolidate("full")

      expect(archival.writeWeeklyCalls).not.toContain(currentWeekKey)
    })
  })

  test("#given complete past months and no archives #when consolidate full #then generates monthly rollups", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "available"))
      }

      const expectedCompleteMonths = collectUniqueMonths(windowDates).filter(month => isCompleteMonth(month, today))
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })
      const result = await consolidator.consolidate("full")

      expect(result.monthliesGenerated).toBe(expectedCompleteMonths.length)
      expect(archival.rollupMonthlyCalls).toHaveLength(expectedCompleteMonths.length)
      expect(result.errors).toEqual([])
    })
  })

  test("#given current month #when consolidate full #then skips monthly rollup for current month", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      for (const date of windowDates) {
        const key = toDateKey(date)
        daily.existingDailySummaries.add(key)
        daily.dailyByDate.set(key, makeDailyMemory(key, "available"))
      }

      const currentMonthKey = monthKey(today.getUTCFullYear(), today.getUTCMonth() + 1)
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      await consolidator.consolidate("full")

      expect(archival.writeMonthlyCalls).not.toContain(currentMonthKey)
    })
  })

  test("#given yesterday has no summary #when checking auto consolidate #then returns true", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      const shouldConsolidate = await consolidator.shouldAutoConsolidate()

      expect(shouldConsolidate).toBe(true)
    })
  })

  test("#given yesterday already has summary #when checking auto consolidate #then returns false", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const daily = new FakeDailyConsolidator()
      daily.existingDailySummaries.add("2026-02-19")
      daily.dailyByDate.set("2026-02-19", makeDailyMemory("2026-02-19", "already exists"))
      const archival = new FakeArchivalRollup()
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      const shouldConsolidate = await consolidator.shouldAutoConsolidate()

      expect(shouldConsolidate).toBe(false)
    })
  })

  test("#given yesterday missing summary #when auto consolidating #then consolidates yesterday", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      const result = await consolidator.autoConsolidate()

      expect(result).not.toBeNull()
      expect(result?.dailiesGenerated).toBe(1)
      expect(daily.consolidateCalls).toEqual(["2026-02-19"])
    })
  })

  test("#given yesterday already has summary #when auto consolidating #then returns null", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const daily = new FakeDailyConsolidator()
      daily.existingDailySummaries.add("2026-02-19")
      daily.dailyByDate.set("2026-02-19", makeDailyMemory("2026-02-19", "already exists"))
      const archival = new FakeArchivalRollup()
      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })

      const result = await consolidator.autoConsolidate()

      expect(result).toBeNull()
      expect(daily.consolidateCalls).toEqual([])
    })
  })

  test("#given one daily backfill fails #when consolidate full #then collects error and continues weekly and monthly", async () => {
    await withFrozenDate("2026-02-20T12:00:00.000Z", async () => {
      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)
      const daily = new FakeDailyConsolidator()
      const archival = new FakeArchivalRollup()

      const failingDateKey = toDateKey(windowDates[10])
      daily.throwOnConsolidate.add(failingDateKey)

      const consolidator = createSleepConsolidator({
        dailyConsolidator: daily,
        archivalRollup: archival,
        paths: makePaths("/tmp/brain"),
      })
      const result = await consolidator.consolidate("full")

      expect(result.errors.some(error => error.includes(failingDateKey))).toBe(true)
      expect(result.weekliesGenerated).toBeGreaterThan(0)
      expect(result.monthliesGenerated).toBeGreaterThan(0)
    })
  })

  test("#given no events for day #when consolidate daily #then still generates empty daily", async () => {
    const daily = new FakeDailyConsolidator()
    daily.dailyByDate.set("2026-01-25", makeDailyMemory("2026-01-25", "No activity recorded."))
    const archival = new FakeArchivalRollup()
    const consolidator = createSleepConsolidator({
      dailyConsolidator: daily,
      archivalRollup: archival,
      paths: makePaths("/tmp/brain"),
    })

    const result = await consolidator.consolidate("daily", new Date("2026-01-25T12:00:00.000Z"))

    expect(result.dailiesGenerated).toBe(1)
    expect(result.errors).toEqual([])
    expect(daily.consolidateCalls).toEqual(["2026-01-25"])
  })

  test("#given daily consolidate throws #when consolidate daily #then returns error and does not throw", async () => {
    const daily = new FakeDailyConsolidator()
    daily.throwOnConsolidate.add("2026-02-01")
    const archival = new FakeArchivalRollup()
    const consolidator = createSleepConsolidator({
      dailyConsolidator: daily,
      archivalRollup: archival,
      paths: makePaths("/tmp/brain"),
    })

    const result = await consolidator.consolidate("daily", new Date("2026-02-01T12:00:00.000Z"))

    expect(result.dailiesGenerated).toBe(0)
    expect(result.weekliesGenerated).toBe(0)
    expect(result.monthliesGenerated).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("daily consolidation failed")
  })
})
