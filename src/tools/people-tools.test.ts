import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AkashicReader } from "../brain/akashic/types"
import { createDecisionStore } from "../brain/stores/decision-store"
import { createPersonStore } from "../brain/stores/person-store"
import type { DecisionRecord, PersonRecord } from "../brain/types"
import { createBrainPaths } from "../brain/vault/paths"
import type { BrainDatabase, FtsSearcher, MarkdownIndexer } from "../brain/search/types"
import type { BrainToolDeps } from "./types"
import { createPeopleTools } from "./people-tools"

const TEST_TOOL_CONTEXT: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

function makePerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: "person-1",
    name: "Alice Founder",
    aliases: ["Alice"],
    role: "CEO",
    company: "Acme Labs",
    relationship: "team",
    first_seen: "2026-01-01T00:00:00.000Z",
    last_seen: "2026-02-10T00:00:00.000Z",
    interaction_count: 5,
    key_topics: ["strategy"],
    notes: "Founder",
    vault_path: "_brain/ceo/people/alice-founder.md",
    schema_version: 1,
    ...overrides,
  }
}

function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: "decision-1",
    timestamp: "2026-02-10T09:00:00.000Z",
    title: "Set GTM plan",
    context: "Need tighter market focus",
    decision: "Prioritize enterprise",
    reasoning: "Fastest path to ARR",
    alternatives_considered: ["SMB-first"],
    participants: ["Alice Founder", "Bob Advisor"],
    confidence: "high",
    status: "decided",
    provenance: {
      source_type: "meeting",
      source_id: "meeting-1",
      confidence: 0.9,
      created_by: "system",
    },
    vault_path: "_brain/ceo/decisions/gtm-plan.md",
    schema_version: 1,
    ...overrides,
  }
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function createStubDeps(root: string): BrainToolDeps {
  const paths = createBrainPaths(join(root, "vault"))
  const personStore = createPersonStore(paths.peopleStore)
  const decisionStore = createDecisionStore(paths.decisionsStore)
  const raw = new Database(":memory:")

  const db: BrainDatabase = {
    raw,
    close: () => raw.close(),
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
  }

  const fts: FtsSearcher = {
    search: () => [],
    searchByPath: () => [],
    highlight: () => [],
  }

  const indexer: MarkdownIndexer = {
    indexFile: async (absolutePath) => ({ path: absolutePath, chunks: 0, skipped: true }),
    removeFile: () => {},
    fullScan: async () => ({ indexed: 0, skipped: 0, removed: 0, errors: [] }),
    getState: () => ({ files: {}, last_full_scan: new Date(0).toISOString(), schema_version: 1 }),
  }

  const akashicReader: AkashicReader = {
    readDate: async () => [],
    readRange: async () => [],
    queryByType: async () => [],
    queryByPath: async () => [],
    count: async () => 0,
  }

  return {
    paths,
    db,
    fts,
    indexer,
    akashicReader,
    hybridSearcher: null,
    microConsolidator: null,
    sleepConsolidator: null,
    personStore,
    decisionStore,
    commitmentStore: null,
    akashicLogger: null,
  }
}

async function seedNetwork(deps: BrainToolDeps): Promise<void> {
  if (!deps.personStore || !deps.decisionStore) return

  await deps.personStore.add(
    makePerson({
      id: "person-1",
      name: "Alice Founder",
      aliases: ["Alice"],
      relationship: "team",
      role: "CEO",
      company: "Acme Labs",
      last_seen: "2026-02-10T00:00:00.000Z",
    }),
  )
  await deps.personStore.add(
    makePerson({
      id: "person-2",
      name: "Bob Advisor",
      aliases: ["Robert"],
      relationship: "advisor",
      role: "Advisor",
      company: "Acme Ventures",
      last_seen: "2026-02-12T00:00:00.000Z",
      interaction_count: 9,
      vault_path: "_brain/ceo/people/bob-advisor.md",
    }),
  )
  await deps.personStore.add(
    makePerson({
      id: "person-3",
      name: "Carol Investor",
      aliases: ["Carol"],
      relationship: "investor",
      role: "Partner",
      company: "North Capital",
      last_seen: "2026-02-11T00:00:00.000Z",
      interaction_count: 6,
      vault_path: "_brain/ceo/people/carol-investor.md",
    }),
  )
  await deps.personStore.add(
    makePerson({
      id: "person-4",
      name: "Dan Partner",
      aliases: ["Daniel"],
      relationship: "partner",
      role: "Head of Partnerships",
      company: "Orbit Partners",
      last_seen: "2026-02-09T00:00:00.000Z",
      interaction_count: 3,
      vault_path: "_brain/ceo/people/dan-partner.md",
    }),
  )

  await deps.decisionStore.add(
    makeDecision({
      id: "decision-1",
      participants: ["Alice Founder", "Bob Advisor", "Carol Investor"],
    }),
  )
  await deps.decisionStore.add(
    makeDecision({
      id: "decision-2",
      title: "Finalize pricing",
      participants: ["Alice Founder", "Bob Advisor"],
    }),
  )
  await deps.decisionStore.add(
    makeDecision({
      id: "decision-3",
      title: "Channel strategy",
      participants: ["Bob Advisor", "Dan Partner"],
    }),
  )
}

