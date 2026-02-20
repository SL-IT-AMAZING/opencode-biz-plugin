import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { createDecisionTools } from "./decision-tools"
import { createBrainPaths } from "../brain/vault/paths"
import { createDecisionStore } from "../brain/stores/decision-store"
import { createProvenance } from "../shared/provenance"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { BrainToolDeps } from "./types"
import type { BrainDatabase, FtsSearcher, MarkdownIndexer } from "../brain/search/types"
import type { AkashicEvent, DecisionRecord } from "../brain/types"
import type { AkashicReader, AkashicLogger } from "../brain/akashic/types"

interface LoggerHarness {
  logger: AkashicLogger
  events: Array<Omit<AkashicEvent, "id" | "timestamp">>
}

function createMockLogger(): LoggerHarness {
  const events: Array<Omit<AkashicEvent, "id" | "timestamp">> = []
  let index = 0
  return {
    events,
    logger: {
      async log(event) {
        events.push(event)
        index += 1
        return {
          ...event,
          id: `evt-${index}`,
          timestamp: new Date().toISOString(),
        }
      },
      async flush() {
        return
      },
      getLogPath() {
        return ""
      },
      async close() {
        return
      },
    },
  }
}

function createMockDb(): BrainDatabase {
  const sqlite = new Database(":memory:")
  return {
    raw: sqlite,
    close() {
      sqlite.close()
    },
    getChunks() {
      return []
    },
    upsertChunks() {
      return
    },
    setEmbedding() {
      return
    },
    getEmbedding() {
      return undefined
    },
    getAllEmbeddingsForSearch() {
      return []
    },
    getChunksNeedingEmbedding() {
      return []
    },
    clearEmbeddings() {
      return
    },
    removeFile() {
      return
    },
    getFileState() {
      return undefined
    },
    setFileState() {
      return
    },
    getAllFileStates() {
      return {}
    },
    getStats() {
      return {
        totalChunks: 0,
        totalFiles: 0,
        dbSizeBytes: 0,
      }
    },
    optimize() {
      return
    },
  }
}

function createMockDeps(params: { tmpDir: string; logger: AkashicLogger | null; decisionStore: BrainToolDeps["decisionStore"] }): BrainToolDeps {
  const paths = createBrainPaths(params.tmpDir)

  const fts: FtsSearcher = {
    search() {
      return []
    },
    searchByPath() {
      return []
    },
    highlight() {
      return []
    },
  }

  const indexer: MarkdownIndexer = {
    async indexFile(absolutePath) {
      return { path: absolutePath, chunks: 0, skipped: true }
    },
    removeFile() {
      return
    },
    async fullScan() {
      return { indexed: 0, skipped: 0, removed: 0, errors: [] }
    },
    getState() {
      return {
        files: {},
        last_full_scan: "",
        schema_version: 1,
      }
    },
  }

  const akashicReader: AkashicReader = {
    async readDate() {
      return []
    },
    async readRange() {
      return []
    },
    async queryByType() {
      return []
    },
    async queryByPath() {
      return []
    },
    async count() {
      return 0
    },
  }

  return {
    paths,
    db: createMockDb(),
    fts,
    indexer,
    akashicReader,
    hybridSearcher: null,
    microConsolidator: null,
    sleepConsolidator: null,
    personStore: null,
    decisionStore: params.decisionStore,
    commitmentStore: null,
    akashicLogger: params.logger,
  }
}

function buildDecisionRecord(partial: {
  id: string
  title: string
  decision: string
  reasoning: string
  timestamp: string
  participants?: string[]
}): DecisionRecord {
  return {
    id: partial.id,
    timestamp: partial.timestamp,
    title: partial.title,
    context: "",
    decision: partial.decision,
    reasoning: partial.reasoning,
    alternatives_considered: [],
    participants: partial.participants ?? [],
    confidence: "medium",
    status: "decided",
    provenance: createProvenance({
      source_type: "manual",
      source_id: partial.id,
      created_by: "user",
    }),
    vault_path: "_brain/ceo/decisions/example.md",
    schema_version: 1,
  }
}

const toolContext: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata() {
    return
  },
  async ask() {
    return
  },
}

