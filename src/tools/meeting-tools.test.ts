import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { tool, type ToolContext } from "@opencode-ai/plugin/tool"
import { Database } from "bun:sqlite"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { AkashicEvent } from "../brain/types"
import { createCommitmentStore } from "../brain/stores/commitment-store"
import { createPersonStore } from "../brain/stores/person-store"
import { createBrainPaths } from "../brain/vault/paths"
import { createMeetingTools } from "./meeting-tools"
import type { BrainToolDeps } from "./types"

type MeetingToolResponse = {
  success: boolean
  vault_path?: string
  event_id?: string
  summary?: string
  error?: string
  code?: string
}

type AkashicLogInput = Omit<AkashicEvent, "id" | "timestamp">

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

function createMockDeps(tmpDir: string): BrainToolDeps {
  const paths = createBrainPaths(tmpDir)
  const personStore = createPersonStore(paths.peopleStore)
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
    decisionStore: null,
    commitmentStore,
    akashicLogger: {
      log: async (event) => {
        capturedAkashicEvents.push(event)
        return {
          ...event,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        }
      },
      flush: async () => {},
      getLogPath: () => join(paths.akashicDaily, "test.jsonl"),
      close: async () => {},
    },
    entityIndex: null,
  }
}

async function executeMeetingTool(
  deps: BrainToolDeps,
  args: {
    title: string
    participants: string[]
    notes: string
    decisions?: string[]
    action_items?: Array<{ task: string; assignee: string; due_date?: string }>
  },
): Promise<MeetingToolResponse> {
  const tools = createMeetingTools(deps)
  const raw = await tools.brain_log_meeting.execute(args, mockContext)
  return JSON.parse(raw) as MeetingToolResponse
}

