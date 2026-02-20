import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ArchivalMemory, DailyMemory } from "../types"
import type { BrainPaths } from "../vault/paths"

export interface ArchivalRollup {
  rollupWeekly(year: number, weekNumber: number, dailies: DailyMemory[]): ArchivalMemory
  rollupMonthly(year: number, month: number, weeklies: ArchivalMemory[]): ArchivalMemory
  writeWeeklyArchive(archive: ArchivalMemory, year: number, weekNumber: number): Promise<void>
  writeMonthlyArchive(archive: ArchivalMemory, year: number, month: number): Promise<void>
  readWeeklyArchive(year: number, weekNumber: number): Promise<ArchivalMemory | null>
  readMonthlyArchive(year: number, month: number): Promise<ArchivalMemory | null>
  hasWeeklyArchive(year: number, weekNumber: number): Promise<boolean>
  hasMonthlyArchive(year: number, month: number): Promise<boolean>
  toMarkdown(archive: ArchivalMemory): string
}

function toPadded(value: number): string {
  return String(value).padStart(2, "0")
}

function getWeeklyPeriod(year: number, weekNumber: number): string {
  return `${year}-W${toPadded(weekNumber)}`
}

function getMonthlyPeriod(year: number, month: number): string {
  return `${year}-${toPadded(month)}`
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as { code?: string }).code === "ENOENT"
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function countByFrequency(items: string[]): string[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[1] !== b[1]) {
        return b[1] - a[1]
      }
      return a[0].localeCompare(b[0])
    })
    .map(([topic]) => topic)
}

