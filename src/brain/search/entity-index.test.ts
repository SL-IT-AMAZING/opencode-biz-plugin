import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBrainPaths } from "../vault/paths"
import { createBrainDatabase } from "./db"
import { createEntityIndex } from "./entity-index"
import type { BrainDatabase, EntityIndex } from "./types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("brain/search/entity-index", () => {
  let db: BrainDatabase
  let entityIndex: EntityIndex
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "entity-index-test-"))
    const paths = createBrainPaths(tmpDir)
    mkdirSync(paths.brain, { recursive: true })
    mkdirSync(paths.index, { recursive: true })
    db = createBrainDatabase(paths)
    entityIndex = createEntityIndex(db)
  })

  afterEach(() => {
    db.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  async function seedEntity(input: { type: string; name: string; aliases?: string[]; vault_path?: string }): Promise<string> {
    return entityIndex.upsertEntity(input)
  }

  test("#given valid entity -> creates entity and returns UUID", async () => {
    const id = await seedEntity({ type: "person", name: "Ada Lovelace" })

    expect(id).toBeString()
    expect(id.length).toBeGreaterThan(0)

    const stored = await entityIndex.getEntity(id)
    expect(stored).toBeDefined()
    expect(stored?.name).toBe("Ada Lovelace")
    expect(stored?.type).toBe("person")
  })

  test("#given upsertEntity result -> UUID format matches pattern", async () => {
    const id = await seedEntity({ type: "topic", name: "Distributed Systems" })

    expect(UUID_PATTERN.test(id)).toBe(true)
  })

  test("#given entity with aliases -> aliases are stored and returned", async () => {
    const id = await seedEntity({
      type: "person",
      name: "Grace Hopper",
      aliases: ["Rear Admiral Hopper", "Amazing Grace"],
    })

    const stored = await entityIndex.getEntity(id)
    expect(stored).toBeDefined()
    expect(stored?.aliases).toEqual(["Rear Admiral Hopper", "Amazing Grace"])
  })

  test("#given entity with vault_path -> vault_path is stored correctly", async () => {
    const id = await seedEntity({
      type: "project",
      name: "Compiler Notes",
      vault_path: "notes/projects/compiler.md",
    })

    const stored = await entityIndex.getEntity(id)
    expect(stored).toBeDefined()
    expect(stored?.vault_path).toBe("notes/projects/compiler.md")
  })

  test("#given entity without aliases -> aliases defaults to empty array", async () => {
    const id = await seedEntity({ type: "team", name: "Runtime Squad" })

    const stored = await entityIndex.getEntity(id)
    expect(stored).toBeDefined()
    expect(stored?.aliases).toEqual([])
  })

  test("#given existing entity name -> findEntity finds by exact name", async () => {
    const id = await seedEntity({ type: "person", name: "Linus Torvalds" })

    const results = await entityIndex.findEntity("Linus Torvalds")
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(id)
    expect(results[0].name).toBe("Linus Torvalds")
  })

  test("#given mixed-case partial query -> findEntity matches case-insensitive substring", async () => {
    await seedEntity({ type: "person", name: "Margaret Hamilton" })

    const results = await entityIndex.findEntity("HAMIL")
    expect(results.length).toBe(1)
    expect(results[0].name).toBe("Margaret Hamilton")
  })

  test("#given non-matching query -> findEntity returns empty array", async () => {
    await seedEntity({ type: "topic", name: "Graph Theory" })

    const results = await entityIndex.findEntity("quantum chemistry")
    expect(results).toEqual([])
  })

  test("#given more matches than limit -> findEntity respects limit parameter", async () => {
    await seedEntity({ type: "topic", name: "Kubernetes Intro" })
    await seedEntity({ type: "topic", name: "Kubernetes Deep Dive" })
    await seedEntity({ type: "topic", name: "Kubernetes for Teams" })

    const results = await entityIndex.findEntity("kubernetes", 2)
    expect(results.length).toBe(2)
  })

  test("#given entities with aliases -> findEntity returns aliases as parsed arrays", async () => {
    await seedEntity({
      type: "person",
      name: "Donald Knuth",
      aliases: ["D. E. Knuth", "Professor Knuth"],
    })

    const results = await entityIndex.findEntity("Donald")
    expect(results.length).toBe(1)
    expect(results[0].aliases).toEqual(["D. E. Knuth", "Professor Knuth"])
  })

  test("#given alias query -> findEntity matches entities by alias text", async () => {
    const id = await seedEntity({
      type: "person",
      name: "Guido van Rossum",
      aliases: ["BDFL"],
    })

    const results = await entityIndex.findEntity("BDFL")
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(id)
  })

  test("#given co-occurrence event -> records event for each entity", async () => {
    const a = await seedEntity({ type: "person", name: "Alice" })
    const b = await seedEntity({ type: "person", name: "Bob" })
    const c = await seedEntity({ type: "person", name: "Charlie" })

    await entityIndex.recordCoOccurrence([a, b, c], "evt-1", "speaker")

    expect(db.getEntityEvents(a).length).toBe(1)
    expect(db.getEntityEvents(b).length).toBe(1)
    expect(db.getEntityEvents(c).length).toBe(1)
    expect(db.getEntityEvents(a)[0].role).toBe("speaker")
  })

  test("#given no explicit role -> recordCoOccurrence uses default mentioned role", async () => {
    const a = await seedEntity({ type: "person", name: "Dana" })

    await entityIndex.recordCoOccurrence([a], "evt-role-default")

    const events = db.getEntityEvents(a)
    expect(events.length).toBe(1)
    expect(events[0].role).toBe("mentioned")
  })

  test("#given two entities in one event -> creates one pairwise relation", async () => {
    const a = await seedEntity({ type: "topic", name: "Rust" })
    const b = await seedEntity({ type: "topic", name: "WASM" })

    await entityIndex.recordCoOccurrence([a, b], "evt-pair")

    const relatedToA = await entityIndex.getRelated(a)
    expect(relatedToA.length).toBe(1)
    expect(relatedToA[0].entity.id).toBe(b)
    expect(relatedToA[0].co_occurrence_count).toBe(1)
  })

  test("#given three entities in one event -> creates all unique pairs", async () => {
    const a = await seedEntity({ type: "topic", name: "HTTP" })
    const b = await seedEntity({ type: "topic", name: "TLS" })
    const c = await seedEntity({ type: "topic", name: "TCP" })

    await entityIndex.recordCoOccurrence([a, b, c], "evt-triple")

    const relatedToA = await entityIndex.getRelated(a)
    const relatedToB = await entityIndex.getRelated(b)
    const relatedToC = await entityIndex.getRelated(c)

    expect(relatedToA.length).toBe(2)
    expect(relatedToB.length).toBe(2)
    expect(relatedToC.length).toBe(2)
  })

  test("#given related entities -> getRelated returns entities with co-occurrence count", async () => {
    const a = await seedEntity({ type: "project", name: "Search" })
    const b = await seedEntity({ type: "project", name: "Ranking" })

    await entityIndex.recordCoOccurrence([a, b], "evt-related-1")

    const related = await entityIndex.getRelated(a)
    expect(related.length).toBe(1)
    expect(related[0].entity.name).toBe("Ranking")
    expect(related[0].co_occurrence_count).toBe(1)
  })

  test("#given fresh relation -> getRelated computes decayed_weight near count", async () => {
    const a = await seedEntity({ type: "project", name: "Ingestion" })
    const b = await seedEntity({ type: "project", name: "Parsing" })

    await entityIndex.recordCoOccurrence([a, b], "evt-fresh")

    const related = await entityIndex.getRelated(a)
    expect(related.length).toBe(1)
    expect(related[0].decayed_weight).toBeCloseTo(related[0].co_occurrence_count, 3)
  })

  test("#given no relations -> getRelated returns empty array", async () => {
    const a = await seedEntity({ type: "topic", name: "Neural Search" })

    const related = await entityIndex.getRelated(a)
    expect(related).toEqual([])
  })

  test("#given many related entities -> getRelated respects limit parameter", async () => {
    const base = await seedEntity({ type: "person", name: "Principal Engineer" })
    const r1 = await seedEntity({ type: "person", name: "Engineer One" })
    const r2 = await seedEntity({ type: "person", name: "Engineer Two" })
    const r3 = await seedEntity({ type: "person", name: "Engineer Three" })

    await entityIndex.recordCoOccurrence([base, r1], "evt-limit-1")
    await entityIndex.recordCoOccurrence([base, r2], "evt-limit-2")
    await entityIndex.recordCoOccurrence([base, r3], "evt-limit-3")

    const related = await entityIndex.getRelated(base, 2)
    expect(related.length).toBe(2)
  })

  test("#given repeated co-occurrences -> getRelated increases co_occurrence_count", async () => {
    const a = await seedEntity({ type: "topic", name: "Indexing" })
    const b = await seedEntity({ type: "topic", name: "Caching" })

    await entityIndex.recordCoOccurrence([a, b], "evt-repeat-1")
    await entityIndex.recordCoOccurrence([a, b], "evt-repeat-2")
    await entityIndex.recordCoOccurrence([a, b], "evt-repeat-3")

    const related = await entityIndex.getRelated(a)
    expect(related.length).toBe(1)
    expect(related[0].co_occurrence_count).toBe(3)
  })

  test("#given stale relation timestamp -> getRelated applies time decay formula", async () => {
    const a = await seedEntity({ type: "topic", name: "Sharding" })
    const b = await seedEntity({ type: "topic", name: "Replication" })

    await entityIndex.recordCoOccurrence([a, b], "evt-decay")
    db.raw.prepare("UPDATE entity_relations SET last_updated = ?").run("2020-01-01T00:00:00.000Z")

    const related = await entityIndex.getRelated(a)
    expect(related.length).toBe(1)
    expect(related[0].decayed_weight).toBeLessThan(related[0].co_occurrence_count)
  })

  test("#given existing ID -> getEntity returns full entity fields", async () => {
    const id = await seedEntity({
      type: "document",
      name: "System Design Handbook",
      aliases: ["SDH"],
      vault_path: "library/system-design.md",
    })

    const entity = await entityIndex.getEntity(id)
    expect(entity).toBeDefined()
    expect(entity?.id).toBe(id)
    expect(entity?.type).toBe("document")
    expect(entity?.name).toBe("System Design Handbook")
    expect(entity?.aliases).toEqual(["SDH"])
    expect(entity?.vault_path).toBe("library/system-design.md")
    expect(entity?.first_seen).toBeString()
    expect(entity?.last_seen).toBeString()
    expect(entity?.interaction_count).toBe(0)
  })

  test("#given unknown ID -> getEntity returns undefined", async () => {
    const entity = await entityIndex.getEntity("00000000-0000-4000-8000-000000000000")
    expect(entity).toBeUndefined()
  })

  test("#given multiple entity types -> listEntities returns all without filter", async () => {
    await seedEntity({ type: "person", name: "Leslie" })
    await seedEntity({ type: "topic", name: "Observability" })
    await seedEntity({ type: "project", name: "Alerting Revamp" })

    const entities = await entityIndex.listEntities()
    expect(entities.length).toBe(3)
  })

  test("#given type filter -> listEntities returns only that type", async () => {
    await seedEntity({ type: "person", name: "Priya" })
    await seedEntity({ type: "person", name: "Morgan" })
    await seedEntity({ type: "topic", name: "Reliability" })

    const people = await entityIndex.listEntities("person")
    expect(people.length).toBe(2)
    expect(people.every((entity) => entity.type === "person")).toBe(true)
  })

  test("#given missing type filter value -> listEntities returns empty array", async () => {
    await seedEntity({ type: "person", name: "Uma" })

    const entities = await entityIndex.listEntities("non-existent-type")
    expect(entities).toEqual([])
  })

  test("#given varied interaction counts -> listEntities sorted by interaction_count DESC", async () => {
    const low = await seedEntity({ type: "topic", name: "A-Low" })
    const high = await seedEntity({ type: "topic", name: "Z-High" })
    const mid = await seedEntity({ type: "topic", name: "M-Mid" })

    db.updateEntitySeen(high)
    db.updateEntitySeen(high)
    db.updateEntitySeen(high)
    db.updateEntitySeen(mid)

    const listed = await entityIndex.listEntities("topic")
    expect(listed.length).toBe(3)
    expect(listed[0].id).toBe(high)
    expect(listed[1].id).toBe(mid)
    expect(listed[2].id).toBe(low)
  })

  test("#given listed entities -> listEntities returns aliases arrays and vault paths", async () => {
    await seedEntity({
      type: "person",
      name: "Barbara Liskov",
      aliases: ["LSP author"],
      vault_path: "people/barbara-liskov.md",
    })

    const listed = await entityIndex.listEntities("person")
    expect(listed.length).toBe(1)
    expect(listed[0].aliases).toEqual(["LSP author"])
    expect(listed[0].vault_path).toBe("people/barbara-liskov.md")
  })
})
