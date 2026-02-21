import { describe, expect, test } from "bun:test"
import { computeScore, createSpeakConfig, isQuietHours, isWithinMinInterval, shouldSpeak } from "./scoring"
import type { BudgetState, SpeakScore } from "./types"

const BASE_CONFIG = createSpeakConfig({
  threshold: 0.6,
  daily_budget: 2,
  min_interval_minutes: 30,
  quiet_hours: { start: 22, end: 8 },
})

const BASE_BUDGET: BudgetState = {
  date: "2026-02-22",
  messages_sent: 0,
  last_message_at: null,
}

const PASSING_SCORE: SpeakScore = {
  urgency: 1,
  attention_state: 1,
  time_of_day: 1,
  recency: 1,
  receptivity: 1,
  total: 0.8,
}

describe("computeScore", () => {
  test("#given all zeros #when computeScore #then total is 0", () => {
    const result = computeScore({
      urgency: 0,
      attention_state: 0,
      time_of_day: 0,
      recency: 0,
      receptivity: 0,
    })

    expect(result.total).toBe(0)
  })

  test("#given all ones #when computeScore #then total is 1", () => {
    const result = computeScore({
      urgency: 1,
      attention_state: 1,
      time_of_day: 1,
      recency: 1,
      receptivity: 1,
    })

    expect(result.total).toBe(1)
  })

  test("#given mixed factors #when computeScore #then weighted total is correct", () => {
    const result = computeScore({
      urgency: 0.5,
      attention_state: 0.8,
      time_of_day: 0.2,
      recency: 0.9,
      receptivity: 0.4,
    })

    const expected = (0.5 * 0.3) + (0.8 * 0.15) + (0.2 * 0.15) + (0.9 * 0.2) + (0.4 * 0.2)
    expect(result.total).toBeCloseTo(expected, 10)
  })

  test("#given factors above one #when computeScore #then values are clamped to one", () => {
    const result = computeScore({
      urgency: 5,
      attention_state: 2,
      time_of_day: 4,
      recency: 3,
      receptivity: 9,
    })

    expect(result.urgency).toBe(1)
    expect(result.attention_state).toBe(1)
    expect(result.time_of_day).toBe(1)
    expect(result.recency).toBe(1)
    expect(result.receptivity).toBe(1)
    expect(result.total).toBe(1)
  })
})

describe("shouldSpeak", () => {
  test("#given quiet hours #when shouldSpeak #then it returns quiet_hours", () => {
    const decision = shouldSpeak(PASSING_SCORE, BASE_CONFIG, BASE_BUDGET, 23)

    expect(decision).toEqual({
      speak: false,
      reason: "quiet_hours",
      score: PASSING_SCORE.total,
    })
  })

  test("#given exhausted budget #when shouldSpeak #then it returns budget_exhausted", () => {
    const decision = shouldSpeak(
      PASSING_SCORE,
      BASE_CONFIG,
      { ...BASE_BUDGET, messages_sent: 2 },
      12,
    )

    expect(decision).toEqual({
      speak: false,
      reason: "budget_exhausted",
      score: PASSING_SCORE.total,
    })
  })

  test("#given recent last message #when shouldSpeak #then it returns too_recent", () => {
    const now = new Date("2026-02-22T12:00:00.000Z")
    const fiveMinutesAgo = new Date(now.getTime() - (5 * 60_000)).toISOString()

    const decision = shouldSpeak(
      PASSING_SCORE,
      BASE_CONFIG,
      { ...BASE_BUDGET, last_message_at: fiveMinutesAgo },
      12,
      now,
    )

    expect(decision).toEqual({
      speak: false,
      reason: "too_recent",
      score: PASSING_SCORE.total,
    })
  })

  test("#given score below threshold #when shouldSpeak #then it returns below_threshold", () => {
    const lowScore: SpeakScore = {
      ...PASSING_SCORE,
      total: 0.59,
    }

    const decision = shouldSpeak(lowScore, BASE_CONFIG, BASE_BUDGET, 12)

    expect(decision).toEqual({
      speak: false,
      reason: "below_threshold",
      score: lowScore.total,
    })
  })

  test("#given all conditions pass #when shouldSpeak #then it returns score_passed", () => {
    const decision = shouldSpeak(PASSING_SCORE, BASE_CONFIG, BASE_BUDGET, 12)

    expect(decision).toEqual({
      speak: true,
      reason: "score_passed",
      score: PASSING_SCORE.total,
    })
  })
})

describe("isQuietHours", () => {
  test("#given wrap-around quiet hours #when hour is 23 #then result is true", () => {
    expect(isQuietHours(23, { start: 22, end: 8 })).toBe(true)
  })

  test("#given wrap-around quiet hours #when hour is 3 #then result is true", () => {
    expect(isQuietHours(3, { start: 22, end: 8 })).toBe(true)
  })

  test("#given wrap-around quiet hours #when hour is 12 #then result is false", () => {
    expect(isQuietHours(12, { start: 22, end: 8 })).toBe(false)
  })
})

describe("isWithinMinInterval", () => {
  test("#given null last message #when isWithinMinInterval #then result is false", () => {
    expect(isWithinMinInterval(null, 30, new Date("2026-02-22T12:00:00.000Z"))).toBe(false)
  })

  test("#given five minute old message #when interval is thirty #then result is true", () => {
    const now = new Date("2026-02-22T12:00:00.000Z")
    const fiveMinutesAgo = new Date(now.getTime() - (5 * 60_000)).toISOString()

    expect(isWithinMinInterval(fiveMinutesAgo, 30, now)).toBe(true)
  })
})

describe("createSpeakConfig", () => {
  test("#given no overrides #when createSpeakConfig #then defaults match spec", () => {
    expect(createSpeakConfig()).toEqual({
      threshold: 0.6,
      daily_budget: 2,
      min_interval_minutes: 30,
      quiet_hours: { start: 22, end: 8 },
    })
  })

  test("#given partial overrides #when createSpeakConfig #then defaults are merged", () => {
    expect(createSpeakConfig({ threshold: 0.75, daily_budget: 5 })).toEqual({
      threshold: 0.75,
      daily_budget: 5,
      min_interval_minutes: 30,
      quiet_hours: { start: 22, end: 8 },
    })
  })
})
