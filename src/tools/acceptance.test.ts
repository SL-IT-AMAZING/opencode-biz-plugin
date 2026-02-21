import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import type { AkashicEvent, Commitment, PersonRecord } from "../brain/types"
import { createCommitmentStore } from "../brain/stores/commitment-store"
import { createDecisionStore } from "../brain/stores/decision-store"
import { createPersonStore } from "../brain/stores/person-store"
import { createBrainPaths } from "../brain/vault/paths"
import { createMeetingTools } from "./meeting-tools"
import { createDecisionTools } from "./decision-tools"
import { createPeopleTools } from "./people-tools"
import { createCommitmentTools } from "./commitment-tools"
import type { BrainToolDeps } from "./types"

type AkashicLogInput = Omit<AkashicEvent, "id" | "timestamp">

type MeetingToolResponse = {
  success: boolean
  vault_path?: string
  event_id?: string
  summary?: string
  error?: string
  code?: string
}

type DecisionToolResponse = {
  success: boolean
  decision_id?: string
  vault_path?: string
  event_id?: string
  error?: string
  code?: string
}

type PeopleLookupResponse = {
  results: Array<{
    name: string
    role?: string
    company?: string
    relationship: PersonRecord["relationship"]
    last_seen: string
    interaction_count: number
    key_topics: string[]
    vault_path: string
  }>
  total: number
  message?: string
}

type CheckCommitmentsResponse = {
  results: Array<{
    id: string
    description: string
    assigned_to: string
    due_date?: string
    status: Commitment["status"]
    created_at: string
  }>
  summary: {
    pending: number
    overdue: number
    done: number
  }
  message?: string
}

const mockContext: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: "/tmp",
  worktree: "/tmp",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

let capturedAkashicEvents: AkashicLogInput[] = []
const openedDatabases: Database[] = []

function createDeterministicMeetingEventId(title: string, date: string, participants: string[]): string {
  const peopleKey = participants.map(person => person.trim().toLowerCase()).sort().join("-")
  const compactPeople = peopleKey.replace(/[^a-z0-9-]/g, "")
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
  return `meeting-${date}-${slug}-${compactPeople}`
}

function isCommitmentOverdue(commitment: Commitment, nowIso: string): boolean {
  return Boolean(
    commitment.due_date
      && commitment.due_date < nowIso
      && (commitment.status === "pending" || commitment.status === "in_progress"),
  )
}

function createMockDeps(tmpDir: string): BrainToolDeps {
  const paths = createBrainPaths(tmpDir)
  const personStore = createPersonStore(paths.peopleStore)
  const decisionStore = createDecisionStore(paths.decisionsStore)
  const commitmentStore = createCommitmentStore(paths.commitmentsStore)
  const db = new Database(":memory:")
  openedDatabases.push(db)
  capturedAkashicEvents = []

  return {
    paths,
    db: {
      raw: db,
      close: () => db.close(false),
      getChunks: () => [],
      upsertChunks: () => {},
      setEmbedding: () => {},
      getEmbedding: () => undefined,
      getAllEmbeddingsForSearch: () => [],
      getChunksNeedingEmbedding: () => [],
      clearEmbeddings: () => {},
      removeFile: () => {},
      getFileState: () => undefined,
      setFileState: () => {},
      getAllFileStates: () => ({}),
      getStats: () => ({ totalChunks: 0, totalFiles: 0, dbSizeBytes: 0 }),
      optimize: () => {},
      upsertEntity: () => {},
      findEntities: () => [],
      getEntity: () => undefined,
      updateEntitySeen: () => {},
      upsertRelation: () => {},
      getRelated: () => [],
      insertEntityEvent: () => {},
      getEntityEvents: () => [],
      getEventEntities: () => [],
    },
    fts: {
      search: () => [],
      searchByPath: () => [],
      highlight: () => [],
    },
    indexer: {
      indexFile: async () => ({ path: "", chunks: 0, skipped: true }),
      removeFile: () => {},
      fullScan: async () => ({ indexed: 0, skipped: 0, removed: 0, errors: [] }),
      getState: () => ({ files: {}, last_full_scan: "", schema_version: 1 }),
    },
    akashicReader: {
      readDate: async () => [],
      readRange: async () => [],
      queryByType: async () => [],
      queryByPath: async () => [],
      count: async () => 0,
    },
    hybridSearcher: null,
    microConsolidator: null,
    sleepConsolidator: null,
    personStore,
    decisionStore,
    commitmentStore,
    akashicLogger: {
      log: async (event) => {
        capturedAkashicEvents.push(event)
        return {
          ...event,
          id: `evt-${capturedAkashicEvents.length}`,
          timestamp: new Date().toISOString(),
        }
      },
      flush: async () => {},
      getLogPath: () => join(paths.akashicDaily, "test.jsonl"),
      close: async () => {},
    },
    entityIndex: null,
    proactiveEngine: null,
    morningBriefGenerator: null,
  }
}