describe("tools/meeting-tools", () => {
  let tmpDir = ""

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "meeting-tools-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    while (openedDatabases.length > 0) {
      const db = openedDatabases.pop()
      db?.close(false)
    }
  })

  test("logs meeting and returns success", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Weekly Sync",
      participants: ["Alice", "Bob"],
      notes: "Reviewed roadmap progress.",
    })

    expect(result.success).toBe(true)
    expect(typeof result.event_id).toBe("string")
  })

  test("creates markdown file at correct vault path", async () => {
    const deps = createMockDeps(tmpDir)
    const date = new Date().toISOString().split("T")[0]

    const result = await executeMeetingTool(deps, {
      title: "Board Review",
      participants: ["Kim"],
      notes: "Board updates shared.",
    })

    const expectedRelativePath = `_brain/ceo/meetings/${date}-board-review.md`
    const expectedAbsolutePath = join(tmpDir, expectedRelativePath)
    const fileExists = await Bun.file(expectedAbsolutePath).exists()

    expect(result.vault_path).toBe(expectedRelativePath)
    expect(fileExists).toBe(true)
  })

  test("includes notes in markdown content", async () => {
    const deps = createMockDeps(tmpDir)
    const notes = "Discussed launch blockers and mitigation options."

    const result = await executeMeetingTool(deps, {
      title: "Launch Risk Review",
      participants: ["Alex", "Sam"],
      notes,
    })

    const content = await Bun.file(join(tmpDir, result.vault_path!)).text()
    expect(content).toContain("## Notes")
    expect(content).toContain(notes)
  })

  test("uses fallback text for empty notes", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Quick Check-in",
      participants: ["Taylor"],
      notes: "",
    })

    const content = await Bun.file(join(tmpDir, result.vault_path!)).text()
    expect(content).toContain("(No notes provided)")
  })

  test("participants validation requires at least one participant", () => {
    const deps = createMockDeps(tmpDir)
    const argsSchema = tool.schema.object(createMeetingTools(deps).brain_log_meeting.args)

    const parsed = argsSchema.safeParse({
      title: "Invalid Meeting",
      participants: [],
      notes: "Should fail",
    })

    expect(parsed.success).toBe(false)
  })

  test("includes decisions in markdown when provided", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Strategy Session",
      participants: ["A", "B"],
      notes: "Reviewed options.",
      decisions: ["Prioritize enterprise segment", "Delay mobile release"],
    })

    const content = await Bun.file(join(tmpDir, result.vault_path!)).text()
    expect(content).toContain("- Prioritize enterprise segment")
    expect(content).toContain("- Delay mobile release")
  })

  test("creates action items as commitments when commitmentStore is available", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Execution Planning",
      participants: ["Dana"],
      notes: "Assigned follow-up tasks.",
      action_items: [
        { task: "Draft launch checklist", assignee: "Dana", due_date: "2026-03-01" },
        { task: "Validate pricing", assignee: "Robin" },
      ],
    })

    const commitments = await deps.commitmentStore!.list()
    expect(result.success).toBe(true)
    expect(commitments).toHaveLength(2)
    expect(commitments[0]?.description).toBe("Draft launch checklist")
    expect(commitments[0]?.assigned_to).toBe("Dana")
    expect(commitments[1]?.description).toBe("Validate pricing")
  })

  test("logs akashic event when akashicLogger is available", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Investor Update",
      participants: ["Founder", "Investor"],
      notes: "Shared KPI progress.",
      decisions: ["Send monthly report"],
    })

    expect(result.success).toBe(true)
    expect(capturedAkashicEvents).toHaveLength(1)
    expect(capturedAkashicEvents[0]?.type).toBe("meeting.recorded")
    expect(capturedAkashicEvents[0]?.source).toBe("ceo")
    expect(capturedAkashicEvents[0]?.provenance?.source_type).toBe("meeting")
  })

  test("works without optional deps", async () => {
    const deps = createMockDeps(tmpDir)
    deps.akashicLogger = null
    deps.personStore = null
    deps.commitmentStore = null

    const result = await executeMeetingTool(deps, {
      title: "Lean Meeting",
      participants: ["Solo"],
      notes: "Minimal setup.",
      action_items: [{ task: "Follow up", assignee: "Solo" }],
    })

    expect(result.success).toBe(true)
    const content = await Bun.file(join(tmpDir, result.vault_path!)).text()
    expect(content).toContain("Lean Meeting")
  })

  test("creates person records for new participants", async () => {
    const deps = createMockDeps(tmpDir)

    await executeMeetingTool(deps, {
      title: "Partnership Intro",
      participants: ["New Contact"],
      notes: "Initial conversation.",
    })

    const people = await deps.personStore!.findByName("New Contact")
    expect(people).toHaveLength(1)
    expect(people[0]?.relationship).toBe("other")
  })

  test("returns correct summary string and vault_path", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Ops Planning",
      participants: ["A", "B", "C"],
      notes: "Agenda reviewed.",
      decisions: ["Adopt sprint cadence"],
      action_items: [{ task: "Publish sprint board", assignee: "A" }],
    })

    expect(result.summary).toBe("Meeting logged with 3 participants, 1 decisions, 1 action items")
    expect(result.vault_path).toContain("_brain/ceo/meetings/")
  })

  test("idempotency: same title+date+participants updates existing meeting", async () => {
    const deps = createMockDeps(tmpDir)

    const first = await executeMeetingTool(deps, {
      title: "Weekly Team Sync",
      participants: ["Alice", "Bob"],
      notes: "Initial notes.",
      action_items: [{ task: "Prepare retro", assignee: "Alice" }],
    })
    const second = await executeMeetingTool(deps, {
      title: "Weekly Team Sync",
      participants: ["Alice", "Bob"],
      notes: "Updated notes after follow-up.",
      action_items: [{ task: "Prepare retro", assignee: "Alice" }],
    })

    const files = await readdir(deps.paths.ceoMeetings)
    const commitments = await deps.commitmentStore!.list()
    const content = await Bun.file(join(tmpDir, second.vault_path!)).text()

    expect(first.event_id).toBe(second.event_id)
    expect(second.summary).toBe("Meeting updated with 2 participants, 0 decisions, 1 action items")
    expect(files).toHaveLength(1)
    expect(commitments).toHaveLength(1)
    expect(content).toContain("Updated notes after follow-up.")
  })

  test("empty vault handling is graceful and creates folders on demand", async () => {
    const deps = createMockDeps(tmpDir)

    expect(existsSync(deps.paths.ceoMeetings)).toBe(false)
    const result = await executeMeetingTool(deps, {
      title: "Bootstrap Meeting",
      participants: ["Starter"],
      notes: "Starting from empty vault.",
    })

    expect(result.success).toBe(true)
    expect(existsSync(deps.paths.ceoMeetings)).toBe(true)
  })

  test("handles errors gracefully", async () => {
    const deps = createMockDeps(tmpDir)
    const blockingPath = join(tmpDir, "ceo-meetings-blocker")
    await writeFile(blockingPath, "this is a file, not a directory", "utf-8")
    deps.paths.ceoMeetings = blockingPath

    const result = await executeMeetingTool(deps, {
      title: "Will Fail",
      participants: ["User"],
      notes: "trigger write error",
    })

    expect(result.success).toBe(false)
    expect(typeof result.error).toBe("string")
    expect(typeof result.code).toBe("string")
  })

  test("meeting markdown is created from template structure", async () => {
    const deps = createMockDeps(tmpDir)

    const result = await executeMeetingTool(deps, {
      title: "Template Verification",
      participants: ["Jordan", "Casey"],
      notes: "Template sections should exist.",
    })

    const content = await Bun.file(join(tmpDir, result.vault_path!)).text()
    expect(content.startsWith("---\n")).toBe(true)
    expect(content).toContain("type: meeting")
    expect(content).toContain("## Participants")
    expect(content).toContain("- Jordan")
    expect(content).toContain("## Decisions")
    expect(content).toContain("## Action Items")
  })
})
