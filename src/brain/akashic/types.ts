import type { AkashicEvent, AkashicEventType } from "../types"

export interface AkashicLogger {
  log(event: Omit<AkashicEvent, "id" | "timestamp">): Promise<AkashicEvent>
  flush(): Promise<void>
  getLogPath(date?: Date): string
  close(): Promise<void>
}

export interface AkashicReader {
  readDate(date: Date): Promise<AkashicEvent[]>
  readRange(from: Date, to: Date): Promise<AkashicEvent[]>
  queryByType(type: AkashicEventType, limit?: number): Promise<AkashicEvent[]>
  queryByPath(path: string, limit?: number): Promise<AkashicEvent[]>
  count(date?: Date): Promise<number>
}

export interface AkashicQuery {
  from?: Date
  to?: Date
  types?: AkashicEventType[]
  paths?: string[]
  limit?: number
  minPriority?: number
}