describe("tools/decision-tools", () => {
  let tmpDir: string
  let deps: BrainToolDeps
  let loggerHarness: LoggerHarness

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "decision-tools-test-"))
    loggerHarness = createMockLogger()
    const paths = createBrainPaths(tmpDir)
    deps = createMockDeps({
      tmpDir,
      logger: loggerHarness.logger,
      decisionStore: createDecisionStore(paths.decisionsStore),
    })
  })

  afterEach(() => {
    deps.db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("brain_log_decision logs decision and returns success with decision_id", async () => {
    const tools = createDecisionTools(deps)

    const result = await tools.brain_log_decision.execute({
      title: "Choose analytics vendor",
      decision: "Proceed with Vendor A",
      reasoning: "Lower integration complexity",
    }, toolContext)
    const parsed = JSON.parse(result) as { success: boolean; decision_id: string }

    expect(parsed.success).toBe(true)
    expect(parsed.decision_id.length).toBeGreaterThan(0)
  })

  test("brain_log_decision creates markdown file in decisions directory", async () => {
    const tools = createDecisionTools(deps)

    const result = await tools.brain_log_decision.execute({
      title: "Adopt quarterly planning",
      decision: "Run planning every quarter",
      reasoning: "Improves predictability",
    }, toolContext)
    const parsed = JSON.parse(result) as { vault_path: string }

    const file = Bun.file(join(deps.paths.vault, parsed.vault_path))
    expect(await file.exists()).toBe(true)
    const content = await file.text()
    expect(content).toContain("# Adopt quarterly planning")
  })

  test("brain_log_decision stores decision in decisionStore", async () => {
    const tools = createDecisionTools(deps)

    const result = await tools.brain_log_decision.execute({
      title: "Hire first sales rep",
      decision: "Open role next month",
      reasoning: "Pipeline justifies headcount",
      participants: ["CEO", "COO"],
    }, toolContext)
    const parsed = JSON.parse(result) as { decision_id: string }

    const records = await deps.decisionStore?.list()
    expect(records?.length).toBe(1)
    expect(records?.[0].id).toBe(parsed.decision_id)
    expect(records?.[0].participants).toEqual(["CEO", "COO"])
  })

  test("brain_log_decision logs akashic event when logger available", async () => {
    const tools = createDecisionTools(deps)

    const result = await tools.brain_log_decision.execute({
      title: "Switch CRM",
      decision: "Migrate to CRM-X",
      reasoning: "Better reporting",
    }, toolContext)
    const parsed = JSON.parse(result) as { event_id: string }

    expect(loggerHarness.events.length).toBe(1)
    expect(loggerHarness.events[0].type).toBe("decision.made")
    expect(loggerHarness.events[0].source).toBe("ceo")
    expect(parsed.event_id).toBe("evt-1")
  })

  test("brain_log_decision works without optional deps", async () => {
    const noOptionalDeps = createMockDeps({
      tmpDir,
      logger: null,
      decisionStore: null,
    })
    const tools = createDecisionTools(noOptionalDeps)

    const result = await tools.brain_log_decision.execute({
      title: "No optional deps",
      decision: "Still works",
      reasoning: "Vault write is sufficient",
    }, toolContext)
    const parsed = JSON.parse(result) as { success: boolean; decision_id: string }

    expect(parsed.success).toBe(true)
    expect(parsed.decision_id.length).toBeGreaterThan(0)
    noOptionalDeps.db.close()
  })

  test("brain_log_decision uses default confidence medium when not specified", async () => {
    const tools = createDecisionTools(deps)

    await tools.brain_log_decision.execute({
      title: "Default confidence",
      decision: "Keep defaults",
      reasoning: "No explicit confidence set",
    }, toolContext)

    const records = await deps.decisionStore?.list()
    expect(records?.[0].confidence).toBe("medium")
  })

  test("brain_decision_history returns empty results when no decisions exist", async () => {
    const emptyDeps = createMockDeps({
      tmpDir,
      logger: loggerHarness.logger,
      decisionStore: createDecisionStore(join(tmpDir, "empty", "decisions")),
    })
    const tools = createDecisionTools(emptyDeps)

    const result = await tools.brain_decision_history.execute({}, toolContext)
    const parsed = JSON.parse(result) as { results: unknown[]; total: number }

    expect(parsed.results).toEqual([])
    expect(parsed.total).toBe(0)
    emptyDeps.db.close()
  })

  test("brain_decision_history finds decisions by query text", async () => {
    const tools = createDecisionTools(deps)
    await tools.brain_log_decision.execute({
      title: "Roadmap review",
      decision: "Prioritize onboarding",
      reasoning: "Largest churn reduction",
    }, toolContext)
    await tools.brain_log_decision.execute({
      title: "Pricing update",
      decision: "Launch annual plan",
      reasoning: "Improves retention",
    }, toolContext)

    const result = await tools.brain_decision_history.execute({ query: "pricing" }, toolContext)
    const parsed = JSON.parse(result) as { results: Array<{ title: string }>; total: number }

    expect(parsed.total).toBe(1)
    expect(parsed.results[0].title).toBe("Pricing update")
  })

  test("brain_decision_history filters by participant person name", async () => {
    const tools = createDecisionTools(deps)
    await tools.brain_log_decision.execute({
      title: "Engineering hiring",
      decision: "Hire one backend engineer",
      reasoning: "Reduce bottleneck",
      participants: ["Alice Johnson"],
    }, toolContext)
    await tools.brain_log_decision.execute({
      title: "Marketing budget",
      decision: "Increase paid ads budget",
      reasoning: "Need top-of-funnel growth",
      participants: ["Bob Smith"],
    }, toolContext)

    const result = await tools.brain_decision_history.execute({ person: "alice" }, toolContext)
    const parsed = JSON.parse(result) as { results: Array<{ title: string }>; total: number }

    expect(parsed.total).toBe(1)
    expect(parsed.results[0].title).toBe("Engineering hiring")
  })

  test("brain_decision_history respects limit parameter", async () => {
    const tools = createDecisionTools(deps)
    await tools.brain_log_decision.execute({
      title: "Decision 1",
      decision: "A",
      reasoning: "Reason A",
    }, toolContext)
    await tools.brain_log_decision.execute({
      title: "Decision 2",
      decision: "B",
      reasoning: "Reason B",
    }, toolContext)
    await tools.brain_log_decision.execute({
      title: "Decision 3",
      decision: "C",
      reasoning: "Reason C",
    }, toolContext)

    const result = await tools.brain_decision_history.execute({ limit: 2 }, toolContext)
    const parsed = JSON.parse(result) as { results: unknown[]; total: number }

    expect(parsed.total).toBe(3)
    expect(parsed.results.length).toBe(2)
  })

  test("brain_decision_history returns decisions sorted by timestamp", async () => {
    await deps.decisionStore?.add(buildDecisionRecord({
      id: "old",
      title: "Old",
      decision: "Old decision",
      reasoning: "Old reasoning",
      timestamp: "2025-01-01T10:00:00.000Z",
    }))
    await deps.decisionStore?.add(buildDecisionRecord({
      id: "new",
      title: "New",
      decision: "New decision",
      reasoning: "New reasoning",
      timestamp: "2025-01-03T10:00:00.000Z",
    }))
    await deps.decisionStore?.add(buildDecisionRecord({
      id: "mid",
      title: "Mid",
      decision: "Mid decision",
      reasoning: "Mid reasoning",
      timestamp: "2025-01-02T10:00:00.000Z",
    }))
    const tools = createDecisionTools(deps)

    const result = await tools.brain_decision_history.execute({}, toolContext)
    const parsed = JSON.parse(result) as { results: Array<{ decision_id: string }> }

    expect(parsed.results.map(r => r.decision_id)).toEqual(["new", "mid", "old"])
  })

  test("brain_decision_history returns store unavailable message when decisionStore is null", async () => {
    const noStoreDeps = createMockDeps({
      tmpDir,
      logger: loggerHarness.logger,
      decisionStore: null,
    })
    const tools = createDecisionTools(noStoreDeps)

    const result = await tools.brain_decision_history.execute({}, toolContext)
    const parsed = JSON.parse(result) as { results: unknown[]; total: number; message: string }

    expect(parsed.results).toEqual([])
    expect(parsed.total).toBe(0)
    expect(parsed.message).toBe("Decision store not available")
    noStoreDeps.db.close()
  })
})
