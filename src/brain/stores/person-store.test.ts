import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { PersonRecord } from "../types"
import { createPersonStore } from "./person-store"

function makePerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: "person-1",
    name: "Kim CEO",
    aliases: ["Kim", "CEO Kim"],
    role: "CEO",
    company: "StartupCo",
    relationship: "team",
    first_seen: "2026-01-01T00:00:00.000Z",
    last_seen: "2026-01-15T00:00:00.000Z",
    interaction_count: 5,
    key_topics: ["strategy", "hiring"],
    notes: "Founding CEO",
    vault_path: "_brain/ceo/people/kim-ceo.md",
    schema_version: 1,
    ...overrides,
  }
}

describe("brain/stores/person-store", () => {
  let storeDir = ""

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), "person-store-"))
  })

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true })
  })

  test("#given a saved person #when get is called #then add and get person by id", async () => {
    const store = createPersonStore(storeDir)
    const person = makePerson()

    await store.add(person)
    const found = await store.get(person.id)

    expect(found).toEqual(person)
  })

  test("#given an unknown id #when get is called #then returns undefined for non-existent id", async () => {
    const store = createPersonStore(storeDir)

    const found = await store.get("missing")

    expect(found).toBeUndefined()
  })

  test("#given mixed-case name query #when findByName is called #then findByName matches by name (case-insensitive)", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson())

    const results = await store.findByName("kIm ceO")

    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe("person-1")
  })

  test("#given alias query #when findByName is called #then findByName matches by alias", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson())

    const results = await store.findByName("ceo kim")

    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe("Kim CEO")
  })

  test("#given no matching person #when findByName is called #then findByName returns empty array when no match", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson())

    const results = await store.findByName("unknown")

    expect(results).toEqual([])
  })

  test("#given an existing person #when update is called #then update modifies fields and preserves id", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson())

    const updated = await store.update("person-1", {
      id: "different-id",
      notes: "Updated notes",
      interaction_count: 6,
    })

    expect(updated?.id).toBe("person-1")
    expect(updated?.notes).toBe("Updated notes")
    expect(updated?.interaction_count).toBe(6)
    const persisted = await store.get("person-1")
    expect(persisted?.id).toBe("person-1")
  })

  test("#given an unknown id #when update is called #then update returns undefined for non-existent id", async () => {
    const store = createPersonStore(storeDir)

    const updated = await store.update("missing", { notes: "No-op" })

    expect(updated).toBeUndefined()
  })

  test("#given multiple persons #when list is called #then list returns all persons", async () => {
    const store = createPersonStore(storeDir)
    const first = makePerson({ id: "person-1", name: "Kim CEO" })
    const second = makePerson({ id: "person-2", name: "Alex CTO", aliases: ["Alex"] })
    await store.add(first)
    await store.add(second)

    const all = await store.list()

    expect(all).toHaveLength(2)
    expect(all).toEqual([first, second])
  })

  test("#given multiple persons #when count is called #then count returns number of persons", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson({ id: "person-1" }))
    await store.add(makePerson({ id: "person-2", name: "Alex CTO", aliases: ["Alex"] }))
    await store.add(makePerson({ id: "person-3", name: "Sam COO", aliases: ["Sam"] }))

    const total = await store.count()

    expect(total).toBe(3)
  })

  test("#given no data #when reading store #then handles empty store gracefully", async () => {
    const store = createPersonStore(storeDir)

    const all = await store.list()
    const total = await store.count()
    const found = await store.get("missing")

    expect(all).toEqual([])
    expect(total).toBe(0)
    expect(found).toBeUndefined()
  })

  test("#given multiple matching people #when searching by partial name #then returns all matches", async () => {
    const store = createPersonStore(storeDir)
    await store.add(makePerson({ id: "person-1", name: "Kim CEO" }))
    await store.add(makePerson({ id: "person-2", name: "Kim Investor", aliases: ["K. Investor"] }))
    await store.add(makePerson({ id: "person-3", name: "Alex CTO", aliases: ["Alex"] }))

    const results = await store.findByName("kim")

    expect(results).toHaveLength(2)
    expect(results.map(person => person.id)).toEqual(["person-1", "person-2"])
  })
})
