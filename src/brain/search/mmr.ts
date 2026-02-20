import type { SearchCandidate } from "../types"
import { cosineSimilarity } from "./cosine"

export function mmrRerank(
  candidates: SearchCandidate[],
  embeddings: Map<string, Float32Array>,
  queryEmbedding: Float32Array,
  lambda = 0.7,
  limit = 10,
): SearchCandidate[] {
  if (candidates.length === 0 || limit <= 0) return []

  const targetSize = Math.min(limit, candidates.length)
  const maxCombinedScore = candidates.reduce((max, candidate) => Math.max(max, candidate.combined_score), 0)
  const relevanceById = new Map<string, number>()

  for (const candidate of candidates) {
    relevanceById.set(candidate.id, maxCombinedScore === 0 ? 0 : candidate.combined_score / maxCombinedScore)
  }

  const selected: SearchCandidate[] = []
  const remaining = [...candidates]

  let bestRelevanceIndex = 0
  for (let i = 1; i < remaining.length; i++) {
    const candidateRelevance = relevanceById.get(remaining[i].id) ?? 0
    const bestRelevance = relevanceById.get(remaining[bestRelevanceIndex].id) ?? 0
    if (candidateRelevance > bestRelevance) {
      bestRelevanceIndex = i
    }
  }

  selected.push(remaining.splice(bestRelevanceIndex, 1)[0])

  while (selected.length < targetSize && remaining.length > 0) {
    let bestMmrScore = Number.NEGATIVE_INFINITY
    let bestMmrIndex = 0

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const candidateRelevance = relevanceById.get(candidate.id) ?? 0
      const candidateEmbedding = embeddings.get(candidate.id)

      let mmrScore = candidateRelevance

      if (candidateEmbedding) {
        let maxSimilarityToSelected = Number.NEGATIVE_INFINITY

        for (const selectedCandidate of selected) {
          const selectedEmbedding = embeddings.get(selectedCandidate.id)
          if (!selectedEmbedding) continue

          const similarity = cosineSimilarity(candidateEmbedding, selectedEmbedding)
          if (similarity > maxSimilarityToSelected) {
            maxSimilarityToSelected = similarity
          }
        }

        if (maxSimilarityToSelected === Number.NEGATIVE_INFINITY) {
          maxSimilarityToSelected = 0
        }

        mmrScore = (lambda * candidateRelevance) - ((1 - lambda) * maxSimilarityToSelected)
      }

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore
        bestMmrIndex = i
      }
    }

    selected.push(remaining.splice(bestMmrIndex, 1)[0])
  }

  void queryEmbedding
  return selected
}
