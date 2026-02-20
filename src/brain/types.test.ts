import { describe, expect, test } from "bun:test"
import type {
  AkashicEvent,
  AkashicEventType,
  AkashicSource,
  CeoEventType,
  Commitment,
  DailyMemory,
  DecisionRecord,
  EntityRef,
  PersonRecord,
  Provenance,
  WorkingMemory,
} from "./types"

describe("brain/types", () => {
  test("CeoEventType accepts all 10 CEO event types", () => {
    // #given
    const ceoTypes = [
      "conversation.logged",
      "meeting.recorded",
      "decision.made",
      "commitment.created",
      "commitment.completed",
      "commitment.missed",
      "person.mentioned",
      "topic.discussed",
      "insight.generated",
      "followup.needed",
    ] as const satisfies readonly CeoEventType[]

    // #when
    const total = ceoTypes.length

    // #then
    expect(total).toBe(10)
    expect(ceoTypes[0]).toBe("conversation.logged")
    expect(ceoTypes[9]).toBe("followup.needed")
  })

  test("AkashicEventType accepts both existing and CEO event types", () => {
    // #given
    const types = ["file.created", "decision.made"] as const satisfies readonly AkashicEventType[]

    // #when
    const [legacyType, ceoType] = types

    // #then
    expect(legacyType).toBe("file.created")
    expect(ceoType).toBe("decision.made")
  })

  test("AkashicSource includes ceo", () => {
    // #given
    const source = "ceo" as const satisfies AkashicSource

    // #when
    const value = source

    // #then
    expect(value).toBe("ceo")
  })

  test("Provenance interface has required fields", () => {
    // #given
    const provenance = {
      source_type: "meeting",
      source_id: "mtg-123",
      confidence: 0.92,
      created_by: "ai",
      citation: "meeting-notes.md#L12",
    } satisfies Provenance

    // #when
    const summary = `${provenance.source_type}:${provenance.source_id}`

    // #then
    expect(summary).toBe("meeting:mtg-123")
    expect(provenance.confidence).toBe(0.92)
  })

  test("EntityRef interface has required fields", () => {
    // #given
    const entity = {
      type: "person",
      name: "Alex Founder",
      vault_path: "people/alex-founder.md",
    } satisfies EntityRef

    // #when
    const ref = `${entity.type}:${entity.name}`

    // #then
    expect(ref).toBe("person:Alex Founder")
    expect(entity.vault_path).toBe("people/alex-founder.md")
  })

  test("AkashicEvent backward compat - old-style events still valid", () => {
    // #given
    const event = {
      id: "01ABC",
      timestamp: new Date().toISOString(),
      type: "file.created" as const,
      source: "thalamus" as const,
      priority: 50,
      data: { path: "/test.md", diff_summary: "created" },
    } satisfies AkashicEvent

    // #when
    const path = event.data.path

    // #then
    expect(event.type).toBe("file.created")
    expect(path).toBe("/test.md")
  })

  test("AkashicEvent CEO extension - meeting event supports participants title and vault_path", () => {
    // #given
    const event = {
      id: "01MEETING",
      timestamp: new Date().toISOString(),
      type: "meeting.recorded" as const,
      source: "ceo" as const,
      priority: 80,
      data: {
        title: "Q1 Board Sync",
        participants: ["Alex", "Dana"],
        vault_path: "meetings/2026-02-20-q1-board-sync.md",
      },
    } satisfies AkashicEvent

    // #when
    const participantCount = event.data.participants?.length

    // #then
    expect(event.type).toBe("meeting.recorded")
    expect(participantCount).toBe(2)
    expect(event.data.vault_path).toContain("meetings/")
  })

  test("AkashicEvent CEO extension - decision event supports decision reasoning confidence", () => {
    // #given
    const event = {
      id: "01DECISION",
      timestamp: new Date().toISOString(),
      type: "decision.made" as const,
      source: "ceo" as const,
      priority: 90,
      data: {
        decision: "Prioritize enterprise onboarding",
        reasoning: "Highest ARR expansion potential this quarter",
        confidence: "high" as const,
      },
    } satisfies AkashicEvent

    // #when
    const confidence = event.data.confidence

    // #then
    expect(event.data.decision).toContain("enterprise")
    expect(event.data.reasoning).toContain("ARR")
    expect(confidence).toBe("high")
  })

  test("WorkingMemory backward compat - without CEO fields", () => {
    // #given
    const memory = {
      session_id: "session-1",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      context_summary: "Implementing types",
      active_files: ["src/brain/types.ts"],
      decisions: [
        {
          timestamp: new Date().toISOString(),
          decision: "Use optional CEO fields",
          reasoning: "Backwards compatible",
          confidence: "high" as const,
        },
      ],
      scratch: "notes",
      retrieval_log: [{ query: "akashic", results_count: 2, timestamp: new Date().toISOString() }],
    } satisfies WorkingMemory

    // #when
    const files = memory.active_files.length

    // #then
    expect(files).toBe(1)
    expect(memory.decisions[0]?.confidence).toBe("high")
  })

  test("WorkingMemory CEO extension - with active_topics people_involved open_commitments", () => {
    // #given
    const memory = {
      session_id: "session-2",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      context_summary: "CEO planning context",
      active_files: ["src/brain/types.ts"],
      decisions: [],
      scratch: "",
      retrieval_log: [],
      active_topics: ["fundraising", "hiring"],
      people_involved: ["Alex", "Dana"],
      open_commitments: [
        {
          commitment: "Ship investor update",
          due_date: "2026-02-25",
          assigned_to: "Alex",
          status: "in_progress" as const,
        },
      ],
      conversation_type: "planning" as const,
    } satisfies WorkingMemory

    // #when
    const status = memory.open_commitments?.[0]?.status

    // #then
    expect(memory.active_topics?.includes("hiring")).toBe(true)
    expect(memory.people_involved?.length).toBe(2)
    expect(status).toBe("in_progress")
  })

  test("DailyMemory backward compat - without CEO fields", () => {
    // #given
    const daily = {
      date: "2026-02-20",
      summary: "Shipped updates",
      key_decisions: [{ decision: "Delay launch", context: "Need QA" }],
      files_changed: [{ path: "src/brain/types.ts", summary: "extended types" }],
      topics: ["types"],
      open_questions: ["Any regressions?"],
      continuation_notes: "Run tests tomorrow",
    } satisfies DailyMemory

    // #when
    const topic = daily.topics[0]

    // #then
    expect(topic).toBe("types")
    expect(daily.files_changed[0]?.path).toBe("src/brain/types.ts")
  })

  test("DailyMemory CEO extension - with meetings interactions commitments_status", () => {
    // #given
    const daily = {
      date: "2026-02-20",
      summary: "CEO sync complete",
      key_decisions: [],
      files_changed: [],
      topics: ["planning"],
      open_questions: [],
      continuation_notes: "Track commitments",
      meetings: [
        {
          title: "Founder Weekly",
          participants: ["Alex", "Dana"],
          summary: "Reviewed roadmap",
          decisions: ["Focus on onboarding"],
          action_items: ["Draft rollout plan"],
          vault_path: "meetings/founder-weekly.md",
        },
      ],
      interactions: [
        {
          type: "conversation" as const,
          participants: ["Alex", "PM"],
          topic: "Roadmap",
          summary: "Aligned priorities",
        },
      ],
      commitments_status: {
        created: 3,
        completed: 1,
        overdue: 0,
        carried_over: ["Prepare launch checklist"],
      },
      mood_signal: "productive" as const,
    } satisfies DailyMemory

    // #when
    const created = daily.commitments_status?.created

    // #then
    expect(daily.meetings?.[0]?.title).toBe("Founder Weekly")
    expect(daily.interactions?.[0]?.type).toBe("conversation")
    expect(created).toBe(3)
  })

  test("PersonRecord has all required fields with correct types", () => {
    // #given
    const person = {
      id: "person-1",
      name: "Dana Investor",
      aliases: ["Dana", "D"],
      role: "Investor",
      company: "North Star Capital",
      relationship: "investor" as const,
      first_seen: "2026-01-10T08:00:00.000Z",
      last_seen: "2026-02-20T08:00:00.000Z",
      interaction_count: 8,
      key_topics: ["fundraising", "growth"],
      notes: "Helpful with GTM intros",
      vault_path: "people/dana-investor.md",
      schema_version: 1,
    } satisfies PersonRecord

    // #when
    const interactions = person.interaction_count

    // #then
    expect(person.relationship).toBe("investor")
    expect(interactions).toBe(8)
    expect(person.key_topics[0]).toBe("fundraising")
  })

  test("DecisionRecord has all required fields", () => {
    // #given
    const record = {
      id: "decision-1",
      timestamp: "2026-02-20T09:00:00.000Z",
      title: "Pricing model update",
      context: "Need better enterprise expansion",
      decision: "Adopt tiered enterprise pricing",
      reasoning: "Aligns pricing with usage and value",
      alternatives_considered: ["flat pricing", "seat-based"],
      participants: ["Alex", "Dana"],
      confidence: "medium" as const,
      status: "decided" as const,
      outcomes: [
        {
          date: "2026-03-01",
          description: "Pipeline quality improved",
          assessment: "positive" as const,
        },
      ],
      provenance: {
        source_type: "meeting" as const,
        source_id: "meeting-42",
        confidence: 0.87,
        created_by: "system" as const,
      },
      vault_path: "decisions/2026-02-20-pricing.md",
      schema_version: 1,
    } satisfies DecisionRecord

    // #when
    const outcomeAssessment = record.outcomes?.[0]?.assessment

    // #then
    expect(record.status).toBe("decided")
    expect(record.provenance.source_type).toBe("meeting")
    expect(outcomeAssessment).toBe("positive")
  })

  test("Commitment has all required fields", () => {
    // #given
    const commitment = {
      id: "commitment-1",
      created_at: "2026-02-20T10:00:00.000Z",
      description: "Send weekly investor update",
      assigned_to: "Alex",
      due_date: "2026-02-23",
      source_event_id: "01MEETING",
      status: "pending" as const,
      vault_path: "commitments/investor-update.md",
      schema_version: 1,
    } satisfies Commitment

    // #when
    const dueDate = commitment.due_date

    // #then
    expect(commitment.status).toBe("pending")
    expect(commitment.source_event_id).toBe("01MEETING")
    expect(dueDate).toBe("2026-02-23")
  })
})
