import { appendFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { ulid } from "ulid"
import type { AkashicEvent } from "../types"
import type { BrainPaths } from "../vault"
import type { AkashicLogger } from "./types"

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0] // YYYY-MM-DD
}

export function createAkashicLogger(paths: BrainPaths): AkashicLogger {
  const buffer: string[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const FLUSH_INTERVAL_MS = 5_000
  const FLUSH_THRESHOLD = 10

  function getLogPathForDate(date: Date): string {
    return join(paths.akashicDaily, `${formatDate(date)}.jsonl`)
  }

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return

    // Group by date (events could span midnight)
    const byDate = new Map<string, string[]>()
    for (const line of buffer) {
      const event = JSON.parse(line) as AkashicEvent
      const dateKey = formatDate(new Date(event.timestamp))
      const existing = byDate.get(dateKey) ?? []
      existing.push(line)
      byDate.set(dateKey, existing)
    }
    buffer.length = 0

    for (const [dateKey, lines] of byDate) {
      const logPath = join(paths.akashicDaily, `${dateKey}.jsonl`)
      await mkdir(dirname(logPath), { recursive: true })
      await appendFile(logPath, lines.join("\n") + "\n", "utf-8")
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(async () => {
      flushTimer = null
      await flushBuffer()
    }, FLUSH_INTERVAL_MS)
  }

  return {
    async log(partial): Promise<AkashicEvent> {
      const event: AkashicEvent = {
        ...partial,
        id: ulid(),
        timestamp: new Date().toISOString(),
      }

      const line = JSON.stringify(event)
      buffer.push(line)

      if (buffer.length >= FLUSH_THRESHOLD) {
        await flushBuffer()
      } else {
        scheduleFlush()
      }

      return event
    },

    async flush(): Promise<void> {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      await flushBuffer()
    },

    getLogPath(date?: Date): string {
      return getLogPathForDate(date ?? new Date())
    },

    async close(): Promise<void> {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      await flushBuffer()
    },
  }
}
