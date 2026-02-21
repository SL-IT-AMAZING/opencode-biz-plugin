import { beforeEach, describe, expect, it } from "bun:test"
import { createDebateTools } from "./debate-tools"
import type { BrainToolDeps } from "./types"
import type { AkashicEvent, Commitment, DecisionRecord, PersonRecord, Provenance } from "../brain/types"
import type { AkashicLogger } from "../brain/akashic/types"
import type { BrainDatabase, MarkdownIndexer } from "../brain/search/types"
import type { BrainPaths } from "../brain/vault/paths"
import type { ToolContext } from "@opencode-ai/plugin/tool"

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

interface ToolResponseBase {
  success: boolean
  error?: string
}

interface DebateResponse extends ToolResponseBase {
  debate_id: string
  evidence_summary: {
    decisions: number
    commitments: number
    people: number
    events: number
    vault_items: number
    entity_connections: number
    total: number
    gathering_ms: number
  }
  structured_prompt: string
}

interface ReviewResponse extends ToolResponseBase {
  decision_id: string
  title: string
  status: string
  outcomes_count: number
  review_prompt: string
}

const mockProvenance: Provenance = {
  source_type: "manual",
  source_id: "src-1",
  confidence: 0.9,
  created_by: "user",
}

const mockSearchDecision: DecisionRecord = {
  id: "dec-search-1",
  timestamp: "2026-02-01T09:00:00.000Z",
  title: "Search decision",
  context: "Search context",
  decision: "Use approach A",
  reasoning: "Faster implementation",
  alternatives_considered: ["Approach B"],
  participants: ["Alice"],
  confidence: "medium",
  status: "decided",
  provenance: mockProvenance,
  vault_path: "ceo/decisions/search-decision.md",
  schema_version: 1,
}

const mockDecisionWithOutcomes: DecisionRecord = {
  id: "dec-1",
  timestamp: "2026-02-02T11:00:00.000Z",
  title: "Primary decision",
  context: "Primary context",
  decision: "Ship MVP",
  reasoning: "Market timing",
  alternatives_considered: ["Delay release"],
  participants: ["Alice", "Bob"],
  confidence: "high",
  status: "implemented",
  outcomes: [
    {
      date: "2026-02-10",
      description: "User activation increased",
      assessment: "positive",
    },
  ],
  provenance: mockProvenance,
  vault_path: "ceo/decisions/primary-decision.md",
  schema_version: 1,
}

const mockCommitment: Commitment = {
  id: "com-1",
  created_at: "2026-02-01T12:00:00.000Z",
  description: "Finalize launch plan",
  assigned_to: "Alice",
  due_date: "2026-02-20",
  source_event_id: "ev-1",
  status: "pending",
  vault_path: "ceo/commitments/com-1.md",
  schema_version: 1,
}

const mockAlice: PersonRecord = {
  id: "person-1",
  name: "Alice",
  aliases: ["A"],
  role: "PM",
  company: "Acme",
  relationship: "team",
  first_seen: "2025-12-01T00:00:00.000Z",
  last_seen: "2026-02-01T00:00:00.000Z",
  interaction_count: 5,
  key_topics: ["launch", "roadmap"],
  notes: "Key stakeholder",
  vault_path: "ceo/people/alice.md",
  schema_version: 1,
}

function createMockPaths(): BrainPaths {
  const vault = "/tmp/mock-vault"
  const brain = `${vault}/_brain`
  const ceo = `${brain}/ceo`
  return {
    vault,
    brain,
    working: `${brain}/working`,
    daily: `${brain}/memory/daily`,
    akashicDaily: `${brain}/akashic/daily`,
    index: `${brain}/index`,
    locks: `${brain}/locks`,
    weeklyArchive: `${brain}/archive/weekly`,
    monthlyArchive: `${brain}/archive/monthly`,
    quarterlyArchive: `${brain}/archive/quarterly`,
    soulFile: `${brain}/soul.md`,
    configFile: `${brain}/config.md`,
    readmeFile: `${brain}/README.md`,
    dbFile: `${brain}/index/brain.sqlite`,
    stateFile: `${brain}/index/state.json`,
    lockFile: `${brain}/locks/writer.lock`,
    ceo,
    peopleStore: `${ceo}/people`,
    decisionsStore: `${ceo}/decisions`,
    commitmentsStore: `${ceo}/commitments`,
    ceoMeetings: `${ceo}/meetings`,
  }
}

