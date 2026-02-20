import type { DailyMemory } from "../types"
import type { Heartbeat, HeartbeatConfig, HeartbeatDeps } from "./types"

const DAY_MS = 86_400_000

const DEFAULT_CONFIG: HeartbeatConfig = {
  cacheTtlMs: 30 * 60 * 1000,
  maxTokenBudget: 400,
  lookbackDays: 3,
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS))
}

function totalChars(sections: string[]): number {
  return sections.reduce((sum, section) => sum + section.length, 0)
}

function truncateToBudget(sections: string[], maxChars: number): string[] {
  const next = [...sections]
  let current = totalChars(next)

  while (current > maxChars && next.length > 0) {
    let longestIndex = 0
    for (let index = 1; index < next.length; index += 1) {
      if (next[index].length > next[longestIndex].length) {
        longestIndex = index
      }
    }

    const overflow = current - maxChars
    const longest = next[longestIndex]
    const targetLength = Math.max(0, longest.length - overflow - 3)
    const shortened = targetLength > 0 ? `${longest.slice(0, targetLength)}...` : "..."
    next[longestIndex] = shortened
    current = totalChars(next)
  }

  return next
}

async function readLookbackDailies(deps: HeartbeatDeps, lookbackDays: number): Promise<Array<{ date: Date; daily: DailyMemory }>> {
  const dailies: Array<{ date: Date; daily: DailyMemory }> = []
  const today = startOfUtcDay(new Date())

  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const day = addDays(today, -offset)
    try {
      const daily = await deps.dailyConsolidator.readDailySummary(day)
      if (daily !== null) {
        dailies.push({ date: day, daily })
      }
    } catch {
      continue
    }
  }

  return dailies
}

function buildDecisionsSection(dailies: Array<{ date: Date; daily: DailyMemory }>): string {
  const decisions: string[] = []

  for (const { date, daily } of dailies) {
    const dateKey = date.toISOString().slice(0, 10)
    for (const decision of daily.key_decisions) {
      decisions.push(`- ${dateKey}: ${decision.decision} - ${decision.context}`)
      if (decisions.length >= 5) {
        return `<brain-decisions>\n${decisions.join("\n")}\n</brain-decisions>`
      }
    }
  }

  if (decisions.length === 0) {
    return ""
  }

  return `<brain-decisions>\n${decisions.join("\n")}\n</brain-decisions>`
}

function buildOpenQuestionsSection(dailies: Array<{ date: Date; daily: DailyMemory }>): string {
  const questions: string[] = []

  for (const { date, daily } of dailies) {
    const dateKey = date.toISOString().slice(0, 10)
    for (const question of daily.open_questions) {
      questions.push(`- ${dateKey}: ${question}`)
      if (questions.length >= 5) {
        return `<brain-open-questions>\n${questions.join("\n")}\n</brain-open-questions>`
      }
    }
  }

  if (questions.length === 0) {
    return ""
  }

  return `<brain-open-questions>\n${questions.join("\n")}\n</brain-open-questions>`
}

export function createHeartbeat(deps: HeartbeatDeps, config: Partial<HeartbeatConfig> = {}): Heartbeat {
  const resolvedConfig: HeartbeatConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  }
  const cache = new Map<string, { sections: string[]; computedAt: number }>()

  return {
    async getSystemContext(sessionId: string): Promise<string[]> {
      const cached = cache.get(sessionId)
      const now = Date.now()
      if (cached && (now - cached.computedAt) < resolvedConfig.cacheTtlMs) {
        return cached.sections
      }

      const sections: string[] = []

      try {
        try {
          const soulFile = Bun.file(deps.paths.soulFile)
          if (await soulFile.exists()) {
            const soulText = await soulFile.text()
            const excerpt = soulText.slice(0, 300)
            if (excerpt.length > 0) {
              sections.push(`<brain-identity>\n${excerpt}\n</brain-identity>`)
            }
          }
        } catch {}

        let lookbackDailies: Array<{ date: Date; daily: DailyMemory }> = []
        try {
          lookbackDailies = await readLookbackDailies(deps, resolvedConfig.lookbackDays)
        } catch {
          lookbackDailies = []
        }

        try {
          const yesterdayDaily = lookbackDailies.at(0)?.daily
          if (yesterdayDaily) {
            sections.push(
              `<brain-yesterday>\n${yesterdayDaily.summary}\nContinuation: ${yesterdayDaily.continuation_notes}\n</brain-yesterday>`,
            )
          }
        } catch {}

        try {
          const decisions = buildDecisionsSection(lookbackDailies)
          if (decisions.length > 0) {
            sections.push(decisions)
          }
        } catch {}

        try {
          const openQuestions = buildOpenQuestionsSection(lookbackDailies)
          if (openQuestions.length > 0) {
            sections.push(openQuestions)
          }
        } catch {}
      } catch {}

      const computedSections = sections.length > 0
        ? [
            "<brain-heartbeat>\nThe brain memory system has proactive context for this session. Use brain_search for deeper retrieval.\n</brain-heartbeat>",
            ...sections,
          ]
        : []

      const maxChars = resolvedConfig.maxTokenBudget * 4
      const budgetedSections = totalChars(computedSections) > maxChars
        ? truncateToBudget(computedSections, maxChars)
        : computedSections

      cache.set(sessionId, {
        sections: budgetedSections,
        computedAt: now,
      })

      return budgetedSections
    },

    invalidateSession(sessionId: string): void {
      cache.delete(sessionId)
    },
  }
}
