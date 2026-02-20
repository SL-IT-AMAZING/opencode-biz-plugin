import { readdir } from "node:fs/promises"
import { join, basename } from "node:path"
import type { AkashicEvent, AkashicEventType } from "../types"
import type { BrainPaths } from "../vault"
import type { AkashicReader, AkashicQuery } from "./types"

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

function parseDateFromFilename(filename: string): Date | null {
  const match = basename(filename).match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/)
  if (!match) return null
  return new Date(match[1] + "T00:00:00Z")
}

async function readJsonlFile(filePath: string): Promise<AkashicEvent[]> {
  try {
    const file = Bun.file(filePath)
    if (!(await file.exists())) return []
    const content = await file.text()
    return content
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as AkashicEvent)
  } catch {
    return []
  }
}

export function createAkashicReader(paths: BrainPaths): AkashicReader {
  return {
    async readDate(date: Date): Promise<AkashicEvent[]> {
      const filePath = join(paths.akashicDaily, `${formatDate(date)}.jsonl`)
      return readJsonlFile(filePath)
    },

    async readRange(from: Date, to: Date): Promise<AkashicEvent[]> {
      const events: AkashicEvent[] = []
      try {
        const files = await readdir(paths.akashicDaily)
        for (const file of files.sort()) {
          const fileDate = parseDateFromFilename(file)
          if (!fileDate) continue
          if (fileDate < from || fileDate > to) continue
          const dayEvents = await readJsonlFile(join(paths.akashicDaily, file))
          events.push(...dayEvents)
        }
      } catch {
        // Directory might not exist yet
      }
      return events
    },

    async queryByType(type: AkashicEventType, limit = 50): Promise<AkashicEvent[]> {
      const results: AkashicEvent[] = []
      try {
        const files = await readdir(paths.akashicDaily)
        for (const file of files.sort().reverse()) {
          if (results.length >= limit) break
          const events = await readJsonlFile(join(paths.akashicDaily, file))
          for (const event of events.reverse()) {
            if (event.type === type) {
              results.push(event)
              if (results.length >= limit) break
            }
          }
        }
      } catch {
        // Directory might not exist yet
      }
      return results
    },

    async queryByPath(path: string, limit = 50): Promise<AkashicEvent[]> {
      const results: AkashicEvent[] = []
      try {
        const files = await readdir(paths.akashicDaily)
        for (const file of files.sort().reverse()) {
          if (results.length >= limit) break
          const events = await readJsonlFile(join(paths.akashicDaily, file))
          for (const event of events.reverse()) {
            if (event.data.path === path) {
              results.push(event)
              if (results.length >= limit) break
            }
          }
        }
      } catch {
        // Directory might not exist yet
      }
      return results
    },

    async count(date?: Date): Promise<number> {
      if (date) {
        const events = await this.readDate(date)
        return events.length
      }
      let total = 0
      try {
        const files = await readdir(paths.akashicDaily)
        for (const file of files) {
          const events = await readJsonlFile(join(paths.akashicDaily, file))
          total += events.length
        }
      } catch {
        // Directory might not exist yet
      }
      return total
    },
  }
}

export async function queryAkashicEvents(
  paths: BrainPaths,
  query: AkashicQuery,
): Promise<AkashicEvent[]> {
  const reader = createAkashicReader(paths)
  const from = query.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = query.to ?? new Date()
  let events = await reader.readRange(from, to)

  if (query.types && query.types.length > 0) {
    events = events.filter(e => query.types!.includes(e.type))
  }
  if (query.paths && query.paths.length > 0) {
    events = events.filter(e => e.data.path && query.paths!.includes(e.data.path))
  }
  if (query.minPriority !== undefined) {
    events = events.filter(e => e.priority >= query.minPriority!)
  }
  if (query.limit) {
    events = events.slice(-query.limit)
  }

  return events
}
