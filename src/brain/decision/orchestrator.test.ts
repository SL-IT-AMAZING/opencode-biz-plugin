import { describe, expect, it } from "bun:test"
import { assembleEvidencePack, buildDebatePrompt } from "./orchestrator"
import type { EvidencePack, EvidencePackDeps } from "./types"

function createMockDeps(): EvidencePackDeps {
  return {
    decisionStore: {
      async search(query: string) {
        return [
          {
            id: "decision-1",
            timestamp: "2026-02-01T10:00:00.000Z",
            title: `Plan for ${query}`,
            context: "Context",
            decision: "Proceed with staged launch",
            reasoning: "Prior pilots showed strong retention",
            alternatives_considered: ["Delay launch"],
            participants: ["Alice", "Bob"],
            confidence: "high",
            status: "decided",
            outcomes: [{ date: "2026-02-02", description: "Initial adoption improved", assessment: "positive" }],
            provenance: { source_type: "manual", source_id: "src-1", confidence: 0.9, created_by: "user" },
            vault_path: "decisions/decision-1.md",
            schema_version: 1,
          },
          {
            id: "decision-2",
            timestamp: "2026-02-03T10:00:00.000Z",
            title: "Secondary decision",
            context: "Context",
            decision: "Keep monitoring",
            reasoning: "Need more data",
            alternatives_considered: ["Immediate expansion"],
            participants: ["Alice"],
            confidence: "medium",
            status: "proposed",
            provenance: { source_type: "manual", source_id: "src-2", confidence: 0.8, created_by: "user" },
            vault_path: "decisions/decision-2.md",
            schema_version: 1,
          },
        ]
      },
      async list() {
        return []
      },
      async listByStatus() {
        return []
      },
    },
    commitmentStore: {
      async list() {
        return [
          {
            id: "commitment-1",
            created_at: "2026-02-01T09:00:00.000Z",
            description: "Prepare launch checklist and staged plan",
            assigned_to: "Alice",
            due_date: "2026-02-10",
            source_event_id: "event-1",
            status: "pending",
            vault_path: "commitments/commitment-1.md",
            schema_version: 1,
          },
          {
            id: "commitment-2",
            created_at: "2026-02-01T09:30:00.000Z",
            description: "Collect customer feedback",
            assigned_to: "Bob",
            due_date: "2026-02-12",
            source_event_id: "event-2",
            status: "in_progress",
            vault_path: "commitments/commitment-2.md",
            schema_version: 1,
          },
        ]
      },
      async listOverdue() {
        return [
          {
            id: "commitment-2",
            created_at: "2026-02-01T09:30:00.000Z",
            description: "Collect customer feedback",
            assigned_to: "Bob",
            due_date: "2026-02-12",
            source_event_id: "event-2",
            status: "overdue",
            vault_path: "commitments/commitment-2.md",
            schema_version: 1,
          },
          {
            id: "commitment-3",
            created_at: "2026-02-01T11:00:00.000Z",
            description: "Finalize migration fallback",
            assigned_to: "Carol",
            due_date: "2026-02-08",
            source_event_id: "event-3",
            status: "overdue",
            vault_path: "commitments/commitment-3.md",
            schema_version: 1,
          },
        ]
      },
      async listByStatus() {
        return []
      },
    },
    personStore: {
      async list() {
        return []
      },
      async findByName(name: string) {
        if (name.toLowerCase() === "alice") {
          return [{
            id: "person-1",
            name: "Alice",
            aliases: ["A"],
            role: "CEO",
            company: "Acme",
            relationship: "team",
            first_seen: "2025-01-01T00:00:00.000Z",
            last_seen: "2026-02-01T12:00:00.000Z",
            interaction_count: 12,
            key_topics: ["launch", "quality"],
            notes: "Key stakeholder",
            vault_path: "people/alice.md",
            schema_version: 1,
          }]
        }
        return []
      },
    },
    akashicReader: {
      async readRange() {
        return [
          {
            id: "event-priority",
            timestamp: "2026-02-05T10:00:00.000Z",
            type: "file.modified",
            source: "thalamus",
            priority: 40,
            data: { description: "High-priority change" },
          },
          {
            id: "event-ceo",
            timestamp: "2026-02-06T10:00:00.000Z",
            type: "decision.made",
            source: "ceo",
            priority: 10,
            data: { decision: "Approved rollout" },
          },
          {
            id: "event-low",
            timestamp: "2026-02-06T11:00:00.000Z",
            type: "file.created",
            source: "thalamus",
            priority: 5,
            data: { description: "Low priority note" },
          },
        ]
      },
      async queryByType() {
        return []
      },
    },
    hybridSearcher: {
      async search() {
        return [
          {
            id: "search-1",
            path: "vault/fallback.md",
            chunk_index: 0,
            content: "fallback hybrid search content",
            fts_score: 0.5,
            vec_score: 0.4,
            temporal_score: 0.3,
            combined_score: 0.6,
          },
        ]
      },
      async searchWithCitations() {
        return [
          {
            id: "cited-1",
            path: "vault/strategy.md",
            chunk_index: 0,
            content: "Strategy notes from last quarter",
            fts_score: 0.8,
            vec_score: 0.9,
            temporal_score: 0.7,
            combined_score: 0.92,
            provenance: {
              source_file: "vault/strategy.md",
              source_date: "2026-01-20",
              original_quote: "Pilot conversion improved by 22%",
            },
          },
        ]
      },
    },
    fts: {
      search() {
        return [
          {
            id: "fts-1",
            path: "vault/notes.md",
            chunk_index: 0,
            content: "fts snippet content",
            fts_score: 0.7,
            vec_score: 0,
            temporal_score: 0.1,
            combined_score: 0.7,
          },
        ]
      },
    },
    entityIndex: {
      async findEntity(query: string) {
        if (query.toLowerCase() === "alice") {
          return [{
            id: "entity-alice",
            type: "person",
            name: "Alice",
            aliases: ["A"],
            vault_path: "people/alice.md",
            first_seen: "2025-01-01T00:00:00.000Z",
            last_seen: "2026-02-01T12:00:00.000Z",
            interaction_count: 12,
          }]
        }
        return []
      },
      async getRelated() {
        return [
          {
            entity: { id: "entity-acme", type: "company", name: "Acme", aliases: [], vault_path: "companies/acme.md" },
            co_occurrence_count: 10,
            decayed_weight: 0.88,
          },
        ]
      },
    },
  }
}

