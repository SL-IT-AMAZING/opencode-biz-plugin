import type { BrainSearchConfig } from "../config"
import type { SearchCandidate } from "../types"

const RRF_K = 60

export function createHybridScorer(config: BrainSearchConfig): { fuse(ftsResults: SearchCandidate[], vecResults: SearchCandidate[]): SearchCandidate[] } {
  return {
    fuse(ftsResults: SearchCandidate[], vecResults: SearchCandidate[]): SearchCandidate[] {
      const mergedById = new Map<string, SearchCandidate>()
      const scoreById = new Map<string, number>()

      for (let i = 0; i < ftsResults.length; i++) {
        const candidate = ftsResults[i]
        const ftsRank = i + 1
        const contribution = config.fts_weight / (RRF_K + ftsRank)
        const existing = mergedById.get(candidate.id)

        if (existing) {
          mergedById.set(candidate.id, {
            ...existing,
            fts_score: candidate.fts_score,
          })
        } else {
          mergedById.set(candidate.id, { ...candidate })
        }

        scoreById.set(candidate.id, (scoreById.get(candidate.id) ?? 0) + contribution)
      }

      for (let i = 0; i < vecResults.length; i++) {
        const candidate = vecResults[i]
        const vecRank = i + 1
        const contribution = config.vec_weight / (RRF_K + vecRank)
        const existing = mergedById.get(candidate.id)

        if (existing) {
          mergedById.set(candidate.id, {
            ...existing,
            vec_score: candidate.vec_score,
          })
        } else {
          mergedById.set(candidate.id, { ...candidate })
        }

        scoreById.set(candidate.id, (scoreById.get(candidate.id) ?? 0) + contribution)
      }

      const fused = Array.from(mergedById.values(), candidate => ({
        ...candidate,
        combined_score: scoreById.get(candidate.id) ?? 0,
      }))

      fused.sort((a, b) => {
        const scoreDelta = b.combined_score - a.combined_score
        if (scoreDelta !== 0) return scoreDelta
        return a.id.localeCompare(b.id)
      })

      return fused
    },
  }
}
