import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createReceptivityTracker } from "./receptivity"
import type { ReceptivityRecord } from "./types"

function makeRecord(overrides: Partial<ReceptivityRecord> = {}): ReceptivityRecord {
  return {
    trigger_type: "pattern",
    trigger_subtype: "commitment_overdue",
    user_reaction: "engaged",
    timestamp: new Date().toISOString(),
    session_id: "test-session",
    ...overrides,
  }
}

function computeExpectedWeightedAverage(records: ReceptivityRecord[]): number {
  const scores: Record<ReceptivityRecord["user_reaction"], number> = {
    engaged: 1,
    ignored: 0.3,
    dismissed: 0,
  }

  const recent = records.slice(-10).reverse()
  let weightedSum = 0
  let weightTotal = 0

  for (const [index, record] of recent.entries()) {
    const weight = 1 / (1 + index)
    weightedSum += scores[record.user_reaction] * weight
    weightTotal += weight
  }

  return weightTotal === 0 ? 0.5 : weightedSum / weightTotal
}

describe("brain/proactive/receptivity", () => {
  let tempDir: string
  let storagePath: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-receptivity-"))
    storagePath = join(tempDir, "receptivity.jsonl")
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  test("#given no history file #when getReceptivityScore #then returns 0.5 (neutral default)", async () => {
    const tracker = createReceptivityTracker(storagePath)

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBe(0.5)
  })

  test("#given no history file #when getOverallReceptivity #then returns 0.5", async () => {
    const tracker = createReceptivityTracker(storagePath)

    const score = await tracker.getOverallReceptivity()

    expect(score).toBe(0.5)
  })

  test("#given single engaged reaction #when getReceptivityScore for that trigger #then returns 1.0", async () => {
    const tracker = createReceptivityTracker(storagePath)
    await tracker.recordReaction(makeRecord({ user_reaction: "engaged" }))

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBe(1)
  })

  test("#given single dismissed reaction #when getReceptivityScore #then returns 0.0", async () => {
    const tracker = createReceptivityTracker(storagePath)
    await tracker.recordReaction(makeRecord({ user_reaction: "dismissed" }))

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBe(0)
  })

  test("#given mixed reactions (2 engaged, 1 ignored, 1 dismissed) #when getReceptivityScore #then returns weighted average", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const records = [
      makeRecord({ user_reaction: "engaged", timestamp: "2026-01-01T00:00:00.000Z" }),
      makeRecord({ user_reaction: "ignored", timestamp: "2026-01-02T00:00:00.000Z" }),
      makeRecord({ user_reaction: "dismissed", timestamp: "2026-01-03T00:00:00.000Z" }),
      makeRecord({ user_reaction: "engaged", timestamp: "2026-01-04T00:00:00.000Z" }),
    ]

    for (const record of records) {
      await tracker.recordReaction(record)
    }

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBeCloseTo(computeExpectedWeightedAverage(records), 10)
  })

  test("#given 15 records #when getReceptivityScore #then only uses last 10", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const records: ReceptivityRecord[] = []

    for (let i = 0; i < 15; i += 1) {
      const reaction: ReceptivityRecord["user_reaction"] = i < 5 ? "dismissed" : "engaged"
      const record = makeRecord({
        user_reaction: reaction,
        timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      })
      records.push(record)
      await tracker.recordReaction(record)
    }

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBeCloseTo(computeExpectedWeightedAverage(records.slice(-10)), 10)
    expect(score).toBe(1)
  })

  test("#given reactions for different triggers #when getReceptivityScore for specific trigger #then only counts matching records", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const matching = [
      makeRecord({ trigger_type: "pattern", trigger_subtype: "commitment_overdue", user_reaction: "engaged" }),
      makeRecord({ trigger_type: "pattern", trigger_subtype: "commitment_overdue", user_reaction: "ignored" }),
    ]

    const nonMatching = [
      makeRecord({ trigger_type: "time", trigger_subtype: "morning_brief", user_reaction: "dismissed" }),
      makeRecord({ trigger_type: "context", trigger_subtype: "topic_seen_before", user_reaction: "dismissed" }),
    ]

    for (const record of [...matching, ...nonMatching]) {
      await tracker.recordReaction(record)
    }

    const score = await tracker.getReceptivityScore("pattern", "commitment_overdue")

    expect(score).toBeCloseTo(computeExpectedWeightedAverage(matching), 10)
  })

  test("#given multiple records #when getHistory with limit=3 #then returns 3 most recent", async () => {
    const tracker = createReceptivityTracker(storagePath)

    for (let i = 1; i <= 5; i += 1) {
      await tracker.recordReaction(
        makeRecord({
          session_id: `session-${i}`,
          timestamp: new Date(Date.UTC(2026, 0, i)).toISOString(),
        }),
      )
    }

    const history = await tracker.getHistory(3)

    expect(history).toHaveLength(3)
    expect(history[0]?.session_id).toBe("session-5")
    expect(history[1]?.session_id).toBe("session-4")
    expect(history[2]?.session_id).toBe("session-3")
  })

  test("#given empty history #when getHistory #then returns empty array", async () => {
    const tracker = createReceptivityTracker(storagePath)

    const history = await tracker.getHistory()

    expect(history).toEqual([])
  })

  test("#given reaction recorded #when getHistory #then record appears in history", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const record = makeRecord({ session_id: "history-check" })
    await tracker.recordReaction(record)

    const history = await tracker.getHistory()

    expect(history).toHaveLength(1)
    expect(history[0]).toEqual(record)
  })

  test("#given multiple reactions #when getOverallReceptivity #then considers all trigger types", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const records = [
      makeRecord({ trigger_type: "time", trigger_subtype: "morning_brief", user_reaction: "engaged" }),
      makeRecord({ trigger_type: "pattern", trigger_subtype: "commitment_overdue", user_reaction: "ignored" }),
      makeRecord({ trigger_type: "context", trigger_subtype: "person_mentioned", user_reaction: "dismissed" }),
      makeRecord({ trigger_type: "pattern", trigger_subtype: "repeated_topic", user_reaction: "engaged" }),
    ]

    for (const record of records) {
      await tracker.recordReaction(record)
    }

    const overall = await tracker.getOverallReceptivity()

    expect(overall).toBeCloseTo(computeExpectedWeightedAverage(records), 10)
  })

  test("#given receptivity tracker #when recordReaction #then file is created and contains record", async () => {
    const tracker = createReceptivityTracker(storagePath)
    const record = makeRecord({ session_id: "file-check" })

    await tracker.recordReaction(record)

    const fileContent = await Bun.file(storagePath).text()
    const lines = fileContent.split("\n").filter(line => line.length > 0)
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0] as string) as ReceptivityRecord).toEqual(record)
  })
})
