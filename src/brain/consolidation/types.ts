import type { AkashicReader } from "../akashic/types"
import type { AkashicLogger } from "../akashic/types"
import type { BrainPaths } from "../vault/paths"
import type { BrainConsolidationConfig } from "../config"
import type { WorkingMemory } from "../types"

/** Aggregated view of file activity from Akashic events */
export interface FileActivity {
  path: string
  eventCount: number
  lastEventTime: string
  maxPriority: number
  types: Set<string>
  latestDiffSummary?: string
}

/** Aggregated search activity */
export interface SearchActivity {
  query: string
  resultsCount: number
  timestamp: string
}

/** Result of event aggregation step */
export interface AggregatedEvents {
  fileActivities: FileActivity[]
  decisions: Array<{
    timestamp: string
    decision: string
    reasoning: string
    confidence: "high" | "medium" | "low"
  }>
  scratchEntries: string[]
  searchActivities: SearchActivity[]
  totalEvents: number
  timeRange: { from: string; to: string }
  eventTypeCounts: Record<string, number>
}

/** Session entries from brain_write (session.json) */
export interface SessionEntry {
  type: "working" | "scratch" | "decision"
  content: string
  timestamp: string
  reasoning?: string
  confidence?: string
}

export interface SessionData {
  entries: SessionEntry[]
}

/** Consolidation cursor for tracking state */
export interface ConsolidationCursor {
  lastConsolidatedAt: string
  lastEventId: string
  sessionId: string
  consolidationCount: number
}

/** Result of a consolidation run */
export interface ConsolidationResult {
  workingMemory: WorkingMemory
  eventsProcessed: number
  entriesProcessed: number
  timestamp: string
  durationMs: number
}

/** MicroConsolidator interface */
export interface MicroConsolidator {
  consolidate(sessionId?: string): Promise<ConsolidationResult>
  shouldConsolidate(): boolean
  getLastConsolidationTime(): string | null
  notifyActivity(): void
}

/** Dependencies for MicroConsolidator */
export interface MicroConsolidatorDeps {
  paths: BrainPaths
  akashicReader: AkashicReader
  akashicLogger: AkashicLogger
  config: BrainConsolidationConfig
}
