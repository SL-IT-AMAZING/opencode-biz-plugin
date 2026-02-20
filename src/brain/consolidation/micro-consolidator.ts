import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createEventAggregator } from "./event-aggregator"
import { createSummaryBuilder } from "./summary-builder"
import { createWorkingMemoryWriter } from "./working-memory-writer"
import type {
  ConsolidationCursor,
  ConsolidationResult,
  MicroConsolidator,
  MicroConsolidatorDeps,
  SessionData,
  SessionEntry,
} from "./types"
import type { AkashicEvent, WorkingMemory } from "../types"

const HARD_ACTIVITY_THRESHOLD = 200
const INITIAL_ACTIVITY_THRESHOLD = 20
const SUBSEQUENT_ACTIVITY_THRESHOLD = 5

function toPadded(value: number): string {
  return String(value).padStart(2, "0")
}

function generateSessionId(now: Date): string {
  const datePart = `${now.getUTCFullYear()}${toPadded(now.getUTCMonth() + 1)}${toPadded(now.getUTCDate())}`
  const timePart = `${toPadded(now.getUTCHours())}${toPadded(now.getUTCMinutes())}${toPadded(now.getUTCSeconds())}`
  const randomPart = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0")
  return `ses-${datePart}-${timePart}-${randomPart}`
}

function getStartOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
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

function getEarliestTimestamp(entries: SessionEntry[]): string | null {
  let earliest: string | null = null
  for (const entry of entries) {
    if (earliest === null || entry.timestamp < earliest) {
      earliest = entry.timestamp
    }
  }
  return earliest
}

async function readSessionEntries(workingDir: string): Promise<SessionEntry[]> {
  try {
    const raw = await readFile(join(workingDir, "session.json"), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!isValidSessionData(parsed)) {
      return []
    }
    return parsed.entries
  } catch (err) {
    // graceful: session file may be missing or malformed
    return []
  }
}

function filterEventsAfterCursor(events: AkashicEvent[], cursorTimestamp: string): AkashicEvent[] {
  return events.filter(event => event.timestamp > cursorTimestamp)
}

function buildFallbackWorkingMemory(sessionId: string, nowIso: string): WorkingMemory {
  return {
    session_id: sessionId,
    started_at: nowIso,
    updated_at: nowIso,
    context_summary: "No activity recorded yet.",
    active_files: [],
    decisions: [],
    scratch: "",
    retrieval_log: [],
  }
}

export function createMicroConsolidator(deps: MicroConsolidatorDeps): MicroConsolidator {
  let lastConsolidatedAt: string | null = null
  let activityCount = 0
  let activeSessionId: string | null = null

  return {
    notifyActivity(): void {
      activityCount += 1
    },

    shouldConsolidate(): boolean {
      if (activityCount >= HARD_ACTIVITY_THRESHOLD) {
        return true
      }

      if (lastConsolidatedAt === null) {
        return activityCount >= INITIAL_ACTIVITY_THRESHOLD
      }

      if (activityCount < SUBSEQUENT_ACTIVITY_THRESHOLD) {
        return false
      }

      const lastTimeMs = Date.parse(lastConsolidatedAt)
      if (Number.isNaN(lastTimeMs)) {
        return false
      }

      const elapsedMs = Date.now() - lastTimeMs
      const requiredMs = deps.config.micro_interval_minutes * 60 * 1000
      return elapsedMs >= requiredMs
    },

    getLastConsolidationTime(): string | null {
      return lastConsolidatedAt
    },

    async consolidate(sessionId?: string): Promise<ConsolidationResult> {
      const startedAt = performance.now()
      const nowDate = new Date()
      const nowIso = nowDate.toISOString()

      const resolvedSessionId = sessionId ?? activeSessionId ?? generateSessionId(nowDate)
      activeSessionId = resolvedSessionId

      const writer = createWorkingMemoryWriter(deps.paths.working)

      let cursor: ConsolidationCursor | null = null
      try {
        cursor = await writer.readCursor(resolvedSessionId)
      } catch (err) {
        // graceful: cursor read can fail for malformed or inaccessible file
        cursor = null
      }

      if (cursor !== null) {
        lastConsolidatedAt = cursor.lastConsolidatedAt
      }

      const sessionEntries = await readSessionEntries(deps.paths.working)

      let events: AkashicEvent[] = []
      try {
        if (cursor !== null) {
          const from = new Date(cursor.lastConsolidatedAt)
          events = await deps.akashicReader.readRange(from, nowDate)
          events = filterEventsAfterCursor(events, cursor.lastConsolidatedAt)
        } else {
          const earliestSessionTs = getEarliestTimestamp(sessionEntries)
          const from = earliestSessionTs ? new Date(earliestSessionTs) : getStartOfToday(nowDate)
          events = await deps.akashicReader.readRange(from, nowDate)
        }
      } catch (err) {
        // graceful: akashic read failures should not stop consolidation
        events = []
      }

      const aggregator = createEventAggregator()
      const aggregated = aggregator.aggregate(events, sessionEntries)

      const sessionStartedAt = cursor?.lastConsolidatedAt
        ?? getEarliestTimestamp(sessionEntries)
        ?? nowIso

      const summaryBuilder = createSummaryBuilder()
      const contextSummary = summaryBuilder.buildContextSummary(aggregated, sessionStartedAt)

      const workingMemory: WorkingMemory = {
        session_id: resolvedSessionId,
        started_at: sessionStartedAt,
        updated_at: nowIso,
        context_summary: contextSummary,
        active_files: aggregated.fileActivities.map(activity => activity.path).slice(0, 20),
        decisions: aggregated.decisions,
        scratch: aggregated.scratchEntries.join("\n---\n"),
        retrieval_log: aggregated.searchActivities.map(activity => ({
          query: activity.query,
          results_count: activity.resultsCount,
          timestamp: activity.timestamp,
        })),
      }

      const newCursor: ConsolidationCursor = {
        lastConsolidatedAt: nowIso,
        lastEventId: events.at(-1)?.id ?? "",
        sessionId: resolvedSessionId,
        consolidationCount: (cursor?.consolidationCount ?? 0) + 1,
      }

      try {
        await writer.writeSnapshot(workingMemory, resolvedSessionId)
      } catch (err) {
        // graceful: snapshot persistence is best-effort
        console.error("Failed to write working memory snapshot", err)
      }

      try {
        await writer.writeCursor(newCursor)
      } catch (err) {
        // graceful: cursor persistence is best-effort
        console.error("Failed to write consolidation cursor", err)
      }

      try {
        await deps.akashicLogger.log({
          type: "memory.consolidated",
          source: "consolidator",
          priority: 50,
          data: {
            metadata: {
              session_id: resolvedSessionId,
              events_processed: events.length,
              entries_processed: sessionEntries.length,
              consolidation_count: newCursor.consolidationCount,
            },
          },
          session_id: resolvedSessionId,
        })
      } catch (err) {
        // graceful: audit logging is non-critical
      }

      lastConsolidatedAt = nowIso
      activityCount = 0

      const durationMs = performance.now() - startedAt
      return {
        workingMemory,
        eventsProcessed: events.length,
        entriesProcessed: sessionEntries.length,
        timestamp: nowIso,
        durationMs,
      }
    },
  }
}