function createMockToolDeps(options?: {
  decisionStore?: BrainToolDeps["decisionStore"]
  akashicLogger?: BrainToolDeps["akashicLogger"]
}): { deps: BrainToolDeps; loggedEvents: Array<Omit<AkashicEvent, "id" | "timestamp">> } {
  const loggedEvents: Array<Omit<AkashicEvent, "id" | "timestamp">> = []

  const defaultLogger: AkashicLogger = {
    log: async (event) => {
      loggedEvents.push(event)
      return {
        id: `log-${loggedEvents.length}`,
        timestamp: new Date().toISOString(),
        ...event,
      }
    },
    flush: async () => {},
    getLogPath: () => "akashic.log",
    close: async () => {},
  }

  const decisionStore: NonNullable<BrainToolDeps["decisionStore"]> = {
    add: async () => {},
    get: async (id) => (id === "dec-1" ? mockDecisionWithOutcomes : undefined),
    listByStatus: async () => [],
    search: async () => [mockSearchDecision],
    update: async () => mockDecisionWithOutcomes,
    list: async () => [mockSearchDecision],
    count: async () => 1,
  }

  const deps: BrainToolDeps = {
    paths: createMockPaths(),
    db: null as unknown as BrainDatabase,
    fts: {
      search: () => [
        {
          id: "fts-1",
          path: "notes.md",
          chunk_index: 0,
          content: "test content",
          fts_score: 0.8,
          vec_score: 0,
          temporal_score: 0.1,
          combined_score: 0.7,
        },
      ],
      searchByPath: () => [],
      highlight: () => [],
    },
    indexer: null as unknown as MarkdownIndexer,
    akashicReader: {
      readDate: async () => [],
      readRange: async () => [
        {
          id: "ev-1",
          timestamp: "2026-02-01T10:00:00.000Z",
          type: "decision.made",
          source: "ceo",
          priority: 50,
          data: { decision: "Test decision" },
        },
      ],
      queryByType: async () => [],
      queryByPath: async () => [],
      count: async () => 1,
    },
    hybridSearcher: null,
    microConsolidator: null,
    sleepConsolidator: null,
    personStore: {
      add: async () => {},
      get: async () => undefined,
      findByName: async (name) => (name === "Alice" ? [mockAlice] : []),
      update: async () => mockAlice,
      list: async () => [],
      count: async () => 0,
    },
    decisionStore: options?.decisionStore === undefined ? decisionStore : options.decisionStore,
    commitmentStore: {
      add: async () => {},
      get: async () => mockCommitment,
      listByStatus: async () => [],
      listOverdue: async () => [],
      complete: async () => mockCommitment,
      cancel: async () => mockCommitment,
      update: async () => mockCommitment,
      list: async () => [mockCommitment],
      count: async () => 1,
    },
    akashicLogger: options?.akashicLogger === undefined ? defaultLogger : options.akashicLogger,
    entityIndex: null,
    proactiveEngine: null,
    morningBriefGenerator: null,
  }

  return { deps, loggedEvents }
}

async function executeTool<T>(value: Promise<string>): Promise<T> {
  return JSON.parse(await value) as T
}

