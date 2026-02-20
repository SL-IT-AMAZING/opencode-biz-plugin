import { basename } from "node:path"
import type { AggregatedEvents } from "./types"

export interface SummaryBuilder {
  buildContextSummary(aggregated: AggregatedEvents, sessionStartedAt: string): string
}

const MAX_SUMMARY_LENGTH = 500
const CONTEXT_PREFIX = "context:"

function toPadded(value: number): string {
  return String(value).padStart(2, "0")
}

function formatTime(date: Date): string {
  return `${toPadded(date.getHours())}:${toPadded(date.getMinutes())}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function truncateWithEllipsis(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input
  }
  return `${input.slice(0, Math.max(0, maxLength - 3))}...`
}

function capSummary(text: string): string {
  return truncateWithEllipsis(text, MAX_SUMMARY_LENGTH)
}

function extractContextOverride(scratchEntries: string[]): string | null {
  let latest: string | null = null

  for (const entry of scratchEntries) {
    const trimmed = entry.trim()
    if (!trimmed.toLowerCase().startsWith(CONTEXT_PREFIX)) {
      continue
    }

    latest = trimmed.slice(CONTEXT_PREFIX.length).trim()
  }

  return latest
}

export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp)
  if (Number.isNaN(then.getTime())) {
    return isoTimestamp
  }

  const deltaMs = now.getTime() - then.getTime()
  if (deltaMs >= 0 && deltaMs < 60_000) {
    return "just now"
  }

  if (deltaMs >= 0 && deltaMs < 60 * 60_000) {
    const minutes = Math.floor(deltaMs / 60_000)
    return `${minutes}m ago`
  }

  if (deltaMs >= 0 && deltaMs < 24 * 60 * 60_000) {
    const hours = Math.floor(deltaMs / (60 * 60_000))
    const minutes = Math.floor((deltaMs % (60 * 60_000)) / 60_000)
    return `${hours}h ${minutes}m ago`
  }

  if (sameDay(then, now)) {
    return `today at ${formatTime(then)}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(then, yesterday)) {
    return `yesterday at ${formatTime(then)}`
  }

  const year = then.getFullYear()
  const month = toPadded(then.getMonth() + 1)
  const day = toPadded(then.getDate())
  return `${year}-${month}-${day}`
}

export function createSummaryBuilder(): SummaryBuilder {
  return {
    buildContextSummary(aggregated: AggregatedEvents, sessionStartedAt: string): string {
      const contextOverride = extractContextOverride(aggregated.scratchEntries)
      if (contextOverride !== null) {
        return capSummary(contextOverride)
      }

      if (aggregated.totalEvents === 0) {
        return "No activity recorded yet."
      }

      const lines: string[] = []
      lines.push(`Session active since ${formatRelativeTime(sessionStartedAt)}.`)

      if (aggregated.fileActivities.length > 0) {
        const topFiles = aggregated.fileActivities
          .slice(0, 3)
          .map(activity => basename(activity.path))
          .join(", ")
        lines.push(`Files: ${aggregated.fileActivities.length} active (${topFiles}).`)
      }

      if (aggregated.decisions.length === 0) {
        lines.push("No decisions recorded.")
      } else {
        const latestDecision = truncateWithEllipsis(aggregated.decisions[0].decision, 80)
        lines.push(`Decisions: ${aggregated.decisions.length} recorded (latest: "${latestDecision}").`)
      }

      const creates = aggregated.eventTypeCounts["file.created"] ?? 0
      const modifies = aggregated.eventTypeCounts["file.modified"] ?? 0
      const deletes = aggregated.eventTypeCounts["file.deleted"] ?? 0
      lines.push(`Activity: ${creates} created, ${modifies} modified, ${deletes} deleted.`)

      if (aggregated.searchActivities.length > 0) {
        lines.push(`Searches: ${aggregated.searchActivities.length} queries performed.`)
      }

      let summary = lines.join("\n")
      if (summary.length <= MAX_SUMMARY_LENGTH) {
        return summary
      }

      const withoutSearches = lines.filter(line => !line.startsWith("Searches:"))
      summary = withoutSearches.join("\n")
      if (summary.length <= MAX_SUMMARY_LENGTH) {
        return summary
      }

      const withoutActivity = withoutSearches.filter(line => !line.startsWith("Activity:"))
      return capSummary(withoutActivity.join("\n"))
    },
  }
}
