import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Commitment } from "../brain/types"
import { createCommitmentStore } from "../brain/stores/commitment-store"
import { createBrainPaths } from "../brain/vault/paths"
import type { BrainToolDeps } from "./types"
import { createCommitmentTools } from "./commitment-tools"

interface TrackCommitmentResult {
  success: boolean
  commitment_id?: string
  status?: string
  error?: string
  code?: string
}

interface CheckCommitmentsResult {
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

describe("tools/commitment-tools", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `commitment-tools-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  function parseJson<T>(value: string): T {
    return JSON.parse(value) as T
  }

  function buildContext(): ToolContext {
    return {
      sessionID: "session-test",
      messageID: "message-test",
      agent: "tester",
      directory: testDir,
      worktree: testDir,
      abort: new AbortController().signal,
      metadata: () => {},
      ask: async () => {},
    }
  }

  function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
    return {
      id: crypto.randomUUID(),
      created_at: "2026-01-15T10:00:00.000Z",
      description: "Default commitment",
      assigned_to: "Alex",
      due_date: "2999-01-01T00:00:00.000Z",
      source_event_id: "",
      status: "pending",
      schema_version: 1,
      ...overrides,
    }
  }

  function makeDeps(overrides: Partial<BrainToolDeps> = {}): BrainToolDeps {
    return {
      paths: createBrainPaths(testDir),
      db: {} as BrainToolDeps["db"],
      fts: {} as BrainToolDeps["fts"],
      indexer: {} as BrainToolDeps["indexer"],
      akashicReader: {} as BrainToolDeps["akashicReader"],
      hybridSearcher: null,
      microConsolidator: null,
      sleepConsolidator: null,
      personStore: null,
      decisionStore: null,
      commitmentStore: createCommitmentStore(join(testDir, "commitments")),
      akashicLogger: null,
      entityIndex: null,
      proactiveEngine: null,
      morningBriefGenerator: null,
      ...overrides,
    }
  }

  test("brain_track_commitment creates commitment and returns success", async () => {
    const deps = makeDeps()
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_track_commitment.execute(
      {
        description: "Send follow-up email",
        assigned_to: "Priya",
      },
      buildContext(),
    )

    const result = parseJson<TrackCommitmentResult>(output)
    expect(result.success).toBe(true)
    expect(result.status).toBe("pending")
    expect(result.commitment_id).toBeString()
  })

  test("brain_track_commitment stores commitment in store", async () => {
    const deps = makeDeps()
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_track_commitment.execute(
      {
        description: "Prepare board update",
        assigned_to: "Morgan",
        due_date: "2026-03-01",
        source_event_id: "meeting-123",
      },
      buildContext(),
    )

    const result = parseJson<TrackCommitmentResult>(output)
    const saved = result.commitment_id ? await deps.commitmentStore?.get(result.commitment_id) : undefined

    expect(saved?.description).toBe("Prepare board update")
    expect(saved?.assigned_to).toBe("Morgan")
    expect(saved?.due_date).toBe("2026-03-01")
    expect(saved?.source_event_id).toBe("meeting-123")
    expect(saved?.status).toBe("pending")
  })

  test("brain_track_commitment logs akashic event when logger available", async () => {
    const logged: Array<{
      type: string
      source: string
      priority: number
      data: { description?: string; assigned_to?: string; due_date?: string }
    }> = []

    const logger: NonNullable<BrainToolDeps["akashicLogger"]> = {
      log: async (event) => {
        logged.push({
          type: event.type,
          source: event.source,
          priority: event.priority,
          data: {
            description: event.data.description,
            assigned_to: event.data.assigned_to,
            due_date: event.data.due_date,
          },
        })
        return {
          id: "evt-1",
          timestamp: new Date().toISOString(),
          ...event,
        }
      },
      flush: async () => {},
      getLogPath: () => join(testDir, "akashic.log"),
      close: async () => {},
    }

    const deps = makeDeps({ akashicLogger: logger })
    const tools = createCommitmentTools(deps)

    await tools.brain_track_commitment.execute(
      {
        description: "Draft launch memo",
        assigned_to: "Nadia",
        due_date: "2026-04-10",
      },
      buildContext(),
    )

    expect(logged).toHaveLength(1)
    expect(logged[0]).toEqual({
      type: "commitment.created",
      source: "ceo",
      priority: 50,
      data: {
        description: "Draft launch memo",
        assigned_to: "Nadia",
        due_date: "2026-04-10",
      },
    })
  })

  test("brain_track_commitment returns error when commitmentStore is null", async () => {
    const deps = makeDeps({ commitmentStore: null })
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_track_commitment.execute(
      {
        description: "Should fail",
        assigned_to: "Jordan",
      },
      buildContext(),
    )

    const result = parseJson<TrackCommitmentResult>(output)
    expect(result.success).toBe(false)
    expect(result.error).toBe("Commitment store not available")
    expect(result.code).toBe("INDEX_UNAVAILABLE")
  })

  test("brain_check_commitments returns empty when no commitments exist", async () => {
    const deps = makeDeps()
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({}, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toEqual([])
    expect(result.summary).toEqual({ pending: 0, overdue: 0, done: 0 })
  })

  test("brain_check_commitments returns all commitments", async () => {
    const deps = makeDeps()
    await deps.commitmentStore?.add(makeCommitment({ id: "com-1", description: "First" }))
    await deps.commitmentStore?.add(makeCommitment({ id: "com-2", description: "Second", status: "done" }))
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({}, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toHaveLength(2)
    expect(result.results.map(r => r.id)).toEqual(["com-1", "com-2"])
  })

  test("brain_check_commitments filters by status", async () => {
    const deps = makeDeps()
    await deps.commitmentStore?.add(makeCommitment({ id: "com-1", status: "pending" }))
    await deps.commitmentStore?.add(makeCommitment({ id: "com-2", status: "in_progress" }))
    await deps.commitmentStore?.add(makeCommitment({ id: "com-3", status: "done" }))
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({ status: "done" }, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.id).toBe("com-3")
  })

  test("brain_check_commitments filters by person name", async () => {
    const deps = makeDeps()
    await deps.commitmentStore?.add(makeCommitment({ id: "com-1", assigned_to: "Alice Cooper" }))
    await deps.commitmentStore?.add(makeCommitment({ id: "com-2", assigned_to: "Bob Stone" }))
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({ person: "alice" }, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.assigned_to).toBe("Alice Cooper")
  })

  test("brain_check_commitments returns overdue-only when requested", async () => {
    const deps = makeDeps()
    await deps.commitmentStore?.add(
      makeCommitment({ id: "com-1", due_date: "2020-01-01T00:00:00.000Z", status: "pending" }),
    )
    await deps.commitmentStore?.add(
      makeCommitment({ id: "com-2", due_date: "2999-01-01T00:00:00.000Z", status: "pending" }),
    )
    await deps.commitmentStore?.add(
      makeCommitment({ id: "com-3", due_date: "2020-01-01T00:00:00.000Z", status: "done" }),
    )
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({ overdue_only: true }, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.id).toBe("com-1")
  })

  test("brain_check_commitments summary counts are correct", async () => {
    const deps = makeDeps()
    await deps.commitmentStore?.add(
      makeCommitment({ id: "com-1", due_date: "2020-01-01T00:00:00.000Z", status: "pending" }),
    )
    await deps.commitmentStore?.add(makeCommitment({ id: "com-2", status: "pending" }))
    await deps.commitmentStore?.add(makeCommitment({ id: "com-3", status: "done" }))
    await deps.commitmentStore?.add(
      makeCommitment({ id: "com-4", due_date: "2020-01-01T00:00:00.000Z", status: "in_progress" }),
    )
    const tools = createCommitmentTools(deps)

    const output = await tools.brain_check_commitments.execute({ status: "done" }, buildContext())
    const result = parseJson<CheckCommitmentsResult>(output)

    expect(result.results).toHaveLength(1)
    expect(result.summary).toEqual({
      pending: 2,
      overdue: 2,
      done: 1,
    })
  })
})
