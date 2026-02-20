import type { SearchCandidate } from "../types"

export interface TemporalMetadata {
  created_at: string
  updated_at: string
  is_evergreen: boolean
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

export function applyTemporalDecay(
  candidates: SearchCandidate[],
  metadata: Map<string, TemporalMetadata>,
  halfLifeDays = 30,
  floor = 0.1,
): SearchCandidate[] {
  const now = Date.now()
  const lambda = Math.log(2) / halfLifeDays

  const decayed = candidates.map(candidate => {
    const temporalMetadata = metadata.get(candidate.id)
    let decayMultiplier = 1

    if (temporalMetadata && !temporalMetadata.is_evergreen) {
      const updatedAtMs = Date.parse(temporalMetadata.updated_at)
      if (!Number.isNaN(updatedAtMs)) {
        const ageDays = Math.max(0, (now - updatedAtMs) / MILLIS_PER_DAY)
        const decayedValue = Math.exp(-lambda * ageDays)
        decayMultiplier = Math.max(floor, decayedValue)
      }
    }

    return {
      ...candidate,
      temporal_score: decayMultiplier,
      combined_score: candidate.combined_score * decayMultiplier,
    }
  })

  decayed.sort((a, b) => b.combined_score - a.combined_score)
  return decayed
}
