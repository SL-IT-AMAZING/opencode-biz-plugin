import { describe, expect, test, afterEach } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { scoreChange } from "./scorer"
import type { PendingChange } from "./types"

describe("brain/thalamus/scorer", () => {
  const TEST_DIR = join(tmpdir(), "scorer-test-" + Date.now())

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("scoreChange", () => {
    test("scores unlink as 70 with structure type", async () => {
      // #given - a deleted file change
      const change: PendingChange = {
        path: join(TEST_DIR, "deleted.md"),
        type: "unlink",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(70)
      expect(result.type).toBe("structure")
    })

    test("scores add as 60 with structure type", async () => {
      // #given - a newly created file change
      const change: PendingChange = {
        path: join(TEST_DIR, "new-file.md"),
        type: "add",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(60)
      expect(result.type).toBe("structure")
    })

    test("scores change with small file as 15", async () => {
      // #given - a changed file that is very small (<100 bytes)
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "tiny.md")
      await Bun.write(filePath, "hi")
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(15)
      expect(result.type).toBe("content")
    })

    test("scores change with large file as 80", async () => {
      // #given - a changed file larger than 50KB
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "large.md")
      await Bun.write(filePath, "x".repeat(60 * 1024))
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(80)
      expect(result.type).toBe("content")
    })

    test("scores change with medium file as 50", async () => {
      // #given - a changed file between 100 bytes and 50KB
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "medium.md")
      await Bun.write(filePath, "x".repeat(500))
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(50)
      expect(result.type).toBe("content")
    })

    test("scores change as 30 when stat fails", async () => {
      // #given - a change pointing to a non-existent file path
      const change: PendingChange = {
        path: join(TEST_DIR, "nonexistent", "ghost.md"),
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(30)
      expect(result.type).toBe("content")
    })
  })
})
