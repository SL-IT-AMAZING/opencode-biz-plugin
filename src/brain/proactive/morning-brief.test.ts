import { beforeEach, describe, expect, test } from "bun:test"
import { createMorningBriefGenerator } from "./morning-brief"
import type { DailyConsolidationResult, DailyConsolidator } from "../consolidation/daily-consolidator"
import type { CommitmentStore, DecisionStore } from "../stores/types"
import type { Commitment, DailyMemory, DecisionRecord, Provenance } from "../types"

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function makeDaily(overrides: Partial<DailyMemory> = {}): DailyMemory {
  return {
    date: "2026-02-21",
    summary: "어제 요약 내용",
    key_decisions: [],
    files_changed: [],
    topics: [],
    open_questions: [],
    continuation_notes: "",
    ...overrides,
  }
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-1",
    created_at: "2026-02-20T10:00:00Z",
    description: "Test commitment",
    assigned_to: "CEO",
    status: "overdue",
    source_event_id: "evt-1",
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
    id: "d-1",
    timestamp: "2026-02-22T01:00:00.000Z",
    title: "가격 정책 재검토",
    context: "신규 고객 유입 둔화",
    decision: "베이직 요금제 변경",
    reasoning: "전환율 개선 필요",
    alternatives_considered: [],
    participants: [],
    confidence: "medium",
    status: "proposed",
    provenance: defaultProvenance(),
    vault_path: "vault/decisions/d-1.md",
    schema_version: 1,
    ...overrides,
  }
}

class FakeDailyConsolidator implements DailyConsolidator {
  public summary: DailyMemory | null = null

  async consolidateDate(date: Date): Promise<DailyConsolidationResult> {
    const daily = makeDaily({ date: toDateKey(date) })
    return {
      daily,
      eventsProcessed: 0,
      timestamp: "2026-02-22T09:00:00.000Z",
    }
  }

  async hasDailySummary(): Promise<boolean> {
    return this.summary !== null
  }

  async readDailySummary(): Promise<DailyMemory | null> {
    return this.summary
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
    return this.overdue.filter(commitment => commitment.status === status)
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
  public proposed: DecisionRecord[] = []

  async add(): Promise<void> {}

  async get(): Promise<DecisionRecord | undefined> {
    return undefined
  }

  async listByStatus(status: DecisionRecord["status"]): Promise<DecisionRecord[]> {
    if (status !== "proposed") {
      return []
    }
    return this.proposed
  }

  async search(): Promise<DecisionRecord[]> {
    return []
  }

  async update(): Promise<DecisionRecord | undefined> {
    return undefined
  }

  async list(): Promise<DecisionRecord[]> {
    return this.proposed
  }

  async count(): Promise<number> {
    return this.proposed.length
  }
}

describe("brain/proactive/morning-brief", () => {
  let dailyConsolidator: FakeDailyConsolidator
  let commitmentStore: FakeCommitmentStore
  let decisionStore: FakeDecisionStore

  const today = new Date(Date.UTC(2026, 1, 22, 9, 0, 0))

  beforeEach(() => {
    dailyConsolidator = new FakeDailyConsolidator()
    commitmentStore = new FakeCommitmentStore()
    decisionStore = new FakeDecisionStore()
  })

  test("#given no yesterday summary #when generate #then returns null", async () => {
    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief).toBeNull()
  })

  test("#given yesterday summary exists #when generate #then returns MorningBrief with yesterday_summary", async () => {
    dailyConsolidator.summary = makeDaily({ summary: "전일 진행 요약" })
    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief).not.toBeNull()
    expect(brief?.yesterday_summary).toBe("전일 진행 요약")
  })

  test("#given overdue commitments exist #when generate #then formatted includes \"미완료 약속\" section", async () => {
    dailyConsolidator.summary = makeDaily()
    commitmentStore.overdue = [
      makeCommitment({ description: "고객 미팅 후속 메일", assigned_to: "민지" }),
    ]

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief?.formatted).toContain("미완료 약속")
    expect(brief?.formatted).toContain("고객 미팅 후속 메일")
  })

  test("#given no overdue commitments #when generate #then formatted does not include \"미완료 약속\"", async () => {
    dailyConsolidator.summary = makeDaily()
    commitmentStore.overdue = []

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief?.formatted.includes("미완료 약속")).toBe(false)
  })

  test("#given pending decisions exist #when generate #then formatted includes \"대기 중 의사결정\"", async () => {
    dailyConsolidator.summary = makeDaily()
    decisionStore.proposed = [
      makeDecision({ title: "채용 프로세스 조정", context: "면접 리드타임 단축 필요" }),
    ]

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief?.formatted).toContain("대기 중 의사결정")
    expect(brief?.formatted).toContain("채용 프로세스 조정")
  })

  test("#given open questions in yesterday summary #when generate #then formatted includes \"미해결 질문\"", async () => {
    dailyConsolidator.summary = makeDaily({
      open_questions: ["온보딩 문서 구조를 분리해야 할까?"],
    })

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief?.formatted).toContain("미해결 질문")
    expect(brief?.formatted).toContain("온보딩 문서 구조를 분리해야 할까?")
  })

  test("#given continuation notes in yesterday summary #when generate #then formatted includes \"이어서\"", async () => {
    dailyConsolidator.summary = makeDaily({ continuation_notes: "오전 10시에 투자자 업데이트 작성 재개" })

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief?.formatted).toContain("이어서")
    expect(brief?.formatted).toContain("오전 10시에 투자자 업데이트 작성 재개")
  })

  test("#given commitmentStore is null #when generate #then skips overdue section gracefully", async () => {
    dailyConsolidator.summary = makeDaily()

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore: null,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief).not.toBeNull()
    expect(brief?.overdue_commitments).toEqual([])
    expect(brief?.formatted.includes("미완료 약속")).toBe(false)
  })

  test("#given commitmentStore throws #when generate #then degrades gracefully", async () => {
    dailyConsolidator.summary = makeDaily()
    commitmentStore.throwOnListOverdue = true

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief).not.toBeNull()
    expect(brief?.overdue_commitments).toEqual([])
    expect(brief?.formatted.includes("미완료 약속")).toBe(false)
  })

  test("#given full morning brief data #when generate #then formatted contains all sections in Korean", async () => {
    dailyConsolidator.summary = makeDaily({
      summary: "핵심 과제 3개를 정리하고 우선순위를 재배치했다.",
      open_questions: ["다음 스프린트에 검색 개선을 포함할까?"],
      continuation_notes: "결정 로그를 문서화하고 오후에 검토",
    })
    commitmentStore.overdue = [
      makeCommitment({ description: "파트너십 계약 초안 피드백", assigned_to: "지훈" }),
    ]
    decisionStore.proposed = [
      makeDecision({ title: "신규 플랜 출시 시점", context: "Q2 마케팅 일정과 정합" }),
    ]

    const generator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    const brief = await generator.generate(today)

    expect(brief).not.toBeNull()
    expect(brief?.formatted).toContain("📋 모닝 브리프")
    expect(brief?.formatted).toContain("어제 요약")
    expect(brief?.formatted).toContain("⚠️ 미완료 약속")
    expect(brief?.formatted).toContain("🤔 대기 중 의사결정")
    expect(brief?.formatted).toContain("❓ 미해결 질문")
    expect(brief?.formatted).toContain("📝 이어서")
  })
})
