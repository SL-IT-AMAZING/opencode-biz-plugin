import type { AkashicEvent } from "../types"

export type ThalamusEventHandler = (event: AkashicEvent) => void | Promise<void>

export interface ThalamusWatcher {
  start(): Promise<void>
  stop(): Promise<void>
  onEvent(handler: ThalamusEventHandler): () => void // Returns unsubscribe fn
  isWatching(): boolean
  getWatchedCount(): number
}

export interface ChangeSignificance {
  score: number // 0-100
  reason: string
  type: "content" | "structure" | "metadata"
}

export interface PendingChange {
  path: string
  type: "add" | "change" | "unlink"
  timestamp: number
  size?: number
}