function compareDateLike(a: string, b: string): number {
  const left = Date.parse(a)
  const right = Date.parse(b)

  const leftValid = Number.isFinite(left)
  const rightValid = Number.isFinite(right)

  if (leftValid && rightValid) {
    return left - right
  }

  if (leftValid && !rightValid) {
    return -1
  }

  if (!leftValid && rightValid) {
    return 1
  }

  return a.localeCompare(b)
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`
}

function getWeeklyArchivePath(paths: BrainPaths, year: number, weekNumber: number, extension: "json" | "md"): string {
  return join(paths.weeklyArchive, `${getWeeklyPeriod(year, weekNumber)}.${extension}`)
}

function getMonthlyArchivePath(paths: BrainPaths, year: number, month: number, extension: "json" | "md"): string {
  return join(paths.monthlyArchive, `${getMonthlyPeriod(year, month)}.${extension}`)
}

async function readArchiveFile(filePath: string): Promise<ArchivalMemory | null> {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw) as ArchivalMemory
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return null
    }
    throw error
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }
    throw error
  }
}

export function getISOWeekNumber(date: Date): { year: number; week: number } {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)

  const year = utcDate.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)

  return { year, week }
}

export function getWeekDates(year: number, weekNumber: number): { start: Date; end: Date } {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const weekOneMonday = new Date(jan4)
  weekOneMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1)

  const start = new Date(weekOneMonday)
  start.setUTCDate(weekOneMonday.getUTCDate() + ((weekNumber - 1) * 7))

  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)

  return { start, end }
}

export function createArchivalRollup(paths: BrainPaths): ArchivalRollup {
  return {
    rollupWeekly(year: number, weekNumber: number, dailies: DailyMemory[]): ArchivalMemory {
      const period = getWeeklyPeriod(year, weekNumber)
      const sourceCount = dailies.length

      const topics = dailies.flatMap(daily => daily.topics)
      const rankedThemes = countByFrequency(topics)
      const themes = rankedThemes.slice(0, 15)

      const keyDecisions = dailies
        .slice()
        .sort((a, b) => compareDateLike(a.date, b.date))
        .flatMap(daily => daily.key_decisions.map(decision => ({
          date: daily.date,
          decision: decision.decision,
        })))
        .slice(0, 20)

      const totalFilesChanged = dailies.reduce((total, daily) => total + daily.files_changed.length, 0)
      const totalDecisions = dailies.reduce((total, daily) => total + daily.key_decisions.length, 0)
      const openQuestions = dailies.reduce((total, daily) => total + daily.open_questions.length, 0)

      const metrics: Record<string, number> = {
        days_active: sourceCount,
        total_files_changed: totalFilesChanged,
        total_decisions: totalDecisions,
        total_topics: new Set(topics).size,
        open_questions: openQuestions,
      }

      const topThreeThemes = themes.slice(0, 3).join(", ") || "none"
      const summary = sourceCount === 0
        ? "No activity this week."
        : `Week ${period}: ${sourceCount} days of activity. Themes: ${topThreeThemes}. ${totalDecisions} decisions, ${totalFilesChanged} files changed.`

      return {
        period,
        type: "weekly",
        summary,
        themes,
        key_decisions: keyDecisions,
        metrics,
        source_count: sourceCount,
      }
    },

    rollupMonthly(year: number, month: number, weeklies: ArchivalMemory[]): ArchivalMemory {
      const period = getMonthlyPeriod(year, month)
      const sourceCount = weeklies.length

      const allThemes = weeklies.flatMap(weekly => weekly.themes)
      const themes = countByFrequency(allThemes).slice(0, 20)

      const keyDecisions = weeklies
        .flatMap(weekly => weekly.key_decisions)
        .slice()
        .sort((a, b) => compareDateLike(a.date, b.date))
        .slice(0, 30)

      const metrics: Record<string, number> = {
        weeks_active: sourceCount,
        total_days_active: weeklies.reduce((total, weekly) => total + (weekly.metrics?.days_active ?? 0), 0),
        total_files_changed: weeklies.reduce((total, weekly) => total + (weekly.metrics?.total_files_changed ?? 0), 0),
        total_decisions: weeklies.reduce((total, weekly) => total + (weekly.metrics?.total_decisions ?? 0), 0),
      }

      const topThreeThemes = themes.slice(0, 3).join(", ") || "none"
      const summary = sourceCount === 0
        ? "No activity this month."
        : `Month ${period}: ${sourceCount} weeks of activity. Key themes: ${topThreeThemes}. ${metrics.total_decisions} decisions made.`

      return {
        period,
        type: "monthly",
        summary,
        themes,
        key_decisions: keyDecisions,
        metrics,
        source_count: sourceCount,
      }
    },

    async writeWeeklyArchive(archive: ArchivalMemory, year: number, weekNumber: number): Promise<void> {
      await mkdir(paths.weeklyArchive, { recursive: true })
      await writeFile(getWeeklyArchivePath(paths, year, weekNumber, "json"), toPrettyJson(archive), "utf8")
      await writeFile(getWeeklyArchivePath(paths, year, weekNumber, "md"), this.toMarkdown(archive), "utf8")
    },

    async writeMonthlyArchive(archive: ArchivalMemory, year: number, month: number): Promise<void> {
      await mkdir(paths.monthlyArchive, { recursive: true })
      await writeFile(getMonthlyArchivePath(paths, year, month, "json"), toPrettyJson(archive), "utf8")
      await writeFile(getMonthlyArchivePath(paths, year, month, "md"), this.toMarkdown(archive), "utf8")
    },

    async readWeeklyArchive(year: number, weekNumber: number): Promise<ArchivalMemory | null> {
      return readArchiveFile(getWeeklyArchivePath(paths, year, weekNumber, "json"))
    },

    async readMonthlyArchive(year: number, month: number): Promise<ArchivalMemory | null> {
      return readArchiveFile(getMonthlyArchivePath(paths, year, month, "json"))
    },

    async hasWeeklyArchive(year: number, weekNumber: number): Promise<boolean> {
      return fileExists(getWeeklyArchivePath(paths, year, weekNumber, "json"))
    },

    async hasMonthlyArchive(year: number, month: number): Promise<boolean> {
      return fileExists(getMonthlyArchivePath(paths, year, month, "json"))
    },

    toMarkdown(archive: ArchivalMemory): string {
      const lines: string[] = []
      lines.push(`# ${capitalize(archive.type)} Archive: ${archive.period}`)
      lines.push("")

      lines.push("## Summary")
      lines.push("")
      lines.push(archive.summary)
      lines.push("")

      lines.push("## Themes")
      lines.push("")
      lines.push(archive.themes.length > 0 ? archive.themes.join(", ") : "No themes identified.")
      lines.push("")

      lines.push("## Key Decisions")
      lines.push("")
      if (archive.key_decisions.length === 0) {
        lines.push("No decisions recorded.")
      } else {
        archive.key_decisions.forEach((entry, index) => {
          lines.push(`${index + 1}. [${entry.date}] ${entry.decision}`)
        })
      }

      if (archive.metrics && Object.keys(archive.metrics).length > 0) {
        lines.push("")
        lines.push("## Metrics")
        lines.push("")
        for (const [key, value] of Object.entries(archive.metrics)) {
          lines.push(`- ${key}: ${value}`)
        }
      }

      return `${lines.join("\n")}\n`
    },
  }
}
