import { beforeEach, describe, expect, test } from "bun:test"
import { createTriggerEngine } from "./trigger-engine"
import type { CommitmentStore, DecisionStore } from "../stores/types"
import type { Commitment, DecisionRecord, DailyMemory, PersonRecord, Provenance } from "../types"
import type { DailyConsolidationResult, DailyConsolidator } from "../consolidation/daily-consolidator"

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * 86_400_000))
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: "com-1",
    created_at: "2026-02-22T10:00:00.000Z",
    description: "Default commitment",
    assigned_to: "owner",
    source_event_id: "evt-1",
    status: "overdue",
    schema_version: 1,
    ...overrides,
  }
}

function defaultProvenance(): Provenance {
  return {
    source_type: "manual",
    source_id: "src-1",
    confidence: 0.8,
    created_by: "user",
  }
}

function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "dec-1",
    timestamp: "2026-02-22T10:00:00.000Z",
    title: "Default reversed decision",
    context: "Context",
    decision: "Decision",
    reasoning: "Reasoning",
    alternatives_considered: [],
    participants: [],
    confidence: "medium",
    status: "reversed",
    provenance: defaultProvenance(),
    vault_path: "vault/decision.md",
    schema_version: 1,
    ...overrides,
  }
}

function makeDaily(overrides: Partial<DailyMemory> = {}): DailyMemory {
  return {
    date: "2026-02-22",
    summary: "Default daily summary",
    key_decisions: [],
    files_changed: [],
    topics: [],
    open_questions: [],
    continuation_notes: "",
    ...overrides,
  }
}

class FakeCommitmentStore implements CommitmentStore {
  public overdue: Commitment[] = []
  public throwOnListOverdue = false

  async add(): Promise<void> {}

  async get(): Promise<Commitment | undefined> {
    return undefined
  }

  async listByStatus(status: Commitment["status"]): Promise<Commitment[]> {
    return this.overdue.filter(item => item.status === status)
  }

  async listOverdue(): Promise<Commitment[]> {
    if (this.throwOnListOverdue) {
      throw new Error("listOverdue failed")
    }
    return this.overdue
  }

  async complete(): Promise<Commitment | undefined> {
    return undefined
  }

  async cancel(): Promise<Commitment | undefined> {
    return undefined
  }

  async update(): Promise<Commitment | undefined> {
    return undefined
  }

  async list(): Promise<Commitment[]> {
    return this.overdue
  }

  async count(): Promise<number> {
    return this.overdue.length
  }
}

class FakeDecisionStore implements DecisionStore {
  public reversed: DecisionRecord[] = []
  public throwOnReversed = false

  async add(): Promise<void> {}

  async get(): Promise<DecisionRecord | undefined> {
    return undefined
  }

  async listByStatus(status: DecisionRecord["status"]): Promise<DecisionRecord[]> {
    if (status === "reversed") {
      if (this.throwOnReversed) {
        throw new Error("reversed lookup failed")
      }
      return this.reversed
    }
    return []
  }

  async search(): Promise<DecisionRecord[]> {
    return []
  }

  async update(): Promise<DecisionRecord | undefined> {
    return undefined
  }

  async list(): Promise<DecisionRecord[]> {
    return this.reversed
  }

  async count(): Promise<number> {
    return this.reversed.length
  }
}

class FakeDailyConsolidator implements DailyConsolidator {
  public summaries = new Map<string, DailyMemory>()

  async consolidateDate(date: Date): Promise<DailyConsolidationResult> {
    const daily = makeDaily({ date: toDateKey(date) })
    this.summaries.set(toDateKey(date), daily)
    return {
      daily,
      eventsProcessed: 0,
      timestamp: "2026-02-22T12:00:00.000Z",
    }
  }

  async hasDailySummary(date: Date): Promise<boolean> {
    return this.summaries.has(toDateKey(date))
  }

  async readDailySummary(date: Date): Promise<DailyMemory | null> {
    return this.summaries.get(toDateKey(date)) ?? null
  }
}

function mondayDate(): Date {
  return new Date(Date.UTC(2026, 1, 23, 15, 0, 0))
}

function fridayDate(): Date {
  return new Date(Date.UTC(2026, 1, 27, 15, 0, 0))
}

