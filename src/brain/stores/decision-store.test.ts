import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { DecisionRecord } from "../types"
import { createDecisionStore } from "./decision-store"

describe("brain/stores/decision-store", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `decision-store-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
    return {
      id: "dec-1",
      timestamp: "2026-01-15T10:00:00.000Z",
      title: "Hire CTO",
      context: "Need tech leadership",
      decision: "Promote internally",
      reasoning: "Cultural fit",
      alternatives_considered: ["External hire"],
      participants: ["Kim CEO"],
      confidence: "high",
      status: "decided",
      provenance: { source_type: "meeting", source_id: "mtg-1", confidence: 1, created_by: "user" },
      vault_path: "_brain/ceo/decisions/hire-cto.md",
      schema_version: 1,
      ...overrides,
    }
  }

  test("add + get returns persisted decision", async () => {
    // #given
    const store = createDecisionStore(testDir)
    const record = makeDecision()

    // #when
    await store.add(record)
    const result = await store.get(record.id)

    // #then
    expect(result).toEqual(record)
  })

  test("get returns undefined for missing id", async () => {
    // #given
    const store = createDecisionStore(testDir)

    // #when
    const result = await store.get("missing")

    // #then
    expect(result).toBeUndefined()
  })

  test("listByStatus filters records by status", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1", status: "decided" }))
    await store.add(makeDecision({ id: "dec-2", status: "proposed" }))
    await store.add(makeDecision({ id: "dec-3", status: "decided" }))

    // #when
    const decided = await store.listByStatus("decided")

    // #then
    expect(decided).toHaveLength(2)
    expect(decided.map(r => r.id)).toEqual(["dec-1", "dec-3"])
  })

  test("search matches title", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1", title: "Hire CTO" }))
    await store.add(makeDecision({ id: "dec-2", title: "Expand sales team" }))

    // #when
    const result = await store.search("hire")

    // #then
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe("dec-1")
  })

  test("search matches decision content", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1", decision: "Promote internally" }))
    await store.add(makeDecision({ id: "dec-2", decision: "Run external search" }))

    // #when
    const result = await store.search("external")

    // #then
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe("dec-2")
  })

  test("update modifies existing record and preserves id", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1", status: "proposed" }))

    // #when
    const updated = await store.update("dec-1", {
      status: "decided",
      reasoning: "Board alignment",
      id: "attempted-overwrite",
    })

    // #then
    expect(updated).toBeDefined()
    expect(updated?.id).toBe("dec-1")
    expect(updated?.status).toBe("decided")
    expect(updated?.reasoning).toBe("Board alignment")
  })

  test("update returns undefined for unknown id", async () => {
    // #given
    const store = createDecisionStore(testDir)

    // #when
    const updated = await store.update("missing", { title: "No-op" })

    // #then
    expect(updated).toBeUndefined()
  })

  test("list returns all records", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1" }))
    await store.add(makeDecision({ id: "dec-2" }))

    // #when
    const records = await store.list()

    // #then
    expect(records).toHaveLength(2)
    expect(records.map(r => r.id)).toEqual(["dec-1", "dec-2"])
  })

  test("count returns total records", async () => {
    // #given
    const store = createDecisionStore(testDir)
    await store.add(makeDecision({ id: "dec-1" }))
    await store.add(makeDecision({ id: "dec-2" }))
    await store.add(makeDecision({ id: "dec-3" }))

    // #when
    const total = await store.count()

    // #then
    expect(total).toBe(3)
  })
})
