import { describe, test, expect } from "bun:test"
import type { SearchCandidate } from "../types"
import { applyTemporalDecay, type TemporalMetadata } from "./temporal-decay"

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

function makeCandidate(id: string, combinedScore: number): SearchCandidate {
  return {
    id,
    path: `docs/${id}.md`,
    chunk_index: 0,
    content: `content for ${id}`,
    fts_score: 0,
    vec_score: 0,
    temporal_score: 1,
    combined_score: combinedScore,
  }
}

function makeMetadata(updatedAt: string, isEvergreen = false): TemporalMetadata {
  return {
    created_at: updatedAt,
    updated_at: updatedAt,
    is_evergreen: isEvergreen,
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - (days * MILLIS_PER_DAY)).toISOString()
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + (days * MILLIS_PER_DAY)).toISOString()
}

describe("brain/search/temporal-decay", () => {
  test("#given fresh doc → multiplier is approximately 1.0", () => {
    // #given
    const candidate = makeCandidate("fresh", 1)
    const metadata = new Map([["fresh", makeMetadata(new Date().toISOString())]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata)

    // #then
    expect(decayed[0].temporal_score).toBeCloseTo(1, 3)
    expect(decayed[0].combined_score).toBeCloseTo(1, 3)
  })

  test("#given 30-day-old doc with half-life 30 → multiplier is approximately 0.5", () => {
    // #given
    const candidate = makeCandidate("thirty-days", 1)
    const metadata = new Map([["thirty-days", makeMetadata(daysAgo(30))]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata, 30)

    // #then
    expect(decayed[0].temporal_score).toBeCloseTo(0.5, 2)
    expect(decayed[0].combined_score).toBeCloseTo(0.5, 2)
  })

  test("#given 60-day-old doc with half-life 30 → multiplier is approximately 0.25", () => {
    // #given
    const candidate = makeCandidate("sixty-days", 1)
    const metadata = new Map([["sixty-days", makeMetadata(daysAgo(60))]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata, 30)

    // #then
    expect(decayed[0].temporal_score).toBeCloseTo(0.25, 2)
    expect(decayed[0].combined_score).toBeCloseTo(0.25, 2)
  })

  test("#given evergreen doc → multiplier remains 1.0 regardless of age", () => {
    // #given
    const candidate = makeCandidate("evergreen", 0.6)
    const metadata = new Map([["evergreen", makeMetadata(daysAgo(365), true)]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata)

    // #then
    expect(decayed[0].temporal_score).toBe(1)
    expect(decayed[0].combined_score).toBeCloseTo(0.6)
  })

  test("#given very old doc and floor=0.2 → multiplier is clamped at floor", () => {
    // #given
    const candidate = makeCandidate("ancient", 1)
    const metadata = new Map([["ancient", makeMetadata(daysAgo(3650))]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata, 30, 0.2)

    // #then
    expect(decayed[0].temporal_score).toBeCloseTo(0.2)
    expect(decayed[0].combined_score).toBeCloseTo(0.2)
  })

  test("#given missing metadata → applies no decay", () => {
    // #given
    const candidate = makeCandidate("missing", 0.75)

    // #when
    const decayed = applyTemporalDecay([candidate], new Map())

    // #then
    expect(decayed[0].temporal_score).toBe(1)
    expect(decayed[0].combined_score).toBeCloseTo(0.75)
  })

  test("#given fresh lower-score and old higher-score docs → re-sorts by decayed score", () => {
    // #given
    const candidates = [
      makeCandidate("old-high", 0.9),
      makeCandidate("fresh-low", 0.4),
    ]
    const metadata = new Map<string, TemporalMetadata>([
      ["old-high", makeMetadata(daysAgo(60))],
      ["fresh-low", makeMetadata(daysAgo(0))],
    ])

    // #when
    const decayed = applyTemporalDecay(candidates, metadata, 30)

    // #then
    expect(decayed[0].id).toBe("fresh-low")
    expect(decayed[1].id).toBe("old-high")
  })

  test("#given future updated_at date → clamps age to 0 and applies no decay", () => {
    // #given
    const candidate = makeCandidate("future", 0.9)
    const metadata = new Map([["future", makeMetadata(daysFromNow(7))]])

    // #when
    const decayed = applyTemporalDecay([candidate], metadata)

    // #then
    expect(decayed[0].temporal_score).toBe(1)
    expect(decayed[0].combined_score).toBeCloseTo(0.9)
  })
})
