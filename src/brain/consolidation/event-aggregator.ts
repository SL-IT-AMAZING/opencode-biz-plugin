import type { AkashicEvent } from "../types"
import type { AggregatedEvents, FileActivity, SearchActivity, SessionEntry } from "./types"

export interface EventAggregator {
  aggregate(events: AkashicEvent[], sessionEntries: SessionEntry[]): AggregatedEvents
}

const FILE_EVENT_TYPES = new Set(["file.created", "file.modified", "file.deleted", "file.renamed"])
const SEARCH_EVENT_TYPE = "search.performed"
const SEARCH_DEDUPE_WINDOW_MS = 60_000

function toValidConfidence(confidence?: string): "high" | "medium" | "low" {
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return confidence
  }
  return "medium"
}

function getEventTimeBounds(events: AkashicEvent[]): { from: string; to: string } {
  if (events.length === 0) {
    return { from: "", to: "" }
  }

  let minTs = events[0].timestamp
  let maxTs = events[0].timestamp
  for (const event of events) {
    if (event.timestamp < minTs) minTs = event.timestamp
    if (event.timestamp > maxTs) maxTs = event.timestamp
  }

  return { from: minTs, to: maxTs }
}

function aggregateFileActivities(events: AkashicEvent[]): FileActivity[] {
  const byPath = new Map<string, FileActivity>()

  for (const event of events) {
    if (!FILE_EVENT_TYPES.has(event.type)) {
      continue
    }

    const path = event.data.path
    if (!path) {
      continue
    }

    const existing = byPath.get(path)
    if (!existing) {
      byPath.set(path, {
        path,
        eventCount: 1,
        lastEventTime: event.timestamp,
        maxPriority: event.priority,
        types: new Set([event.type]),
        latestDiffSummary: event.data.diff_summary,
      })
      continue
    }

    existing.eventCount += 1
    existing.maxPriority = Math.max(existing.maxPriority, event.priority)
    existing.types.add(event.type)
    if (event.timestamp >= existing.lastEventTime) {
      existing.lastEventTime = event.timestamp
      existing.latestDiffSummary = event.data.diff_summary
    }
  }

  return Array.from(byPath.values()).sort((a, b) => {
    if (a.lastEventTime !== b.lastEventTime) {
      return b.lastEventTime.localeCompare(a.lastEventTime)
    }
    return b.eventCount - a.eventCount
  })
}

function aggregateDecisions(sessionEntries: SessionEntry[]): AggregatedEvents["decisions"] {
  return sessionEntries
    .filter(entry => entry.type === "decision")
    .map(entry => ({
      timestamp: entry.timestamp,
      decision: entry.content,
      reasoning: entry.reasoning ?? "No reasoning",
      confidence: toValidConfidence(entry.confidence),
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

function aggregateScratchEntries(sessionEntries: SessionEntry[]): string[] {
  const ordered = sessionEntries
    .filter(entry => entry.type === "scratch")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const entry of ordered) {
    if (seen.has(entry.content)) {
      continue
    }
    seen.add(entry.content)
    deduped.push(entry.content)
  }

  return deduped
}

function aggregateSearchActivities(events: AkashicEvent[]): SearchActivity[] {
  const rawActivities = events
    .filter(event => event.type === SEARCH_EVENT_TYPE)
    .map(event => {
      const query = event.data.metadata?.query
      if (typeof query !== "string" || query.length === 0) {
        return null
      }
      const resultsCount = event.data.metadata?.results_count
      return {
        query,
        resultsCount: typeof resultsCount === "number" ? resultsCount : 0,
        timestamp: event.timestamp,
      }
    })
    .filter((activity): activity is SearchActivity => activity !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const deduped: SearchActivity[] = []
  const latestByQueryIndex = new Map<string, number>()

  for (const activity of rawActivities) {
    const existingIndex = latestByQueryIndex.get(activity.query)
    if (existingIndex === undefined) {
      latestByQueryIndex.set(activity.query, deduped.length)
      deduped.push(activity)
      continue
    }

    const existing = deduped[existingIndex]
    const delta = Date.parse(activity.timestamp) - Date.parse(existing.timestamp)
    if (delta <= SEARCH_DEDUPE_WINDOW_MS) {
      deduped[existingIndex] = activity
      continue
    }

    latestByQueryIndex.set(activity.query, deduped.length)
    deduped.push(activity)
  }

  return deduped.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function countEventTypes(events: AkashicEvent[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1
  }
  return counts
}

export function createEventAggregator(): EventAggregator {
  return {
    aggregate(events: AkashicEvent[], sessionEntries: SessionEntry[]): AggregatedEvents {
      return {
        fileActivities: aggregateFileActivities(events),
        decisions: aggregateDecisions(sessionEntries),
        scratchEntries: aggregateScratchEntries(sessionEntries),
        searchActivities: aggregateSearchActivities(events),
        totalEvents: events.length,
        timeRange: getEventTimeBounds(events),
        eventTypeCounts: countEventTypes(events),
      }
    },
  }
}
