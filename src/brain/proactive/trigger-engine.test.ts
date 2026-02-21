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
  public decisions: DecisionRecord[] = []
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
    if (this.decisions.length > 0) {
      return this.decisions
    }
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

  test("#given overdue commitment with due_date 5 days ago #when evaluateTriggers #then urgency scales to 0.95", async () => {
    const currentDate = mondayDate()
    commitmentStore.overdue = [makeCommitment({
      description: "Follow up with vendor",
      due_date: addDays(currentDate, -5).toISOString(),
    })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-17", 11, { currentDate })
    const overdueTrigger = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(overdueTrigger?.urgency).toBeCloseTo(0.95, 5)
    expect(overdueTrigger?.message_draft).toContain("Overdue by 5 days")
  })

  test("#given overdue commitment with due_date 25 days ago #when evaluateTriggers #then urgency is capped at 1.0", async () => {
    const currentDate = mondayDate()
    commitmentStore.overdue = [makeCommitment({
      description: "Legacy migration",
      due_date: addDays(currentDate, -25).toISOString(),
    })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-18", 11, { currentDate })
    const overdueTrigger = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(overdueTrigger?.urgency).toBe(1)
  })

  test("#given overdue commitment without due_date #when evaluateTriggers #then keeps default urgency and message", async () => {
    commitmentStore.overdue = [makeCommitment({ description: "Unscheduled task", due_date: undefined })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-19", 11, { currentDate: mondayDate() })
    const overdueTrigger = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(overdueTrigger?.urgency).toBe(0.9)
    expect(overdueTrigger?.message_draft).toBe("Overdue: Unscheduled task")
  })

  test("#given invalid overdue due_date #when evaluateTriggers #then falls back to default urgency", async () => {
    commitmentStore.overdue = [makeCommitment({ description: "Bad date", due_date: "not-a-date" })]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-20", 11, { currentDate: mondayDate() })
    const overdueTrigger = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "commitment_overdue")
    expect(overdueTrigger?.urgency).toBe(0.9)
    expect(overdueTrigger?.message_draft).toBe("Overdue: Bad date")
  })

  test("#given similar decision titles and opposing outcomes #when evaluateTriggers #then adds implicit decision reversal trigger", async () => {
    decisionStore.decisions = [
      makeDecision({ id: "dec-1", status: "decided", title: "Adopt postgres as primary database", decision: "Adopt Postgres", reasoning: "Strong consistency" }),
      makeDecision({ id: "dec-2", status: "implemented", title: "Adopt postgres as primary database now", decision: "Move to MySQL", reasoning: "Operational familiarity" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-21", 11, { currentDate: mondayDate() })
    const implicitTrigger = result.find(item => item.message_draft.startsWith("Potential decision reversal detected:"))
    expect(implicitTrigger).toBeDefined()
    expect(implicitTrigger?.urgency).toBe(0.65)
  })

  test("#given similar titles but identical decision and reasoning #when evaluateTriggers #then does not add implicit reversal", async () => {
    decisionStore.decisions = [
      makeDecision({ id: "dec-1", status: "decided", title: "Switch to edge cache strategy", decision: "Enable edge cache", reasoning: "Improve latency" }),
      makeDecision({ id: "dec-2", status: "implemented", title: "Switch to edge cache strategy now", decision: "Enable edge cache", reasoning: "Improve latency" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-22", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.message_draft.startsWith("Potential decision reversal detected:"))).toBe(false)
  })

  test("#given low title overlap decisions #when evaluateTriggers #then does not add implicit reversal", async () => {
    decisionStore.decisions = [
      makeDecision({ id: "dec-1", status: "decided", title: "Move CI to self hosted runners", decision: "Self-host CI", reasoning: "Control cost" }),
      makeDecision({ id: "dec-2", status: "implemented", title: "Rename navigation labels", decision: "Keep hosted CI", reasoning: "Simplicity" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-23", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.message_draft.startsWith("Potential decision reversal detected:"))).toBe(false)
  })

  test("#given non-final decision statuses #when evaluateTriggers #then skips implicit reversal detection", async () => {
    decisionStore.decisions = [
      makeDecision({ id: "dec-1", status: "proposed", title: "Adopt bun runtime", decision: "Use Bun", reasoning: "Fast startup" }),
      makeDecision({ id: "dec-2", status: "proposed", title: "Adopt bun runtime soon", decision: "Stay with Node", reasoning: "Ecosystem" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-24", 11, { currentDate: mondayDate() })
    expect(result.some(item => item.message_draft.startsWith("Potential decision reversal detected:"))).toBe(false)
  })

  test("#given explicit and implicit reversals exceed limit #when evaluateTriggers #then returns at most 3 decision reversal triggers", async () => {
    decisionStore.reversed = [
      makeDecision({ id: "dec-r1", title: "Rollback search index" }),
      makeDecision({ id: "dec-r2", title: "Undo CDN migration" }),
      makeDecision({ id: "dec-r3", title: "Revert cache layer" }),
    ]
    decisionStore.decisions = [
      makeDecision({ id: "dec-1", status: "decided", title: "Adopt event sourcing architecture", decision: "Adopt", reasoning: "Audit trail" }),
      makeDecision({ id: "dec-2", status: "implemented", title: "Adopt event sourcing architecture now", decision: "Do not adopt", reasoning: "Complexity" }),
    ]

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-25", 11, { currentDate: mondayDate() })
    const reversalTriggers = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "decision_reversal")
    expect(reversalTriggers).toHaveLength(3)
  })

  test("#given repeated topics across 3 days #when evaluateTriggers #then emits repeated_topic trigger", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["database"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["database", "api"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -2)), makeDaily({ topics: ["database"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-26", 11, { currentDate })
    const repeated = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")
    expect(repeated).toBeDefined()
    if (repeated?.trigger.type === "pattern" && repeated.trigger.subtype === "repeated_topic") {
      expect(repeated.trigger.topic).toBe("database")
      expect(repeated.trigger.count).toBe(3)
    }
    expect(repeated?.urgency).toBe(0.4)
  })

  test("#given repeated topic appears multiple times in one day #when evaluateTriggers #then counts that day once", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["ops", "ops", "OPS"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["ops"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -2)), makeDaily({ topics: ["Ops"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-27", 11, { currentDate })
    const repeated = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")
    expect(repeated).toBeDefined()
    if (repeated?.trigger.type === "pattern" && repeated.trigger.subtype === "repeated_topic") {
      expect(repeated.trigger.count).toBe(3)
    }
  })

  test("#given 4 repeated topics #when evaluateTriggers #then returns top 3 by count descending", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["api", "infra", "billing", "search"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["api", "infra", "billing", "search"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -2)), makeDaily({ topics: ["api", "infra", "billing"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -3)), makeDaily({ topics: ["api", "infra"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -4)), makeDaily({ topics: ["api"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-28", 11, { currentDate })
    const repeated = result.filter(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")
    expect(repeated).toHaveLength(3)
    if (repeated[0]?.trigger.type === "pattern" && repeated[0].trigger.subtype === "repeated_topic") {
      expect(repeated[0].trigger.topic).toBe("api")
      expect(repeated[0].trigger.count).toBe(5)
    }
    if (repeated[1]?.trigger.type === "pattern" && repeated[1].trigger.subtype === "repeated_topic") {
      expect(repeated[1].trigger.topic).toBe("infra")
      expect(repeated[1].trigger.count).toBe(4)
    }
    if (repeated[2]?.trigger.type === "pattern" && repeated[2].trigger.subtype === "repeated_topic") {
      expect(repeated[2].trigger.topic).toBe("billing")
      expect(repeated[2].trigger.count).toBe(3)
    }
  })

  test("#given topic appears in only 2 days #when evaluateTriggers #then no repeated_topic trigger", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["build"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["build"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-29", 11, { currentDate })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")).toBe(false)
  })

  test("#given old topic outside 7 day window #when evaluateTriggers #then ignores old occurrence", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["security"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["security"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -8)), makeDaily({ topics: ["security"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-30", 11, { currentDate })
    expect(result.some(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")).toBe(false)
  })

  test("#given repeated topic detected #when evaluateTriggers #then message follows recurring topic format", async () => {
    const currentDate = mondayDate()
    dailyConsolidator.summaries.set(toDateKey(currentDate), makeDaily({ topics: ["quality"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -1)), makeDaily({ topics: ["quality"] }))
    dailyConsolidator.summaries.set(toDateKey(addDays(currentDate, -2)), makeDaily({ topics: ["quality"] }))

    const engine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore: null,
      akashicReader: null,
      dailyConsolidator,
    })

    const result = await engine.evaluateTriggers("ses-31", 11, { currentDate })
    const repeated = result.find(item => item.trigger.type === "pattern" && item.trigger.subtype === "repeated_topic")
    expect(repeated?.message_draft).toBe("Recurring topic: quality (appeared in 3 of last 7 days)")
  })
})
