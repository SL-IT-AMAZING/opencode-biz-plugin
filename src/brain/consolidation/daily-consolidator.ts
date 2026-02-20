import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createEventAggregator } from "./event-aggregator"
import type { SessionData, SessionEntry } from "./types"
import type { AkashicReader } from "../akashic/types"
import type { DailyMemory, WorkingMemory } from "../types"
import type { BrainPaths } from "../vault/paths"

const GENERIC_TOPICS = new Set([
  "src",
  "lib",
  "dist",
  "build",
  "node_modules",
  "test",
  "tests",
  "__tests__",
])

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as { code?: string }).code === "ENOENT"
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isValidSessionData(input: unknown): input is SessionData {
  if (typeof input !== "object" || input === null || !("entries" in input)) {
    return false
  }

  const entries = (input as { entries?: unknown }).entries
  if (!Array.isArray(entries)) {
    return false
  }

  return entries.every(entry => {
    if (typeof entry !== "object" || entry === null) {
      return false
    }

    const candidate = entry as Partial<SessionEntry>
    return typeof candidate.type === "string"
      && typeof candidate.content === "string"
      && typeof candidate.timestamp === "string"
  })
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await listFilesRecursive(fullPath)))
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }

    return files
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }
    throw error
  }
}

async function readSessionEntriesForDate(workingDir: string, dateKey: string): Promise<SessionEntry[]> {
  const allFiles = await listFilesRecursive(workingDir)
  const sessionFiles = allFiles.filter(filePath => filePath.endsWith("session.json"))

  const entries: SessionEntry[] = []

  for (const sessionFile of sessionFiles) {
    try {
      const raw = await readFile(sessionFile, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (!isValidSessionData(parsed)) {
        continue
      }

      for (const entry of parsed.entries) {
        if (entry.timestamp.slice(0, 10) === dateKey) {
          entries.push(entry)
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError || isMissingFileError(error)) {
        continue
      }
      throw error
    }
  }

  return entries
}

function extractTopics(paths: string[]): string[] {
  const frequencies = new Map<string, number>()

  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean)
    const directoryParts = parts.slice(0, Math.max(0, parts.length - 1))
    const segments = directoryParts.slice(0, 2)
    for (const segment of segments) {
      if (GENERIC_TOPICS.has(segment)) {
        continue
      }
      frequencies.set(segment, (frequencies.get(segment) ?? 0) + 1)
    }
  }

  return Array.from(frequencies.entries())
    .sort((a, b) => {
      if (a[1] !== b[1]) {
        return b[1] - a[1]
      }
      return a[0].localeCompare(b[0])
    })
    .slice(0, 10)
    .map(([topic]) => topic)
}

function extractOpenQuestions(scratchEntries: string[]): string[] {
  const questions: string[] = []
  const seen = new Set<string>()

  for (const entry of scratchEntries) {
    if (!entry.includes("?")) {
      continue
    }

    const sentences = entry.split(".")
    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      if (!trimmed.includes("?")) {
        continue
      }
      if (seen.has(trimmed)) {
        continue
      }
      seen.add(trimmed)
      questions.push(trimmed)
      if (questions.length >= 10) {
        return questions
      }
    }
  }

  return questions
}

async function readLatestContinuationNotes(workingDir: string): Promise<string> {
  const allFiles = await listFilesRecursive(workingDir)
  const snapshotFiles = allFiles.filter(filePath => filePath.endsWith(".working_memory.json"))

  let latest: WorkingMemory | null = null

  for (const snapshotFile of snapshotFiles) {
    try {
      const raw = await readFile(snapshotFile, "utf8")
      const parsed = JSON.parse(raw) as Partial<WorkingMemory>
      if (typeof parsed.context_summary !== "string" || typeof parsed.updated_at !== "string") {
        continue
      }

      if (latest === null || parsed.updated_at > latest.updated_at) {
        latest = parsed as WorkingMemory
      }
    } catch (error) {
      if (error instanceof SyntaxError || isMissingFileError(error)) {
        continue
      }
      throw error
    }
  }

  return latest?.context_summary ?? ""
}

export interface DailyConsolidator {
  consolidateDate(date: Date): Promise<DailyConsolidationResult>
  hasDailySummary(date: Date): Promise<boolean>
  readDailySummary(date: Date): Promise<DailyMemory | null>
}