describe("tools/acceptance", () => {
  let tmpDir = ""

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "acceptance-tools-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    while (openedDatabases.length > 0) {
      const db = openedDatabases.pop()
      db?.close(false)
    }
  })

  test("Log a meeting -> verify full side effects across systems", async () => {
    const deps = createMockDeps(tmpDir)
    const tools = createMeetingTools(deps)
    const date = new Date().toISOString().split("T")[0]
    const participants = ["김대표", "박투자자", "이사업개발"]

    const raw = await tools.brain_log_meeting.execute({
      title: "Series A Strategy Session",
      participants,
      notes: "시리즈 A 펀딩 전략 논의. 투자자 피칭 준비 및 재무 모델 검토.",
      decisions: ["투자 라운드 3월 시작", "리드 투자자 3곳 타겟팅"],
      action_items: [
        { task: "투자 피칭 덱 준비", assignee: "김대표", due_date: "2026-03-15" },
        { task: "재무 모델 업데이트", assignee: "이사업개발" },
      ],
    }, mockContext)
    const result = JSON.parse(raw) as MeetingToolResponse

    expect(result.success).toBe(true)
    expect(result.vault_path).toBeString()
    expect(result.event_id).toBeString()

    const absoluteVaultPath = join(tmpDir, result.vault_path!)
    expect(await Bun.file(absoluteVaultPath).exists()).toBe(true)

    const markdown = await Bun.file(absoluteVaultPath).text()
    expect(markdown).toContain("## Notes")
    expect(markdown).toContain("## Decisions")
    expect(markdown).toContain("## Action Items")
    expect(markdown).toContain("투자 피칭 덱 준비")

    expect(capturedAkashicEvents).toHaveLength(1)
    expect(capturedAkashicEvents[0]?.type).toBe("meeting.recorded")
    expect(capturedAkashicEvents[0]?.source).toBe("ceo")

    for (const participant of participants) {
      const found = await deps.personStore!.findByName(participant)
      expect(found).toHaveLength(1)
      expect(found[0]?.relationship).toBe("other")
      expect(found[0]?.first_seen).toBe(found[0]?.last_seen)
    }

    const expectedEventId = createDeterministicMeetingEventId("Series A Strategy Session", date, participants)
    const commitments = await deps.commitmentStore!.list()
    expect(result.event_id).toBe(expectedEventId)
    expect(commitments).toHaveLength(2)
    expect(commitments[0]?.source_event_id).toBe(expectedEventId)
    expect(commitments[1]?.source_event_id).toBe(expectedEventId)
  })

  test("Log a decision -> verify store + vault + akashic event", async () => {
    const deps = createMockDeps(tmpDir)
    const tools = createDecisionTools(deps)

    const raw = await tools.brain_log_decision.execute({
      title: "프리미엄 플랜 가격 결정",
      decision: "월 99,000원으로 설정",
      reasoning: "경쟁사 분석 결과 최적 가격대",
      participants: ["김대표", "마케팅팀장"],
    }, mockContext)
    const result = JSON.parse(raw) as DecisionToolResponse

    expect(result.success).toBe(true)
    const decisions = await deps.decisionStore!.list()
    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.title).toBe("프리미엄 플랜 가격 결정")
    expect(decisions[0]?.decision).toBe("월 99,000원으로 설정")
    expect(decisions[0]?.reasoning).toBe("경쟁사 분석 결과 최적 가격대")
    expect(decisions[0]?.provenance.source_type).toBe("conversation")
    expect(decisions[0]?.confidence).toBe("medium")

    const decisionPath = join(tmpDir, result.vault_path!)
    expect(await Bun.file(decisionPath).exists()).toBe(true)
    const markdown = await Bun.file(decisionPath).text()
    expect(markdown).toContain("프리미엄 플랜 가격 결정")

    expect(capturedAkashicEvents).toHaveLength(1)
    expect(capturedAkashicEvents[0]?.type).toBe("decision.made")
    expect(capturedAkashicEvents[0]?.source).toBe("ceo")
  })

  test("People lookup -> verify filtering by name/role/company/relationship", async () => {
    const deps = createMockDeps(tmpDir)
    const tools = createPeopleTools(deps)
    const baseFirstSeen = "2026-01-01T00:00:00.000Z"

    await deps.personStore!.add({
      id: "person-1",
      name: "김철수",
      role: "CEO",
      company: "테크스타트업",
      aliases: [],
      relationship: "team",
      first_seen: baseFirstSeen,
      last_seen: "2026-02-01T00:00:00.000Z",
      interaction_count: 3,
      key_topics: ["fundraising"],
      notes: "core founder",
      vault_path: "_brain/ceo/people/kim-cheolsu.md",
      schema_version: 1,
    })
    await deps.personStore!.add({
      id: "person-2",
      name: "박영희",
      role: "투자심사역",
      company: "벤처캐피탈A",
      aliases: [],
      relationship: "investor",
      first_seen: baseFirstSeen,
      last_seen: "2026-02-02T00:00:00.000Z",
      interaction_count: 5,
      key_topics: ["deal"],
      notes: "vc contact",
      vault_path: "_brain/ceo/people/park-younghee.md",
      schema_version: 1,
    })
    await deps.personStore!.add({
      id: "person-3",
      name: "이민준",
      role: "CTO",
      company: "테크스타트업",
      aliases: [],
      relationship: "team",
      first_seen: baseFirstSeen,
      last_seen: "2026-02-04T00:00:00.000Z",
      interaction_count: 4,
      key_topics: ["product"],
      notes: "technical lead",
      vault_path: "_brain/ceo/people/lee-minjun.md",
      schema_version: 1,
    })
    await deps.personStore!.add({
      id: "person-4",
      name: "최서연",
      role: "대표",
      company: "파트너사B",
      aliases: [],
      relationship: "partner",
      first_seen: baseFirstSeen,
      last_seen: "2026-02-03T00:00:00.000Z",
      interaction_count: 2,
      key_topics: ["partnership"],
      notes: "external partner",
      vault_path: "_brain/ceo/people/choi-seoyeon.md",
      schema_version: 1,
    })

    const byName = JSON.parse(
      await tools.brain_people_lookup.execute({ name: "김" }, mockContext),
    ) as PeopleLookupResponse
    expect(byName.total).toBe(1)
    expect(byName.results.map(person => person.name)).toEqual(["김철수"])

    const byRole = JSON.parse(
      await tools.brain_people_lookup.execute({ role: "cto" }, mockContext),
    ) as PeopleLookupResponse
    expect(byRole.total).toBe(1)
    expect(byRole.results[0]?.name).toBe("이민준")

    const byRelationship = JSON.parse(
      await tools.brain_people_lookup.execute({ relationship: "investor" }, mockContext),
    ) as PeopleLookupResponse
    expect(byRelationship.total).toBe(1)
    expect(byRelationship.results[0]?.name).toBe("박영희")
    expect(byRelationship.results[0]?.relationship).toBe("investor")

    const byCompany = JSON.parse(
      await tools.brain_people_lookup.execute({ company: "테크" }, mockContext),
    ) as PeopleLookupResponse
    expect(byCompany.total).toBe(2)
    expect(byCompany.results.map(person => person.name)).toEqual(["이민준", "김철수"])

    const allPeople = JSON.parse(await tools.brain_people_lookup.execute({}, mockContext)) as PeopleLookupResponse
    expect(allPeople.total).toBe(4)
    expect(allPeople.results.map(person => person.name)).toEqual(["이민준", "최서연", "박영희", "김철수"])
  })

  test("Check commitments -> verify status filtering + overdue detection + summary", async () => {
    const deps = createMockDeps(tmpDir)
    const tools = createCommitmentTools(deps)
    const seededCommitments: Commitment[] = [
      {
        id: "commitment-1",
        description: "투자 피칭 덱 준비",
        assigned_to: "김대표",
        status: "done",
        due_date: "2026-02-01",
        created_at: "2026-01-10T00:00:00.000Z",
        source_event_id: "seed-1",
        schema_version: 1,
      },
      {
        id: "commitment-2",
        description: "재무 모델 업데이트",
        assigned_to: "이사업개발",
        status: "pending",
        due_date: "2025-01-01",
        created_at: "2026-01-11T00:00:00.000Z",
        source_event_id: "seed-2",
        schema_version: 1,
      },
      {
        id: "commitment-3",
        description: "고객 인터뷰 10건",
        assigned_to: "김대표",
        status: "in_progress",
        due_date: "2026-03-01",
        created_at: "2026-01-12T00:00:00.000Z",
        source_event_id: "seed-3",
        schema_version: 1,
      },
      {
        id: "commitment-4",
        description: "기술 로드맵 작성",
        assigned_to: "박개발자",
        status: "pending",
        due_date: "2999-12-31",
        created_at: "2026-01-13T00:00:00.000Z",
        source_event_id: "seed-4",
        schema_version: 1,
      },
    ]

    for (const commitment of seededCommitments) {
      await deps.commitmentStore!.add(commitment)
    }

    const nowIso = new Date().toISOString()
    const expectedSummary = {
      pending: seededCommitments.filter(commitment => commitment.status === "pending").length,
      overdue: seededCommitments.filter(commitment => isCommitmentOverdue(commitment, nowIso)).length,
      done: seededCommitments.filter(commitment => commitment.status === "done").length,
    }

    const all = JSON.parse(await tools.brain_check_commitments.execute({}, mockContext)) as CheckCommitmentsResponse
    expect(all.results).toHaveLength(4)
    expect(all.summary).toEqual(expectedSummary)

    const doneOnly = JSON.parse(
      await tools.brain_check_commitments.execute({ status: "done" }, mockContext),
    ) as CheckCommitmentsResponse
    expect(doneOnly.results).toHaveLength(1)
    expect(doneOnly.results[0]?.status).toBe("done")
    expect(doneOnly.summary).toEqual(expectedSummary)

    const overdueOnly = JSON.parse(
      await tools.brain_check_commitments.execute({ overdue_only: true }, mockContext),
    ) as CheckCommitmentsResponse
    expect(overdueOnly.results.length).toBeGreaterThan(0)
    expect(overdueOnly.results.some(item => item.description === "재무 모델 업데이트")).toBe(true)
    for (const commitment of overdueOnly.results) {
      expect(commitment.due_date && commitment.due_date < nowIso).toBe(true)
      expect(["pending", "in_progress"]).toContain(commitment.status)
    }
    expect(overdueOnly.summary).toEqual(expectedSummary)

    const byPerson = JSON.parse(
      await tools.brain_check_commitments.execute({ person: "김" }, mockContext),
    ) as CheckCommitmentsResponse
    expect(byPerson.results).toHaveLength(2)
    expect(byPerson.results.map(result => result.assigned_to)).toEqual(["김대표", "김대표"])
    expect(byPerson.summary).toEqual(expectedSummary)
  })
})
