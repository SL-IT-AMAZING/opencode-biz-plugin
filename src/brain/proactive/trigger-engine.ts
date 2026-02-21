import type { ProactiveTrigger } from "./types"
import type { CommitmentStore, DecisionStore, PersonStore } from "../stores/types"
import type { AkashicReader } from "../akashic/types"
import type { DailyConsolidator } from "../consolidation/daily-consolidator"

const DAY_MS = 86_400_000

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function firstChars(input: string, limit: number): string {
  if (input.length <= limit) {
    return input
  }
  return `${input.slice(0, limit)}...`
}

export interface TriggerEngineDeps {
  commitmentStore: CommitmentStore | null
  decisionStore: DecisionStore | null
  personStore: PersonStore | null
  akashicReader: AkashicReader | null
  dailyConsolidator: DailyConsolidator
}

export interface TriggerEngine {
  evaluateTriggers(
    sessionId: string,
    currentHour: number,
    options?: { excludeSystemEvents?: boolean; currentDate?: Date },
  ): Promise<EvaluatedTrigger[]>
}

export interface EvaluatedTrigger {
  trigger: ProactiveTrigger
  urgency: number
  message_draft: string
}

export function createTriggerEngine(deps: TriggerEngineDeps): TriggerEngine {
  function normalizeTopic(topic: string): string {
    return topic.trim().toLowerCase()
  }

  function tokenizeTitle(title: string): Set<string> {
    return new Set(
      title
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 2),
    )
  }

  function hasTopicOverlap(leftTitle: string, rightTitle: string): boolean {
    const leftWords = tokenizeTitle(leftTitle)
    const rightWords = tokenizeTitle(rightTitle)
    if (leftWords.size === 0 || rightWords.size === 0) {
      return false
    }

    let overlap = 0
    for (const word of leftWords) {
      if (rightWords.has(word)) {
        overlap += 1
      }
    }

    const overlapRatio = overlap / Math.min(leftWords.size, rightWords.size)
    return overlapRatio > 0.5
  }

  function isImplicitDecisionReversal(
    leftDecision: { title: string; decision: string; reasoning: string },
    rightDecision: { title: string; decision: string; reasoning: string },
  ): boolean {
    if (!hasTopicOverlap(leftDecision.title, rightDecision.title)) {
      return false
    }

    const decisionChanged = leftDecision.decision.trim().toLowerCase() !== rightDecision.decision.trim().toLowerCase()
    const reasoningChanged = leftDecision.reasoning.trim().toLowerCase() !== rightDecision.reasoning.trim().toLowerCase()
    return decisionChanged || reasoningChanged
  }

  function calculateCommitmentUrgency(commitment: { due_date?: string }, now: Date): number {
    if (!commitment.due_date) {
      return 0.9
    }

    const dueDateMs = new Date(commitment.due_date).getTime()
    if (Number.isNaN(dueDateMs)) {
      return 0.9
    }

    const daysOverdue = Math.max(0, (now.getTime() - dueDateMs) / DAY_MS)
    return Math.min(1.0, 0.9 + (daysOverdue * 0.01))
  }

  function formatCommitmentOverdueMessage(commitment: { description: string; due_date?: string }, now: Date): string {
    if (!commitment.due_date) {
      return `Overdue: ${commitment.description}`
    }

    const dueDateMs = new Date(commitment.due_date).getTime()
    if (Number.isNaN(dueDateMs)) {
      return `Overdue: ${commitment.description}`
    }

    const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDateMs) / DAY_MS))
    return `Overdue by ${daysOverdue} days: ${commitment.description}`
  }

  return {
    async evaluateTriggers(
      sessionId: string,
      currentHour: number,
      options?: { excludeSystemEvents?: boolean; currentDate?: Date },
    ): Promise<EvaluatedTrigger[]> {
      const currentDate = options?.currentDate ?? new Date()
      const excludeSystemEvents = options?.excludeSystemEvents ?? true
      void sessionId
      void excludeSystemEvents

      const evaluators: Array<() => Promise<EvaluatedTrigger[]>> = [
        async () => {
          try {
            if (currentHour < 7 || currentHour > 10) {
              return []
            }

            const yesterday = new Date(startOfUtcDay(currentDate).getTime() - DAY_MS)
            const hasYesterday = await deps.dailyConsolidator.hasDailySummary(yesterday)
            if (!hasYesterday) {
              return []
            }

            const daily = await deps.dailyConsolidator.readDailySummary(yesterday)
            if (daily === null) {
              return []
            }

            let overdueCount = 0
            if (deps.commitmentStore !== null) {
              try {
                overdueCount = (await deps.commitmentStore.listOverdue()).length
              } catch {
                overdueCount = 0
              }
            }

            return [{
              trigger: { type: "time", subtype: "morning_brief" },
              urgency: 0.8,
              message_draft: `Morning brief: ${firstChars(daily.summary, 200)} | Overdue commitments: ${overdueCount}`,
            }]
          } catch {
            return []
          }
        },
        async () => {
          try {
            if (deps.commitmentStore === null) {
              return []
            }

            const overdue = await deps.commitmentStore.listOverdue()
            return overdue.slice(0, 3).map(commitment => ({
              trigger: {
                type: "pattern",
                subtype: "commitment_overdue",
                commitment: commitment.description,
              },
              urgency: calculateCommitmentUrgency(commitment, currentDate),
              message_draft: formatCommitmentOverdueMessage(commitment, currentDate),
            }))
          } catch {
            return []
          }
        },
        async () => {
          try {
            if (currentHour < 14 || currentHour > 17) {
              return []
            }

            if (startOfUtcDay(currentDate).getUTCDay() !== 5) {
              return []
            }

            return [{
              trigger: { type: "time", subtype: "weekly_review" },
              urgency: 0.6,
              message_draft: "It's Friday afternoon — time for a weekly review.",
            }]
          } catch {
            return []
          }
        },
        async () => {
          try {
            if (deps.decisionStore === null) {
              return []
            }

            const reversed = await deps.decisionStore.listByStatus("reversed")
            const explicitReversals: EvaluatedTrigger[] = reversed.slice(0, 2).map(decision => ({
              trigger: {
                type: "pattern",
                subtype: "decision_reversal",
                decision: decision.title,
              },
              urgency: 0.7,
              message_draft: `Previously reversed decision: ${decision.title}`,
            }))

            const allDecisions = await deps.decisionStore.list()
            const activeDecisions = allDecisions.filter(item => item.status === "decided" || item.status === "implemented")
            const implicitReversals: EvaluatedTrigger[] = []

            for (let leftIndex = 0; leftIndex < activeDecisions.length; leftIndex += 1) {
              for (let rightIndex = leftIndex + 1; rightIndex < activeDecisions.length; rightIndex += 1) {
                const leftDecision = activeDecisions[leftIndex]
                const rightDecision = activeDecisions[rightIndex]
                if (!isImplicitDecisionReversal(leftDecision, rightDecision)) {
                  continue
                }

                implicitReversals.push({
                  trigger: {
                    type: "pattern",
                    subtype: "decision_reversal",
                    decision: `${leftDecision.title} vs ${rightDecision.title}`,
                  },
                  urgency: 0.65,
                  message_draft: `Potential decision reversal detected: '${leftDecision.title}' vs '${rightDecision.title}'`,
                })
              }
            }

            return [...explicitReversals, ...implicitReversals].slice(0, 3)
          } catch {
            return []
          }
        },
        async () => {
          try {
            const topicCounts = new Map<string, number>()
            const topicLabels = new Map<string, string>()

            for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
              const date = new Date(startOfUtcDay(currentDate).getTime() - (dayOffset * DAY_MS))
              const daily = await deps.dailyConsolidator.readDailySummary(date)
              if (daily === null || daily.topics.length === 0) {
                continue
              }

              const seenTopicsForDay = new Set<string>()
              for (const topic of daily.topics) {
                const normalized = normalizeTopic(topic)
                if (normalized.length === 0 || seenTopicsForDay.has(normalized)) {
                  continue
                }
                seenTopicsForDay.add(normalized)
                topicLabels.set(normalized, topic.trim())
                topicCounts.set(normalized, (topicCounts.get(normalized) ?? 0) + 1)
              }
            }

            return Array.from(topicCounts.entries())
              .filter(([, count]) => count >= 3)
              .sort((left, right) => {
                if (right[1] !== left[1]) {
                  return right[1] - left[1]
                }
                return left[0].localeCompare(right[0])
              })
              .slice(0, 3)
              .map(([topicKey, count]) => {
                const topicLabel = topicLabels.get(topicKey) ?? topicKey
                return {
                  trigger: {
                    type: "pattern",
                    subtype: "repeated_topic",
                    topic: topicLabel,
                    count,
                  },
                  urgency: 0.4,
                  message_draft: `Recurring topic: ${topicLabel} (appeared in ${count} of last 7 days)`,
                }
              })
          } catch {
            return []
          }
        },
      ]

      const settled = await Promise.allSettled(evaluators.map(evaluator => evaluator()))
      const collected: EvaluatedTrigger[] = []
      for (const result of settled) {
        if (result.status === "fulfilled") {
          collected.push(...result.value)
        }
      }

      collected.sort((a, b) => b.urgency - a.urgency)
      return collected
    },
  }
}
