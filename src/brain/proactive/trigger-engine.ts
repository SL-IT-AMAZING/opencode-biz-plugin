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
              urgency: 0.9,
              message_draft: `Overdue: ${commitment.description} (assigned to ${commitment.assigned_to})`,
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
            return reversed.slice(0, 2).map(decision => ({
              trigger: {
                type: "pattern",
                subtype: "decision_reversal",
                decision: decision.title,
              },
              urgency: 0.7,
              message_draft: `Previously reversed decision: ${decision.title}`,
            }))
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