describe("assembleEvidencePack", () => {
  it("works with minimal deps and null stores", async () => {
    const deps = createMockDeps()
    deps.decisionStore = null
    deps.commitmentStore = null
    deps.personStore = null
    deps.hybridSearcher = null
    deps.entityIndex = null

    const evidence = await assembleEvidencePack("launch plan", "ctx", deps)

    expect(evidence.related_decisions).toHaveLength(0)
    expect(evidence.related_commitments).toHaveLength(0)
    expect(evidence.involved_people).toHaveLength(0)
    expect(evidence.vault_content).toHaveLength(1)
  })

  it("gathers decisions from search", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps())
    expect(evidence.related_decisions.length).toBeGreaterThan(0)
    expect(evidence.related_decisions[0].id).toBe("decision-1")
  })

  it("gathers commitments and merges overdue with dedupe", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps())
    const ids = new Set(evidence.related_commitments.map((item) => item.id))
    expect(ids.has("commitment-1")).toBe(true)
    expect(ids.has("commitment-2")).toBe(true)
    expect(ids.has("commitment-3")).toBe(true)
    expect(evidence.related_commitments.filter((item) => item.id === "commitment-2")).toHaveLength(1)
  })

  it("gathers people from participants", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps(), { participants: ["Alice"] })
    expect(evidence.involved_people).toHaveLength(1)
    expect(evidence.involved_people[0].name).toBe("Alice")
  })

  it("gathers events in date range with filtering", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps())
    expect(evidence.recent_events.map((item) => item.id)).toEqual(["event-priority", "event-ceo"])
  })

  it("gathers vault content from cited hybrid search first", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps())
    expect(evidence.vault_content[0].path).toBe("vault/strategy.md")
    expect(evidence.vault_content[0].source_date).toBe("2026-01-20")
  })

  it("falls back to hybrid search without citations", async () => {
    const deps = createMockDeps()
    if (deps.hybridSearcher) {
      deps.hybridSearcher.searchWithCitations = undefined
    }

    const evidence = await assembleEvidencePack("launch plan", "ctx", deps)
    expect(evidence.vault_content[0].path).toBe("vault/fallback.md")
    expect(evidence.vault_content[0].source_date).toBe("")
  })

  it("falls back to fts when hybrid searcher is null", async () => {
    const deps = createMockDeps()
    deps.hybridSearcher = null

    const evidence = await assembleEvidencePack("launch plan", "ctx", deps)
    expect(evidence.vault_content[0].path).toBe("vault/notes.md")
    expect(evidence.vault_content[0].original_quote).toContain("fts snippet")
  })

  it("gathers entity connections", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps(), { participants: ["Alice"] })
    expect(evidence.entity_connections).toHaveLength(1)
    expect(evidence.entity_connections[0].entity_name).toBe("Alice")
    expect(evidence.entity_connections[0].related_entities[0].name).toBe("Acme")
  })

  it("continues when one store throws", async () => {
    const deps = createMockDeps()
    if (deps.decisionStore) {
      deps.decisionStore.search = async () => {
        throw new Error("search failed")
      }
    }

    const evidence = await assembleEvidencePack("launch plan", "ctx", deps, { participants: ["Alice"] })
    expect(evidence.related_decisions).toHaveLength(0)
    expect(evidence.related_commitments.length).toBeGreaterThan(0)
    expect(evidence.involved_people.length).toBeGreaterThan(0)
  })

  it("respects max_evidence_items", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps(), {
      participants: ["Alice", "Unknown"],
      max_evidence_items: 1,
    })

    expect(evidence.related_decisions).toHaveLength(1)
    expect(evidence.related_commitments).toHaveLength(1)
    expect(evidence.recent_events).toHaveLength(1)
    expect(evidence.vault_content).toHaveLength(1)
    expect(evidence.involved_people).toHaveLength(1)
    expect(evidence.entity_connections).toHaveLength(1)
  })

  it("metadata has correct total_items and timing", async () => {
    const evidence = await assembleEvidencePack("launch plan", "ctx", createMockDeps(), { participants: ["Alice"] })
    const summed =
      evidence.related_decisions.length +
      evidence.related_commitments.length +
      evidence.involved_people.length +
      evidence.recent_events.length +
      evidence.vault_content.length +
      evidence.entity_connections.length

    expect(evidence.metadata.total_items).toBe(summed)
    expect(evidence.metadata.gathering_duration_ms).toBeGreaterThanOrEqual(0)
    expect(evidence.metadata.search_queries).toEqual(["launch plan"])
  })
})