export interface DailyConsolidationResult {
  daily: DailyMemory
  eventsProcessed: number
  timestamp: string
}

export interface DailyConsolidatorDeps {
  paths: BrainPaths
  akashicReader: AkashicReader
}

export function toMarkdown(daily: DailyMemory): string {
  const lines: string[] = []
  lines.push(`# Daily Summary: ${daily.date}`)
  lines.push("")

  lines.push("## Summary")
  lines.push(daily.summary)
  lines.push("")

  lines.push("## Key Decisions")
  if (daily.key_decisions.length === 0) {
    lines.push("No decisions.")
  } else {
    daily.key_decisions.forEach((decision, index) => {
      lines.push(`${index + 1}. ${decision.decision} — ${decision.context}`)
    })
  }
  lines.push("")

  lines.push("## Files Changed")
  if (daily.files_changed.length === 0) {
    lines.push("No files changed.")
  } else {
    for (const fileChange of daily.files_changed) {
      lines.push(`- ${fileChange.path}: ${fileChange.summary}`)
    }
  }
  lines.push("")

  lines.push("## Topics")
  lines.push(daily.topics.length > 0 ? daily.topics.join(", ") : "No topics identified.")
  lines.push("")

  lines.push("## Open Questions")
  if (daily.open_questions.length === 0) {
    lines.push("No open questions.")
  } else {
    for (const question of daily.open_questions) {
      lines.push(`- ${question}`)
    }
  }
  lines.push("")

  lines.push("## Continuation Notes")
  lines.push(daily.continuation_notes || "No continuation notes.")

  return `${lines.join("\n")}\n`
}

export function createDailyConsolidator(deps: DailyConsolidatorDeps): DailyConsolidator {
  return {
    async consolidateDate(date: Date): Promise<DailyConsolidationResult> {
      const dateKey = toDateKey(date)
      const events = await deps.akashicReader.readDate(date)
      const sessionEntries = await readSessionEntriesForDate(deps.paths.working, dateKey)
      const aggregator = createEventAggregator()
      const aggregated = aggregator.aggregate(events, sessionEntries)

      const filesChanged = aggregated.fileActivities.slice(0, 30).map(fileActivity => ({
        path: fileActivity.path,
        summary: fileActivity.latestDiffSummary ?? "Modified",
      }))

      const topics = extractTopics(aggregated.fileActivities.map(fileActivity => fileActivity.path))
      const topTopics = topics.slice(0, 3)
      const summary = events.length === 0
        ? "No activity recorded."
        : `${dateKey}: ${aggregated.fileActivities.length} files changed, ${aggregated.decisions.length} decisions made. ${topTopics.length > 0 ? topTopics.join(", ") : "No topics identified"}.`

      const daily: DailyMemory = {
        date: dateKey,
        summary,
        key_decisions: aggregated.decisions.map(decision => ({
          decision: decision.decision,
          context: decision.reasoning,
        })),
        files_changed: filesChanged,
        topics,
        open_questions: extractOpenQuestions(aggregated.scratchEntries),
        continuation_notes: await readLatestContinuationNotes(deps.paths.working),
      }

      const timestamp = new Date().toISOString()
      await mkdir(deps.paths.daily, { recursive: true })

      const dailyJsonPath = join(deps.paths.daily, `${dateKey}.json`)
      const dailyMarkdownPath = join(deps.paths.daily, `${dateKey}.md`)
      await writeFile(dailyJsonPath, toPrettyJson(daily), "utf8")
      await writeFile(dailyMarkdownPath, toMarkdown(daily), "utf8")

      return {
        daily,
        eventsProcessed: events.length,
        timestamp,
      }
    },

    async hasDailySummary(date: Date): Promise<boolean> {
      try {
        await readFile(join(deps.paths.daily, `${toDateKey(date)}.json`), "utf8")
        return true
      } catch (error) {
        if (isMissingFileError(error)) {
          return false
        }
        throw error
      }
    },

    async readDailySummary(date: Date): Promise<DailyMemory | null> {
      try {
        const raw = await readFile(join(deps.paths.daily, `${toDateKey(date)}.json`), "utf8")
        return JSON.parse(raw) as DailyMemory
      } catch (error) {
        if (isMissingFileError(error) || error instanceof SyntaxError) {
          return null
        }
        throw error
      }
    },
  }
}