describe("tools/people-tools", () => {
  let testRoot = ""
  let deps: BrainToolDeps

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), "people-tools-"))
    deps = createStubDeps(testRoot)
  })

  afterEach(async () => {
    deps.db.close()
    await rm(testRoot, { recursive: true, force: true })
  })

  test("brain_people_lookup returns empty when no people exist", async () => {
    const tools = createPeopleTools(deps)
    const output = await tools.brain_people_lookup.execute({}, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: unknown[]; total: number }>(output)

    expect(parsed.results).toEqual([])
    expect(parsed.total).toBe(0)
  })

  test("brain_people_lookup finds person by name case-insensitively", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_people_lookup.execute({ name: "aLiCe" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: Array<{ name: string }>; total: number }>(output)

    expect(parsed.total).toBe(1)
    expect(parsed.results[0]?.name).toBe("Alice Founder")
  })

  test("brain_people_lookup filters by relationship type", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_people_lookup.execute({ relationship: "investor" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: Array<{ name: string; relationship: string }>; total: number }>(output)

    expect(parsed.total).toBe(1)
    expect(parsed.results[0]?.name).toBe("Carol Investor")
    expect(parsed.results[0]?.relationship).toBe("investor")
  })

  test("brain_people_lookup filters by company", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_people_lookup.execute({ company: "acme" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: Array<{ name: string }>; total: number }>(output)

    expect(parsed.total).toBe(2)
    expect(parsed.results.map(person => person.name)).toEqual(["Bob Advisor", "Alice Founder"])
  })

  test("brain_people_lookup respects limit parameter", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_people_lookup.execute({ limit: 2 }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: Array<{ name: string }>; total: number }>(output)

    expect(parsed.total).toBe(4)
    expect(parsed.results).toHaveLength(2)
    expect(parsed.results.map(person => person.name)).toEqual(["Bob Advisor", "Carol Investor"])
  })

  test("brain_people_lookup returns store unavailable message when personStore is null", async () => {
    const tools = createPeopleTools({ ...deps, personStore: null })

    const output = await tools.brain_people_lookup.execute({}, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ results: unknown[]; total: number; message: string }>(output)

    expect(parsed.results).toEqual([])
    expect(parsed.total).toBe(0)
    expect(parsed.message).toContain("People store not available")
  })

  test("brain_relationship_map returns map centered on known person", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_relationship_map.execute({ person_name: "Alice Founder" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{
      person: string
      nodes: Array<{ id: string; label: string }>
      edges: Array<{ source: string; target: string; weight: number }>
    }>(output)

    expect(parsed.person).toBe("Alice Founder")
    expect(parsed.nodes.map(node => node.label).sort()).toEqual(["Alice Founder", "Bob Advisor", "Carol Investor"])
    expect(parsed.edges.length).toBeGreaterThan(0)
  })

  test("brain_relationship_map returns PERSON_NOT_FOUND for unknown person", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_relationship_map.execute({ person_name: "Unknown Person" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ error: string; code: string }>(output)

    expect(parsed.error).toBe("Person not found")
    expect(parsed.code).toBe("PERSON_NOT_FOUND")
  })

  test("brain_relationship_map includes weighted edges from shared decisions", async () => {
    await seedNetwork(deps)
    const tools = createPeopleTools(deps)

    const output = await tools.brain_relationship_map.execute({ person_name: "Alice Founder" }, TEST_TOOL_CONTEXT)
    const parsed = parseJson<{ edges: Array<{ source: string; target: string; weight: number }> }>(output)
    const edge = parsed.edges.find(
      current =>
        (current.source === "person-1" && current.target === "person-2") ||
        (current.source === "person-2" && current.target === "person-1"),
    )

    expect(edge).toBeDefined()
    expect(edge?.weight).toBe(2)
  })
})
