import type { BudgetState, SpeakConfig, SpeakDecision, SpeakScore } from "./types"

const DEFAULT_SPEAK_CONFIG: SpeakConfig = {
  threshold: 0.6,
  daily_budget: 2,
  min_interval_minutes: 30,
  quiet_hours: {
    start: 22,
    end: 8,
  },
}

const SCORE_WEIGHTS: Omit<SpeakScore, "total"> = {
  urgency: 0.3,
  attention_state: 0.15,
  time_of_day: 0.15,
  recency: 0.2,
  receptivity: 0.2,
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

function normalizeHour(hour: number): number {
  const normalized = Math.floor(hour) % 24
  return normalized < 0 ? normalized + 24 : normalized
}

export function createSpeakConfig(overrides: Partial<SpeakConfig> = {}): SpeakConfig {
  return {
    ...DEFAULT_SPEAK_CONFIG,
    ...overrides,
    quiet_hours: {
      ...DEFAULT_SPEAK_CONFIG.quiet_hours,
      ...overrides.quiet_hours,
    },
  }
}

export function computeScore(factors: Omit<SpeakScore, "total">): SpeakScore {
  const score: Omit<SpeakScore, "total"> = {
    urgency: clamp01(factors.urgency),
    attention_state: clamp01(factors.attention_state),
    time_of_day: clamp01(factors.time_of_day),
    recency: clamp01(factors.recency),
    receptivity: clamp01(factors.receptivity),
  }

  const total = clamp01(
    (score.urgency * SCORE_WEIGHTS.urgency)
      + (score.attention_state * SCORE_WEIGHTS.attention_state)
      + (score.time_of_day * SCORE_WEIGHTS.time_of_day)
      + (score.recency * SCORE_WEIGHTS.recency)
      + (score.receptivity * SCORE_WEIGHTS.receptivity),
  )

  return {
    ...score,
    total,
  }
}

export function isQuietHours(hour: number, quietHours: { start: number; end: number }): boolean {
  const current = normalizeHour(hour)
  const start = normalizeHour(quietHours.start)
  const end = normalizeHour(quietHours.end)

  if (start === end) {
    return true
  }

  if (start < end) {
    return current >= start && current < end
  }

  return current >= start || current < end
}

export function isWithinMinInterval(
  lastMessageAt: string | null,
  minIntervalMinutes: number,
  now: Date = new Date(),
): boolean {
  if (lastMessageAt === null) {
    return false
  }

  const parsed = new Date(lastMessageAt)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }

  const elapsedMinutes = (now.getTime() - parsed.getTime()) / 60_000
  return elapsedMinutes < minIntervalMinutes
}

export function shouldSpeak(
  factors: SpeakScore,
  config: SpeakConfig,
  budgetState: BudgetState,
  currentHour: number,
  now: Date = new Date(),
): SpeakDecision {
  const score = clamp01(factors.total)

  if (isQuietHours(currentHour, config.quiet_hours)) {
    return { speak: false, reason: "quiet_hours", score }
  }

  if (budgetState.messages_sent >= config.daily_budget) {
    return { speak: false, reason: "budget_exhausted", score }
  }

  if (isWithinMinInterval(budgetState.last_message_at, config.min_interval_minutes, now)) {
    return { speak: false, reason: "too_recent", score }
  }

  if (score < config.threshold) {
    return { speak: false, reason: "below_threshold", score }
  }

  return { speak: true, reason: "score_passed", score }
}
