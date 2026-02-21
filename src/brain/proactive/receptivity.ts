import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { ReceptivityRecord } from "./types"

export interface ReceptivityTracker {
  recordReaction(record: ReceptivityRecord): Promise<void>
  getReceptivityScore(triggerType: string, triggerSubtype: string): Promise<number>
  getOverallReceptivity(): Promise<number>
  getHistory(limit?: number): Promise<ReceptivityRecord[]>
}

const DEFAULT_RECEPTIVITY_SCORE = 0.5
const MAX_RECENT_REACTIONS = 10

const REACTION_SCORES: Record<ReceptivityRecord["user_reaction"], number> = {
  engaged: 1,
  ignored: 0.3,
  dismissed: 0,
}

async function readRecords(storagePath: string): Promise<ReceptivityRecord[]> {
  try {
    const content = await Bun.file(storagePath).text()

    return content
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as ReceptivityRecord)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw error
  }
}

function computeWeightedScore(records: ReceptivityRecord[]): number {
  if (records.length === 0) {
    return DEFAULT_RECEPTIVITY_SCORE
  }

  const recent = records.slice(-MAX_RECENT_REACTIONS).reverse()
  let weightedSum = 0
  let weightTotal = 0

  for (const [index, record] of recent.entries()) {
    const weight = 1 / (1 + index)
    weightedSum += REACTION_SCORES[record.user_reaction] * weight
    weightTotal += weight
  }

  return weightTotal === 0 ? DEFAULT_RECEPTIVITY_SCORE : weightedSum / weightTotal
}

export function createReceptivityTracker(storagePath: string): ReceptivityTracker {
  return {
    async recordReaction(record: ReceptivityRecord): Promise<void> {
      await mkdir(dirname(storagePath), { recursive: true })

      const existingContent = await Bun.file(storagePath).text().catch(() => "")
      const serialized = `${JSON.stringify(record)}\n`
      const content = existingContent.length > 0 && !existingContent.endsWith("\n")
        ? `${existingContent}\n${serialized}`
        : `${existingContent}${serialized}`

      await Bun.write(storagePath, content)
    },

    async getReceptivityScore(triggerType: string, triggerSubtype: string): Promise<number> {
      const records = await readRecords(storagePath)
      const matchingRecords = records.filter(
        record => record.trigger_type === triggerType && record.trigger_subtype === triggerSubtype,
      )
      return computeWeightedScore(matchingRecords)
    },

    async getOverallReceptivity(): Promise<number> {
      const records = await readRecords(storagePath)
      return computeWeightedScore(records)
    },

    async getHistory(limit = 20): Promise<ReceptivityRecord[]> {
      const records = await readRecords(storagePath)
      return records.slice(-limit).reverse()
    },
  }
}
