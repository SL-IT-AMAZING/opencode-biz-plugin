import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { createAkashicReader, queryAkashicEvents } from "./reader"
import { createBrainPaths } from "../vault/paths"
import type { AkashicEvent } from "../types"

function makeEvent(overrides: Partial<AkashicEvent> & Pick<AkashicEvent, "id" | "timestamp" | "type" | "source" | "priority" | "data">): AkashicEvent {
  return { ...overrides }
}

function writeFixture(dir: string, date: string, events: AkashicEvent[]): void {
  const filePath = join(dir, `${date}.jsonl`)
  const content = events.map(e => JSON.stringify(e)).join("\n") + "\n"
  mkdirSync(dir, { recursive: true })
  Bun.write(filePath, content)
}

describe("brain/akashic/reader", () => {
  let tmpDir: string
  let paths: ReturnType<typeof createBrainPaths>

  const event1: AkashicEvent = makeEvent({
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    timestamp: "2025-07-01T10:00:00.000Z",
    type: "file.created",
    source: "thalamus",
    priority: 60,
    data: { path: "notes/hello.md" },
  })

  const event2: AkashicEvent = makeEvent({
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    timestamp: "2025-07-01T14:00:00.000Z",
    type: "file.modified",
    source: "thalamus",
    priority: 50,
    data: { path: "notes/world.md" },
  })

  const event3: AkashicEvent = makeEvent({
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    timestamp: "2025-07-02T09:00:00.000Z",
    type: "file.deleted",
    source: "cortex",
    priority: 70,
    data: { path: "notes/hello.md" },
  })

  beforeEach(async () => {
    tmpDir = join(tmpdir(), "akashic-reader-test-" + Date.now())
    mkdirSync(tmpDir, { recursive: true })
    paths = createBrainPaths(tmpDir)
    mkdirSync(paths.akashicDaily, { recursive: true })

    await writeFixture(paths.akashicDaily, "2025-07-01", [event1, event2])
    await writeFixture(paths.akashicDaily, "2025-07-02", [event3])
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe("readDate", () => {
    test("reads all events from a specific date file", async () => {
      // #given - JSONL fixture files with events for 2025-07-01
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.readDate(new Date("2025-07-01T00:00:00Z"))

      // #then
      expect(events).toHaveLength(2)
      expect(events[0].id).toBe(event1.id)
      expect(events[1].id).toBe(event2.id)
    })

    test("returns empty array for a date with no events", async () => {
      // #given - no fixture for 2025-07-10
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.readDate(new Date("2025-07-10T00:00:00Z"))

      // #then
      expect(events).toHaveLength(0)
    })
  })

  describe("readRange", () => {
    test("reads events within the specified date range", async () => {
      // #given - fixtures spanning 2025-07-01 and 2025-07-02
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.readRange(
        new Date("2025-07-01T00:00:00Z"),
        new Date("2025-07-02T00:00:00Z"),
      )

      // #then
      expect(events).toHaveLength(3)
    })

    test("excludes dates outside the range", async () => {
      // #given - fixtures spanning multiple dates
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.readRange(
        new Date("2025-07-02T00:00:00Z"),
        new Date("2025-07-02T00:00:00Z"),
      )

      // #then
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe(event3.id)
    })
  })

  describe("queryByType", () => {
    test("returns only events matching the type", async () => {
      // #given - fixtures with file.created and file.modified events
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.queryByType("file.created")

      // #then
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe("file.created")
    })

    test("returns empty when no events match the type", async () => {
      // #given - no session.started events in fixtures
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.queryByType("session.started")

      // #then
      expect(events).toHaveLength(0)
    })
  })

  describe("queryByPath", () => {
    test("returns events matching the specified path", async () => {
      // #given - fixtures with events for notes/hello.md
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.queryByPath("notes/hello.md")

      // #then
      expect(events).toHaveLength(2)
      expect(events.every(e => e.data.path === "notes/hello.md")).toBe(true)
    })

    test("returns empty for a path with no events", async () => {
      // #given - no events for nonexistent.md
      const reader = createAkashicReader(paths)

      // #when
      const events = await reader.queryByPath("nonexistent.md")

      // #then
      expect(events).toHaveLength(0)
    })
  })

  describe("count", () => {
    test("counts all events across all files", async () => {
      // #given - 3 total events across two date files
      const reader = createAkashicReader(paths)

      // #when
      const total = await reader.count()

      // #then
      expect(total).toBe(3)
    })

    test("counts events for a specific date", async () => {
      // #given - 2 events on 2025-07-01
      const reader = createAkashicReader(paths)

      // #when
      const count = await reader.count(new Date("2025-07-01T00:00:00Z"))

      // #then
      expect(count).toBe(2)
    })
  })

  describe("queryAkashicEvents", () => {
    test("filters by event types", async () => {
      // #given - fixtures with multiple event types
      // #when
      const events = await queryAkashicEvents(paths, {
        from: new Date("2025-07-01T00:00:00Z"),
        to: new Date("2025-07-02T00:00:00Z"),
        types: ["file.deleted"],
      })

      // #then
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe("file.deleted")
    })

    test("filters by paths", async () => {
      // #given - fixtures with events on different paths
      // #when
      const events = await queryAkashicEvents(paths, {
        from: new Date("2025-07-01T00:00:00Z"),
        to: new Date("2025-07-02T00:00:00Z"),
        paths: ["notes/world.md"],
      })

      // #then
      expect(events).toHaveLength(1)
      expect(events[0].data.path).toBe("notes/world.md")
    })

    test("filters by minPriority", async () => {
      // #given - events with priorities 50, 60, 70
      // #when
      const events = await queryAkashicEvents(paths, {
        from: new Date("2025-07-01T00:00:00Z"),
        to: new Date("2025-07-02T00:00:00Z"),
        minPriority: 65,
      })

      // #then
      expect(events).toHaveLength(1)
      expect(events[0].priority).toBeGreaterThanOrEqual(65)
    })

    test("returns empty for non-existent akashic directory", async () => {
      // #given - paths pointing to a dir with no akashicDaily
      const emptyDir = join(tmpdir(), "akashic-empty-" + Date.now())
      mkdirSync(emptyDir, { recursive: true })
      const emptyPaths = createBrainPaths(emptyDir)

      // #when
      const events = await queryAkashicEvents(emptyPaths, {
        from: new Date("2025-01-01T00:00:00Z"),
        to: new Date("2025-12-31T00:00:00Z"),
      })

      // #then
      expect(events).toHaveLength(0)
      rmSync(emptyDir, { recursive: true, force: true })
    })
  })
})
