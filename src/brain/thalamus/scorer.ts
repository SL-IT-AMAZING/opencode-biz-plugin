import { stat } from "node:fs/promises"
import type { PendingChange, ChangeSignificance, BusinessScoreFactors } from "./types"

export async function scoreChange(
  change: PendingChange,
  _vaultRoot: string,
): Promise<ChangeSignificance> {
  if (change.type === "unlink") {
    return { score: 70, reason: "File deleted", type: "structure" }
  }

  if (change.type === "add") {
    return { score: 60, reason: "New file created", type: "structure" }
  }

  try {
    const fileStat = await stat(change.path)
    const sizeKb = fileStat.size / 1024

    if (fileStat.size < 100) {
      return { score: 15, reason: "Trivial change (very small file)", type: "content" }
    }

    if (sizeKb > 50) {
      return { score: 80, reason: "Large file modified", type: "content" }
    }

    return { score: 50, reason: "File content modified", type: "content" }
  } catch {
    return { score: 30, reason: "File modified (stat failed)", type: "content" }
  }
}

export function scoreBusinessEvent(factors: BusinessScoreFactors): number {
  let score = 30

  const typeWeights: Record<string, number> = {
    "decision.made": 40,
    "commitment.created": 30,
    "meeting.recorded": 25,
    "commitment.missed": 35,
    "insight.generated": 20,
    "conversation.logged": 10,
    "person.mentioned": 5,
    "topic.discussed": 10,
    "commitment.completed": 15,
    "followup.needed": 20,
  }
  score += typeWeights[factors.event_type] ?? 0

  if (factors.has_decision) score += 15
  if (factors.has_commitment) score += 10

  score += Math.min(factors.participant_count * 5, 15)

  const domainWeights: Record<string, number> = {
    investment: 15,
    hiring: 12,
    strategy: 10,
    product: 8,
    operations: 5,
    other: 0,
  }
  score += domainWeights[factors.business_domain] ?? 0

  return Math.min(score, 100)
}
