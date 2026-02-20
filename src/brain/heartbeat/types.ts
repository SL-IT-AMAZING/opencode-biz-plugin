import type { DailyConsolidator } from "../consolidation/daily-consolidator"
import type { FtsSearcher, HybridSearcher } from "../search/types"
import type { BrainPaths } from "../vault/paths"

export interface Heartbeat {
  getSystemContext(sessionId: string): Promise<string[]>
  invalidateSession(sessionId: string): void
}

export interface HeartbeatDeps {
  paths: BrainPaths
  dailyConsolidator: DailyConsolidator
  fts: FtsSearcher
  hybridSearcher: HybridSearcher | null
}

export interface HeartbeatConfig {
  cacheTtlMs: number
  maxTokenBudget: number
  lookbackDays: number
}

export interface CachedContext {
  sections: string[]
  computedAt: number
}
