import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createWriteLock } from "./lock"

describe("brain/vault/lock", () => {
  const TEST_DIR = join(tmpdir(), "brain-lock-test-" + Date.now())
  let lockFilePath: string

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    lockFilePath = join(TEST_DIR, "writer.lock")
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("acquire", () => {
    test("succeeds on fresh lock", async () => {
      // #given - no existing lock file
      const lock = createWriteLock(lockFilePath)

      // #when
      const acquired = await lock.acquire()

      // #then
      expect(acquired).toBe(true)
      expect(existsSync(lockFilePath)).toBe(true)
    })

    test("re-acquires own lock (same PID)", async () => {
      // #given - lock already held by this process
      const lock = createWriteLock(lockFilePath)
      await lock.acquire()

      // #when - acquiring again from same process
      const reacquired = await lock.acquire()

      // #then
      expect(reacquired).toBe(true)
    })

    test("succeeds when stale lock exists (old timestamp)", async () => {
      // #given - a lock file with old timestamp and non-existent PID
      const staleLock = {
        pid: 999999999,
        timestamp: Date.now() - 60_000,
        holder: "stale-holder",
      }
      mkdirSync(TEST_DIR, { recursive: true })
      await Bun.write(lockFilePath, JSON.stringify(staleLock, null, 2))

      // #when
      const lock = createWriteLock(lockFilePath)
      const acquired = await lock.acquire()

      // #then
      expect(acquired).toBe(true)
    })
  })

  describe("release", () => {
    test("removes lock file", async () => {
      // #given - an acquired lock
      const lock = createWriteLock(lockFilePath)
      await lock.acquire()
      expect(existsSync(lockFilePath)).toBe(true)

      // #when
      await lock.release()

      // #then
      expect(existsSync(lockFilePath)).toBe(false)
    })

    test("is safe to call when not held", async () => {
      // #given - a lock that was never acquired
      const lock = createWriteLock(lockFilePath)

      // #when / #then - should not throw
      await lock.release()
    })
  })

  describe("isLocked", () => {
    test("returns false when no lock file exists", async () => {
      // #given - no lock file
      const lock = createWriteLock(lockFilePath)

      // #when
      const locked = await lock.isLocked()

      // #then
      expect(locked).toBe(false)
    })

    test("returns true when locked by current process", async () => {
      // #given - lock acquired by this process
      const lock = createWriteLock(lockFilePath)
      await lock.acquire()

      // #when - checking from a new lock instance reading the same file
      const checker = createWriteLock(lockFilePath)
      const locked = await checker.isLocked()

      // #then
      expect(locked).toBe(true)
    })

    test("returns false for stale lock and cleans it up", async () => {
      // #given - a stale lock file (old timestamp, non-existent PID)
      const staleLock = {
        pid: 999999999,
        timestamp: Date.now() - 60_000,
        holder: "stale",
      }
      await Bun.write(lockFilePath, JSON.stringify(staleLock, null, 2))

      // #when
      const lock = createWriteLock(lockFilePath)
      const locked = await lock.isLocked()

      // #then
      expect(locked).toBe(false)
      expect(existsSync(lockFilePath)).toBe(false)
    })
  })

  describe("forceRelease", () => {
    test("always clears lock file even if not held", async () => {
      // #given - a lock file written by someone else
      const otherLock = {
        pid: process.pid,
        timestamp: Date.now(),
        holder: "other",
      }
      await Bun.write(lockFilePath, JSON.stringify(otherLock, null, 2))
      expect(existsSync(lockFilePath)).toBe(true)

      // #when
      const lock = createWriteLock(lockFilePath)
      await lock.forceRelease()

      // #then
      expect(existsSync(lockFilePath)).toBe(false)
    })

    test("is safe to call when no lock file exists", async () => {
      // #given - no lock file
      const lock = createWriteLock(lockFilePath)

      // #when / #then - should not throw
      await lock.forceRelease()
      expect(existsSync(lockFilePath)).toBe(false)
    })
  })
})