describe("buildDebatePrompt", () => {
  function createEvidence(): EvidencePack {
    return {
      question: "Should we launch next month?",
      context: "Product is in beta",
      gathered_at: "2026-02-07T00:00:00.000Z",
      related_decisions: [],
      related_commitments: [],
      involved_people: [],
      recent_events: [],
      vault_content: [],
      entity_connections: [],
      metadata: {
        total_items: 0,
        search_queries: ["Should we launch next month?"],
        time_range: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
        gathering_duration_ms: 1,
      },
    }
  }

  it("contains all role labels", () => {
    const prompt = buildDebatePrompt(createEvidence())
    expect(prompt).toContain("### [Researcher]")
    expect(prompt).toContain("### [Advocate]")
    expect(prompt).toContain("### [Critic]")
    expect(prompt).toContain("### [Synthesizer]")
    expect(prompt).toContain("### [Devil's Advocate]")
  })

  it("contains anti-sycophancy protocol", () => {
    const prompt = buildDebatePrompt(createEvidence())
    expect(prompt).toContain("Anti-Sycophancy Protocol")
    expect(prompt).toContain("Do NOT agree with other roles")
  })

  it("contains cross-examination phase", () => {
    const prompt = buildDebatePrompt(createEvidence())
    expect(prompt).toContain("## Phase 2: 교차 검증 (1라운드)")
    expect(prompt).toContain("Researcher: Advocate와 Critic의 사실 오류 지적")
  })

  it("contains action memo template", () => {
    const prompt = buildDebatePrompt(createEvidence())
    expect(prompt).toContain("## Phase 5: 액션 메모")
    expect(prompt).toContain("\"recommendation\": \"\"")
    expect(prompt).toContain("\"vault_base_path\": \"\"")
  })

  it("returns non-empty output", () => {
    const prompt = buildDebatePrompt(createEvidence())
    expect(prompt.length).toBeGreaterThan(0)
  })
})