describe("debate tools", () => {
  let deps: BrainToolDeps
  let loggedEvents: Array<Omit<AkashicEvent, "id" | "timestamp">>

  beforeEach(() => {
    const mocked = createMockToolDeps()
    deps = mocked.deps
    loggedEvents = mocked.loggedEvents
  })

  describe("brain_debate", () => {
    it("returns success with evidence_summary and structured_prompt", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(result.success).toBe(true)
      expect(result.evidence_summary).toBeDefined()
      expect(result.structured_prompt).toBeString()
      expect(result.structured_prompt.length).toBeGreaterThan(0)
    })

    it("returns evidence_summary with expected field names", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(Object.keys(result.evidence_summary).sort()).toEqual(
        ["commitments", "decisions", "entity_connections", "events", "gathering_ms", "people", "total", "vault_items"].sort(),
      )
    })

    it("includes all role labels in structured_prompt", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(result.structured_prompt).toContain("Researcher")
      expect(result.structured_prompt).toContain("Advocate")
      expect(result.structured_prompt).toContain("Critic")
      expect(result.structured_prompt).toContain("Synthesizer")
      expect(result.structured_prompt).toContain("Devil's Advocate")
    })

    it("includes anti-sycophancy instructions in structured_prompt", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(result.structured_prompt).toContain("Anti-Sycophancy Protocol")
      expect(result.structured_prompt).toContain("Do NOT agree with other roles by default")
      expect(result.structured_prompt).toContain("Steelman the strongest opposing argument")
    })

    it("logs debate.initiated event", async () => {
      const tools = createDebateTools(deps)
      await tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext)

      expect(loggedEvents.length).toBe(1)
      expect(loggedEvents[0]?.type).toBe("debate.initiated")
      expect(loggedEvents[0]?.source).toBe("ceo")
    })

    it("works when akashicLogger is null", async () => {
      const mocked = createMockToolDeps({ akashicLogger: null })
      const tools = createDebateTools(mocked.deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(result.success).toBe(true)
    })

    it("generates a UUID debate_id", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<DebateResponse>(
        tools.brain_debate.execute({ question: "Should we launch now?", participants: ["Alice"] }, mockContext),
      )

      expect(result.debate_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })
  })

  describe("brain_review_decision", () => {
    it("returns success with Korean sections in review_prompt", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<ReviewResponse>(tools.brain_review_decision.execute({ decision_id: "dec-1" }, mockContext))

      expect(result.success).toBe(true)
      expect(result.review_prompt).toContain("# 의사결정 회고 분석")
      expect(result.review_prompt).toContain("## 원래 결정")
      expect(result.review_prompt).toContain("## 회고 분석 요청")
    })

    it("returns error when decision_id is not found", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<ToolResponseBase>(tools.brain_review_decision.execute({ decision_id: "missing" }, mockContext))

      expect(result.success).toBe(false)
      expect(result.error).toContain("Decision not found: missing")
    })

    it("returns error when decisionStore is null", async () => {
      const mocked = createMockToolDeps({ decisionStore: null })
      const tools = createDebateTools(mocked.deps)
      const result = await executeTool<ToolResponseBase>(tools.brain_review_decision.execute({ decision_id: "dec-1" }, mockContext))

      expect(result.success).toBe(false)
      expect(result.error).toBe("Decision store not available")
    })

    it("includes outcomes by default when include_outcomes is true", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<ReviewResponse>(tools.brain_review_decision.execute({ decision_id: "dec-1" }, mockContext))

      expect(result.success).toBe(true)
      expect(result.outcomes_count).toBe(1)
      expect(result.review_prompt).toContain("(positive)")
    })

    it("excludes outcomes when include_outcomes is false", async () => {
      const tools = createDebateTools(deps)
      const result = await executeTool<ReviewResponse>(
        tools.brain_review_decision.execute({ decision_id: "dec-1", include_outcomes: false }, mockContext),
      )

      expect(result.success).toBe(true)
      expect(result.outcomes_count).toBe(0)
      expect(result.review_prompt).toContain("아직 기록된 결과가 없습니다")
    })

    it("logs decision.reviewed event", async () => {
      const tools = createDebateTools(deps)
      await tools.brain_review_decision.execute({ decision_id: "dec-1" }, mockContext)

      expect(loggedEvents.length).toBe(1)
      expect(loggedEvents[0]?.type).toBe("decision.reviewed")
      expect(loggedEvents[0]?.source).toBe("ceo")
      expect(loggedEvents[0]?.data?.title).toBe("Primary decision")
    })
  })
})
