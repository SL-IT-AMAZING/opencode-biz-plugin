import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Commitment } from "../types"
import { createCommitmentStore } from "./commitment-store"

describe("brain/stores/commitment-store", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `commitment-store-test-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
    return {
      id: "com-1",
      created_at: "2026-01-15T10:00:00.000Z",
      description: "Prepare IR materials",
      assigned_to: "Kim CEO",
      due_date: "2026-02-01T00:00:00.000Z",
      source_event_id: "mtg-1",
      status: "pending",
      schema_version: 1,
      ...overrides,
    }
  }

  test("add + get returns persisted commitment", async () => {
    const store = createCommitmentStore(testDir)
    const record = makeCommitment()

    await store.add(record)
    const result = await store.get(record.id)

    expect(result).toEqual(record)
  })

  test("get returns undefined for missing id", async () => {
    const store = createCommitmentStore(testDir)

    const result = await store.get("missing")

    expect(result).toBeUndefined()
  })

  test("listByStatus filters by status", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1", status: "pending" }))
    await store.add(makeCommitment({ id: "com-2", status: "done" }))
    await store.add(makeCommitment({ id: "com-3", status: "pending" }))

    const pending = await store.listByStatus("pending")

    expect(pending).toHaveLength(2)
    expect(pending.map(r => r.id)).toEqual(["com-1", "com-3"])
  })

  test("listOverdue returns past due pending commitments", async () => {
    const store = createCommitmentStore(testDir)
    const now = new Date("2026-02-05T00:00:00.000Z")
    await store.add(makeCommitment({ id: "com-1", due_date: "2026-02-01T00:00:00.000Z", status: "pending" }))
    await store.add(makeCommitment({ id: "com-2", due_date: "2026-02-10T00:00:00.000Z", status: "pending" }))
    await store.add(makeCommitment({ id: "com-3", due_date: "2026-02-01T00:00:00.000Z", status: "in_progress" }))

    const overdue = await store.listOverdue(now)

    expect(overdue.map(r => r.id)).toEqual(["com-1", "com-3"])
  })

  test("listOverdue excludes done commitments", async () => {
    const store = createCommitmentStore(testDir)
    const now = new Date("2026-02-05T00:00:00.000Z")
    await store.add(makeCommitment({ id: "com-1", due_date: "2026-02-01T00:00:00.000Z", status: "done" }))
    await store.add(makeCommitment({ id: "com-2", due_date: "2026-02-01T00:00:00.000Z", status: "cancelled" }))

    const overdue = await store.listOverdue(now)

    expect(overdue).toHaveLength(0)
  })

  test("complete sets status done and completed_at", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1", status: "in_progress" }))

    const completed = await store.complete("com-1")

    expect(completed?.status).toBe("done")
    expect(completed?.completed_at).toBeDefined()
    expect(completed?.completed_at ? Number.isNaN(Date.parse(completed.completed_at)) : true).toBe(false)
  })

  test("cancel sets status cancelled", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1", status: "pending" }))

    const cancelled = await store.cancel("com-1")

    expect(cancelled?.status).toBe("cancelled")
  })

  test("update modifies record and preserves id", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1", status: "pending" }))

    const updated = await store.update("com-1", {
      status: "in_progress",
      description: "Prepare board deck",
      id: "attempted-overwrite",
    })

    expect(updated?.id).toBe("com-1")
    expect(updated?.status).toBe("in_progress")
    expect(updated?.description).toBe("Prepare board deck")
  })

  test("list returns all commitments", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1" }))
    await store.add(makeCommitment({ id: "com-2" }))

    const commitments = await store.list()

    expect(commitments).toHaveLength(2)
    expect(commitments.map(r => r.id)).toEqual(["com-1", "com-2"])
  })

  test("count returns total commitments", async () => {
    const store = createCommitmentStore(testDir)
    await store.add(makeCommitment({ id: "com-1" }))
    await store.add(makeCommitment({ id: "com-2" }))
    await store.add(makeCommitment({ id: "com-3" }))

    const total = await store.count()

    expect(total).toBe(3)
  })

  test("empty store methods are graceful", async () => {
    const store = createCommitmentStore(testDir)

    const list = await store.list()
    const total = await store.count()
    const pending = await store.listByStatus("pending")
    const overdue = await store.listOverdue(new Date("2026-02-05T00:00:00.000Z"))
    const completed = await store.complete("missing")
    const cancelled = await store.cancel("missing")
    const updated = await store.update("missing", { status: "done" })

    expect(list).toEqual([])
    expect(total).toBe(0)
    expect(pending).toEqual([])
    expect(overdue).toEqual([])
    expect(completed).toBeUndefined()
    expect(cancelled).toBeUndefined()
    expect(updated).toBeUndefined()
  })
})