describe("brain/proactive/trigger-engine", () => {
  let commitmentStore: FakeCommitmentStore
  let decisionStore: FakeDecisionStore
  let dailyConsolidator: FakeDailyConsolidator

  beforeEach(() => {
    commitmentStore = new FakeCommitmentStore()
    decisionStore = new FakeDecisionStore()
    dailyConsolidator = new FakeDailyConsolidator()
  })

  test("#given no stores available #when evaluateTriggers #then returns empty array", async () => {
    const engine = createTriggerEngine({
      commitmentStore: null,
      decisionStore: null,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-1", 12, { currentDate: mondayDate() })
    expect(result).toEqual([])
  })

  test("#given morning hour (8) and yesterday summary exists #when evaluateTriggers #then returns morning_brief trigger", async () => {
    const today = mondayDate()
    const yesterday = addDays(startOfUtcDay(today), -1)
    dailyConsolidator.summaries.set(toDateKey(yesterday), makeDaily({ summary: "Yesterday summary text" }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-2", 8, { currentDate: today })
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "morning_brief")).toBe(true)
  })

  test("#given afternoon hour (15) #when evaluateTriggers #then no morning_brief trigger", async () => {
    const today = mondayDate()
    const yesterday = addDays(startOfUtcDay(today), -1)
    dailyConsolidator.summaries.set(toDateKey(yesterday), makeDaily({ summary: "Exists but should not trigger" }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-3", 15, { currentDate: today })
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "morning_brief")).toBe(false)
  })

  test("#given overdue commitments exist #when evaluateTriggers #then returns commitment_overdue triggers", async () => {
    commitmentStore.overdue = [
      makeCommitment({ id: "com-1", description: "Ship release", assigned_to: "alice" }),
      makeCommitment({ id: "com-2", description: "Write changelog", assigned_to: "bob" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-4", 11, { currentDate: mondayDate() })
    const commitmentTriggers = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(commitmentTriggers).toHaveLength(2)
  })

  test("#given 5 overdue commitments #when evaluateTriggers #then returns max 3 commitment triggers", async () => {
    commitmentStore.overdue = Array.from({ length: 5 }, (_, index) => makeCommitment({
      id: `com-${index}`,
      description: `Task ${index}`,
      assigned_to: `person-${index}`,
    }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-5", 11, { currentDate: mondayDate() })
    const commitmentTriggers = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(commitmentTriggers).toHaveLength(3)
  })

  test("#given no overdue commitments #when evaluateTriggers #then no commitment triggers", async () => {
    commitmentStore.overdue = []

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-6", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")).toBe(false)
  })

  test("#given reversed decisions exist #when evaluateTriggers #then returns decision_reversal triggers", async () => {
    decisionStore.reversed = [
      makeDecision({ id: "dec-1", title: "Rollback architecture" }),
      makeDecision({ id: "dec-2", title: "Undo migration" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-7", 11, { currentDate: mondayDate() })
    const decisionTriggers = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")
    expect(decisionTriggers).toHaveLength(2)
  })

  test("#given max 4 reversed decisions #when evaluateTriggers #then returns max 2 decision triggers", async () => {
    decisionStore.reversed = Array.from({ length: 4 }, (_, index) => makeDecision({
      id: `dec-${index}`,
      title: `Reversal ${index}`,
    }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-8", 11, { currentDate: mondayDate() })
    const decisionTriggers = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")
    expect(decisionTriggers).toHaveLength(2)
  })

  test("#given Friday at 15:00 #when evaluateTriggers #then returns weekly_review trigger", async () => {
    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-9", 15, { currentDate: fridayDate() })
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "weekly_review")).toBe(true)
  })

  test("#given Monday at 15:00 #when evaluateTriggers #then no weekly_review trigger", async () => {
    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-10", 15, { currentDate: mondayDate() })
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "weekly_review")).toBe(false)
  })

  test("#given multiple trigger types fire #when evaluateTriggers #then results sorted by urgency desc", async () => {
    commitmentStore.overdue = [makeCommitment({ description: "Urgent commitment", assigned_to: "alice" })]
    decisionStore.reversed = [makeDecision({ title: "Revisit policy" })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-11", 15, { currentDate: fridayDate() })
    expect(result).toHaveLength(3)
    expect(result[0]?.urgency).toBe(0.9)
    expect(result[1]?.urgency).toBe(0.7)
    expect(result[2]?.urgency).toBe(0.6)
  })

  test("#given commitmentStore throws #when evaluateTriggers #then gracefully degrades", async () => {
    commitmentStore.throwOnListOverdue = true
    decisionStore.reversed = [makeDecision({ title: "Still available" })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-12", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")).toBe(false)
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")).toBe(true)
  })

  test("#given decisionStore throws #when evaluateTriggers #then other triggers still work", async () => {
    commitmentStore.overdue = [makeCommitment({ description: "Commitment survives", assigned_to: "alice" })]
    decisionStore.throwOnReversed = true

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-13", 15, { currentDate: fridayDate() })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")).toBe(false)
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")).toBe(true)
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "weekly_review")).toBe(true)
  })

  test("#given dailyConsolidator returns null for yesterday #when evaluateTriggers at 8am #then no morning_brief", async () => {
    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-14", 8, { currentDate: mondayDate() })
    expect(result.some(item => item.trigger.type === "time" && item.trigger.subtype === "morning_brief")).toBe(false)
  })

  test("#given commitmentStore is null #when evaluateTriggers #then skips commitment check", async () => {
    decisionStore.reversed = [makeDecision({ title: "Only decision trigger" })]

    const engine = createTriggerEngine({
      commitmentStore: null,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-15", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")).toBe(false)
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")).toBe(true)
  })

  test("#given morning brief + overdue commitments #when evaluateTriggers #then morning brief includes overdue count", async () => {
    const today = mondayDate()
    const yesterday = addDays(startOfUtcDay(today), -1)
    commitmentStore.overdue = [
      makeCommitment({ id: "com-1", description: "A", assigned_to: "alice" }),
      makeCommitment({ id: "com-2", description: "B", assigned_to: "bob" }),
    ]
    dailyConsolidator.summaries.set(toDateKey(yesterday), makeDaily({
      summary: "Yesterday summary with notable outcomes and context.",
    }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-16", 8, { currentDate: today })
    const morningBrief = result.find(item => item.trigger.type === "time" && item.trigger.subtype === "morning_brief")
    expect(morningBrief).toBeDefined()
    expect(morningBrief?.message_draft).toContain("Overdue commitments: 2")
  })
})
