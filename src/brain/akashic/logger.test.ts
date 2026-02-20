import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { createAkashicLogger } from "./logger"
import { createBrainPaths } from "../vault/paths"
import type { AkashicEvent } from "../types"

describe("brain/akashic/logger", () => {
  let tmpDir: string
  let paths: ReturnType<typeof createBrainPaths>

  beforeEach(() => {
    tmpDir = join(tmpdir(), "akashic-logger-test-" + Date.now())
    mkdirSync(tmpDir, { recursive: true })
    paths = createBrainPaths(tmpDir)
  })

  afterEach(async () => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe("log", () => {
    test("returns event with ULID id of 26 characters", async () => {
      // #given - a logger and a partial event
      const logger = createAkashicLogger(paths)

      // #when
      const event = await logger.log({
        type: "file.created",
        source: "thalamus",
        priority: 60,
        data: { path: "notes/test.md" },
      })

      // #then
      expect(event.id).toHaveLength(26)
      await logger.close()
    })

    test("returns event with ISO timestamp", async () => {
      // #given - a logger
      const logger = createAkashicLogger(paths)

      // #when
      const event = await logger.log({
        type: "file.modified",
        source: "thalamus",
        priority: 50,
        data: { path: "notes/hello.md" },
      })

      // #then
      const parsed = new Date(event.timestamp)
      expect(parsed.toISOString()).toBe(event.timestamp)
      await logger.close()
    })

    test("preserves all partial event fields in returned event", async () => {
      // #given - a partial event with specific fields
      const logger = createAkashicLogger(paths)

      // #when
      const event = await logger.log({
        type: "file.deleted",
        source: "cortex",
        priority: 70,
        data: { path: "docs/removed.md", diff_summary: "File removed" },
      })

      // #then
      expect(event.type).toBe("file.deleted")
      expect(event.source).toBe("cortex")
      expect(event.priority).toBe(70)
      expect(event.data.path).toBe("docs/removed.md")
      expect(event.data.diff_summary).toBe("File removed")
      await logger.close()
    })
  })

  describe("flush", () => {
    test("writes buffered events to date-based JSONL file", async () => {
      // #given - a logger with a logged event
      const logger = createAkashicLogger(paths)
      const event = await logger.log({
        type: "file.created",
        source: "thalamus",
        priority: 55,
        data: { path: "notes/flush-test.md" },
      })

      // #when
      await logger.flush()

      // #then
      const dateStr = event.timestamp.split("T")[0]
      const logFile = join(paths.akashicDaily, `${dateStr}.jsonl`)
      const content = await Bun.file(logFile).text()
      const parsed = JSON.parse(content.trim()) as AkashicEvent
      expect(parsed.id).toBe(event.id)
      expect(parsed.type).toBe("file.created")
      await logger.close()
    })

    test("appends multiple events to the same JSONL file", async () => {
      // #given - a logger with two logged events
      const logger = createAkashicLogger(paths)
      await logger.log({
        type: "file.created",
        source: "thalamus",
        priority: 40,
        data: { path: "a.md" },
      })
      await logger.log({
        type: "file.modified",
        source: "thalamus",
        priority: 50,
        data: { path: "b.md" },
      })

      // #when
      await logger.flush()

      // #then
      const today = new Date().toISOString().split("T")[0]
      const logFile = join(paths.akashicDaily, `${today}.jsonl`)
      const content = await Bun.file(logFile).text()
      const lines = content.split("\n").filter(l => l.trim().length > 0)
      expect(lines.length).toBe(2)
      await logger.close()
    })
  })

  describe("close", () => {
    test("flushes remaining buffer on close", async () => {
      // #given - a logger with an unflushed event
      const logger = createAkashicLogger(paths)
      const event = await logger.log({
        type: "session.started",
        source: "cortex",
        priority: 30,
        data: {},
      })

      // #when
      await logger.close()

      // #then
      const dateStr = event.timestamp.split("T")[0]
      const logFile = join(paths.akashicDaily, `${dateStr}.jsonl`)
      expect(existsSync(logFile)).toBe(true)
      const content = await Bun.file(logFile).text()
      const parsed = JSON.parse(content.trim()) as AkashicEvent
      expect(parsed.id).toBe(event.id)
    })
  })

  describe("getLogPath", () => {
    test("returns path with today's date by default", () => {
      // #given - a logger
      const logger = createAkashicLogger(paths)

      // #when
      const logPath = logger.getLogPath()

      // #then
      const today = new Date().toISOString().split("T")[0]
      expect(logPath).toBe(join(paths.akashicDaily, `${today}.jsonl`))
    })

    test("returns path for a specific date", () => {
      // #given - a logger and a specific date
      const logger = createAkashicLogger(paths)
      const date = new Date("2025-06-15T12:00:00Z")

      // #when
      const logPath = logger.getLogPath(date)

      // #then
      expect(logPath).toBe(join(paths.akashicDaily, "2025-06-15.jsonl"))
    })
  })
})
