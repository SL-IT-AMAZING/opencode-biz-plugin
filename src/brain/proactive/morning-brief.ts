import type { DailyConsolidator } from "../consolidation/daily-consolidator"
import type { CommitmentStore, DecisionStore } from "../stores/types"
import type { DailyMemory } from "../types"

const DAY_MS = 86_400_000

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS))
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildFormattedMorningBrief(
  yesterdayDateKey: string,
  daily: DailyMemory,
  overdueCommitments: Array<{ description: string; assigned_to: string; due_date?: string }>,
  pendingDecisions: Array<{ title: string; context: string }>,
): string {
  const lines: string[] = [
    `📋 모닝 브리프 (${yesterdayDateKey})`,
    "",
    `어제 요약: ${daily.summary}`,
  ]

  if (overdueCommitments.length > 0) {
    lines.push("", `⚠️ 미완료 약속 (${overdueCommitments.length}건):`)
    for (const commitment of overdueCommitments) {
      lines.push(`- ${commitment.description} (담당: ${commitment.assigned_to})`)
    }
  }

  if (pendingDecisions.length > 0) {
    lines.push("", "🤔 대기 중 의사결정:")
    for (const decision of pendingDecisions) {
      lines.push(`- ${decision.title}: ${decision.context}`)
    }
  }

  if (daily.open_questions.length > 0) {
    lines.push("", "❓ 미해결 질문:")
    for (const question of daily.open_questions) {
      lines.push(`- ${question}`)
    }
  }

  if (daily.continuation_notes.trim().length > 0) {
    lines.push("", `📝 이어서: ${daily.continuation_notes}`)
  }

  return lines.join("\n").trim()
}

export interface MorningBriefDeps {
  dailyConsolidator: DailyConsolidator
  commitmentStore: CommitmentStore | null
  decisionStore: DecisionStore | null
}

export interface MorningBriefGenerator {
  generate(today?: Date): Promise<MorningBrief | null>
}

export interface MorningBrief {
  date: string
  yesterday_summary: string
  overdue_commitments: Array<{ description: string; assigned_to: string; due_date?: string }>
  pending_decisions: Array<{ title: string; context: string }>
  open_questions: string[]
  continuation_notes: string
  formatted: string
}

export function createMorningBriefGenerator(deps: MorningBriefDeps): MorningBriefGenerator {
  return {
    async generate(today = new Date()): Promise<MorningBrief | null> {
      const todayUtc = startOfUtcDay(today)
      const yesterday = addDays(todayUtc, -1)

      const daily = await deps.dailyConsolidator.readDailySummary(yesterday)
      if (daily === null) {
        return null
      }

      let overdueCommitments: Array<{ description: string; assigned_to: string; due_date?: string }> = []
      if (deps.commitmentStore !== null) {
        try {
          const overdue = await deps.commitmentStore.listOverdue(todayUtc)
          overdueCommitments = overdue.map(commitment => ({
            description: commitment.description,
            assigned_to: commitment.assigned_to,
            due_date: commitment.due_date,
          }))
        } catch {
          overdueCommitments = []
        }
      }

      let pendingDecisions: Array<{ title: string; context: string }> = []
      if (deps.decisionStore !== null) {
        try {
          const proposed = await deps.decisionStore.listByStatus("proposed")
          pendingDecisions = proposed.slice(0, 3).map(decision => ({
            title: decision.title,
            context: decision.context,
          }))
        } catch {
          pendingDecisions = []
        }
      }

      const yesterdayDateKey = toDateKey(yesterday)
      const brief: MorningBrief = {
        date: toDateKey(todayUtc),
        yesterday_summary: daily.summary,
        overdue_commitments: overdueCommitments,
        pending_decisions: pendingDecisions,
        open_questions: daily.open_questions,
        continuation_notes: daily.continuation_notes,
        formatted: buildFormattedMorningBrief(yesterdayDateKey, daily, overdueCommitments, pendingDecisions),
      }

      return brief
    },
  }
}
