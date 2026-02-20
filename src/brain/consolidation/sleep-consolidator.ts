import { getISOWeekNumber, getWeekDates } from "./archival-rollup"
import type { ArchivalRollup } from "./archival-rollup"
import type { DailyConsolidator } from "./daily-consolidator"
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

function weekKey(value: YearWeek): string {
  return `${value.year}-W${value.week}`
}

function monthKey(value: YearMonth): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}`
}

function collectUniqueWeeks(windowDates: Date[]): YearWeek[] {
  const seen = new Set<string>()
  const weeks: YearWeek[] = []

  for (const date of windowDates) {
    const isoWeek = getISOWeekNumber(date)
    const key = weekKey(isoWeek)
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
    const candidate = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
    }
    const key = monthKey(candidate)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    months.push(candidate)
  }

  return months
}

function isCompleteWeek(year: number, week: number, today: Date): boolean {
  const { end } = getWeekDates(year, week)
  return startOfUtcDay(end).getTime() < today.getTime()
}

function isCompleteMonth(year: number, month: number, today: Date): boolean {
  const monthEnd = new Date(Date.UTC(year, month, 0))
  return monthEnd.getTime() < today.getTime()
}

function getWeeksForMonth(windowDates: Date[], month: YearMonth): YearWeek[] {
  const seen = new Set<string>()
  const weeks: YearWeek[] = []

  for (const date of windowDates) {
    if (date.getUTCFullYear() !== month.year || date.getUTCMonth() + 1 !== month.month) {
      continue
    }

    const isoWeek = getISOWeekNumber(date)
    const key = weekKey(isoWeek)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    weeks.push(isoWeek)
  }

  return weeks
}

function emptyResult(errors: string[] = []): SleepConsolidationResult {
  return {
    dailiesGenerated: 0,
    weekliesGenerated: 0,
    monthliesGenerated: 0,
    errors,
    timestamp: new Date().toISOString(),
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface SleepConsolidator {
  consolidate(scope: "daily" | "full", date?: Date): Promise<SleepConsolidationResult>
  shouldAutoConsolidate(): Promise<boolean>
  autoConsolidate(): Promise<SleepConsolidationResult | null>
}

export interface SleepConsolidationResult {
  dailiesGenerated: number
  weekliesGenerated: number
  monthliesGenerated: number
  errors: string[]
  timestamp: string
}

export interface SleepConsolidatorDeps {
  dailyConsolidator: DailyConsolidator
  archivalRollup: ArchivalRollup
  paths: BrainPaths
}

export function createSleepConsolidator(deps: SleepConsolidatorDeps): SleepConsolidator {
  return {
    async consolidate(scope: "daily" | "full", date?: Date): Promise<SleepConsolidationResult> {
      if (scope === "daily") {
        const errors: string[] = []

        try {
          await deps.dailyConsolidator.consolidateDate(date ?? new Date())
          return {
            dailiesGenerated: 1,
            weekliesGenerated: 0,
            monthliesGenerated: 0,
            errors,
            timestamp: new Date().toISOString(),
          }
        } catch (error) {
          errors.push(`daily consolidation failed: ${formatError(error)}`)
          return emptyResult(errors)
        }
      }

      const errors: string[] = []
      let dailiesGenerated = 0
      let weekliesGenerated = 0
      let monthliesGenerated = 0

      const today = startOfUtcDay(new Date())
      const windowDates = getLastThirtyOneDays(today)

      for (const day of windowDates) {
        try {
          const hasDaily = await deps.dailyConsolidator.hasDailySummary(day)
          if (!hasDaily) {
            await deps.dailyConsolidator.consolidateDate(day)
            dailiesGenerated += 1
          }
        } catch (error) {
          errors.push(`daily backfill failed for ${toDateKey(day)}: ${formatError(error)}`)
        }
      }

      const uniqueWeeks = collectUniqueWeeks(windowDates)
      for (const isoWeek of uniqueWeeks) {
        try {
          const hasWeeklyArchive = await deps.archivalRollup.hasWeeklyArchive(isoWeek.year, isoWeek.week)
          if (hasWeeklyArchive || !isCompleteWeek(isoWeek.year, isoWeek.week, today)) {
            continue
          }

          const range = getWeekDates(isoWeek.year, isoWeek.week)
          const dailies: DailyMemory[] = []
          for (let cursor = startOfUtcDay(range.start); cursor.getTime() <= startOfUtcDay(range.end).getTime(); cursor = addDays(cursor, 1)) {
            try {
              const daily = await deps.dailyConsolidator.readDailySummary(cursor)
              if (daily !== null) {
                dailies.push(daily)
              }
            } catch (error) {
              errors.push(`daily read failed for ${toDateKey(cursor)}: ${formatError(error)}`)
            }
          }

          const weeklyArchive = deps.archivalRollup.rollupWeekly(isoWeek.year, isoWeek.week, dailies)
          await deps.archivalRollup.writeWeeklyArchive(weeklyArchive, isoWeek.year, isoWeek.week)
          weekliesGenerated += 1
        } catch (error) {
          errors.push(`weekly rollup failed for ${weekKey(isoWeek)}: ${formatError(error)}`)
        }
      }

      const uniqueMonths = collectUniqueMonths(windowDates)
      for (const month of uniqueMonths) {
        try {
          const hasMonthlyArchive = await deps.archivalRollup.hasMonthlyArchive(month.year, month.month)
          if (hasMonthlyArchive || !isCompleteMonth(month.year, month.month, today)) {
            continue
          }

          const monthWeeks = getWeeksForMonth(windowDates, month)
          const weeklies: ArchivalMemory[] = []
          for (const isoWeek of monthWeeks) {
            try {
              const weeklyArchive = await deps.archivalRollup.readWeeklyArchive(isoWeek.year, isoWeek.week)
              if (weeklyArchive !== null) {
                weeklies.push(weeklyArchive)
              }
            } catch (error) {
              errors.push(`weekly archive read failed for ${weekKey(isoWeek)}: ${formatError(error)}`)
            }
          }

          const monthlyArchive = deps.archivalRollup.rollupMonthly(month.year, month.month, weeklies)
          await deps.archivalRollup.writeMonthlyArchive(monthlyArchive, month.year, month.month)
          monthliesGenerated += 1
        } catch (error) {
          errors.push(`monthly rollup failed for ${monthKey(month)}: ${formatError(error)}`)
        }
      }

      return {
        dailiesGenerated,
        weekliesGenerated,
        monthliesGenerated,
        errors,
        timestamp: new Date().toISOString(),
      }
    },

    async shouldAutoConsolidate(): Promise<boolean> {
      try {
        const yesterday = addDays(startOfUtcDay(new Date()), -1)
        const hasDaily = await deps.dailyConsolidator.hasDailySummary(yesterday)
        return !hasDaily
      } catch {
        return false
      }
    },

    async autoConsolidate(): Promise<SleepConsolidationResult | null> {
      const shouldConsolidate = await this.shouldAutoConsolidate()
      if (!shouldConsolidate) {
        return null
      }

      const yesterday = addDays(startOfUtcDay(new Date()), -1)
      return this.consolidate("daily", yesterday)
    },
  }
}
