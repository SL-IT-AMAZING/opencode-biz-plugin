import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { createAkashicLogger } from "./logger"
import { createBrainPaths } from "../vault/paths"
import type { AkashicEvent, Provenance } from "../types"

describe("brain/akashic/logger — provenance support", () => {
  let tmpDir: string
  let paths: ReturnType<typeof createBrainPaths>

  beforeEach(() => {
    tmpDir = join(tmpdir(), "akashic-provenance-test-" + Date.now())
    mkdirSync(tmpDir, { recursive: true })
    paths = createBrainPaths(tmpDir)
  })

  afterEach(async () => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test("accepts and persists provenance field on CEO event", async () => {
    // #given — a logger and a CEO event with provenance
    const logger = createAkashicLogger(paths)
    const provenance: Provenance = {
      source_type: "meeting",
      source_id: "mtg-001",
      confidence: 0.95,
      created_by: "user",
      citation: "Board meeting 2026-01-15",
    }

    // #when
    const event = await logger.log({
      type: "meeting.recorded",
      source: "ceo",
      priority: 75,
      data: {
        title: "Board Meeting",
        participants: ["Kim CEO", "Lee Investor"],
        vault_path: "_brain/ceo/meetings/board-2026-01-15.md",
      },
      provenance,
    })
    await logger.flush()

    // #then — event returned has provenance
    expect(event.provenance).toBeDefined()
    expect(event.provenance!.source_type).toBe("meeting")
    expect(event.provenance!.source_id).toBe("mtg-001")
    expect(event.provenance!.confidence).toBe(0.95)

    // #then — persisted JSONL also has provenance
    const dateStr = event.timestamp.split("T")[0]
    const logFile = join(paths.akashicDaily, `${dateStr}.jsonl`)
    const content = await Bun.file(logFile).text()
    const parsed = JSON.parse(content.trim()) as AkashicEvent
    expect(parsed.provenance).toBeDefined()
    expect(parsed.provenance!.source_type).toBe("meeting")
    expect(parsed.provenance!.citation).toBe("Board meeting 2026-01-15")
  })

  test("accepts event without provenance (backward compat)", async () => {
    // #given — a logger and a classic event without provenance
    const logger = createAkashicLogger(paths)

    // #when
    const event = await logger.log({
      type: "file.created",
      source: "thalamus",
      priority: 60,
      data: { path: "notes/test.md" },
    })
    await logger.flush()

    // #then — no provenance on event
    expect(event.provenance).toBeUndefined()

    // #then — persisted JSONL has no provenance
    const dateStr = event.timestamp.split("T")[0]
    const logFile = join(paths.akashicDaily, `${dateStr}.jsonl`)
    const content = await Bun.file(logFile).text()
    const parsed = JSON.parse(content.trim()) as AkashicEvent
    expect(parsed.provenance).toBeUndefined()
  })
})
