import { describe, expect, test, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join, resolve, isAbsolute } from "node:path"
import { tmpdir } from "node:os"
import { createBrainPaths, detectVaultPath } from "./paths"

describe("brain/vault/paths", () => {
  const TEST_DIR = join(tmpdir(), "brain-paths-test-" + Date.now())

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("createBrainPaths", () => {
    test("returns correct paths for default _brain dir", () => {
      // #given - a vault path
      const vaultPath = "/tmp/my-vault"

      // #when
      const paths = createBrainPaths(vaultPath)

      // #then
      expect(paths.vault).toBe(resolve(vaultPath))
      expect(paths.brain).toBe(join(resolve(vaultPath), "_brain"))
      expect(paths.working).toBe(join(resolve(vaultPath), "_brain", "working"))
      expect(paths.daily).toBe(join(resolve(vaultPath), "_brain", "memory", "daily"))
      expect(paths.akashicDaily).toBe(join(resolve(vaultPath), "_brain", "akashic", "daily"))
      expect(paths.index).toBe(join(resolve(vaultPath), "_brain", "index"))
      expect(paths.locks).toBe(join(resolve(vaultPath), "_brain", "locks"))
      expect(paths.weeklyArchive).toBe(join(resolve(vaultPath), "_brain", "archive", "weekly"))
      expect(paths.monthlyArchive).toBe(join(resolve(vaultPath), "_brain", "archive", "monthly"))
      expect(paths.quarterlyArchive).toBe(join(resolve(vaultPath), "_brain", "archive", "quarterly"))
      expect(paths.soulFile).toBe(join(resolve(vaultPath), "_brain", "soul.md"))
      expect(paths.configFile).toBe(join(resolve(vaultPath), "_brain", "config.md"))
      expect(paths.readmeFile).toBe(join(resolve(vaultPath), "_brain", "README.md"))
      expect(paths.dbFile).toBe(join(resolve(vaultPath), "_brain", "index", "brain.sqlite"))
      expect(paths.stateFile).toBe(join(resolve(vaultPath), "_brain", "index", "state.json"))
      expect(paths.lockFile).toBe(join(resolve(vaultPath), "_brain", "locks", "writer.lock"))
    })

    test("returns correct CEO paths for default _brain dir", () => {
      // #given
      const vaultPath = "/tmp/my-vault"
      // #when
      const paths = createBrainPaths(vaultPath)
      // #then
      expect(paths.ceo).toBe(join(resolve(vaultPath), "_brain", "ceo"))
      expect(paths.peopleStore).toBe(join(resolve(vaultPath), "_brain", "ceo", "people"))
      expect(paths.decisionsStore).toBe(join(resolve(vaultPath), "_brain", "ceo", "decisions"))
      expect(paths.commitmentsStore).toBe(join(resolve(vaultPath), "_brain", "ceo", "commitments"))
      expect(paths.ceoMeetings).toBe(join(resolve(vaultPath), "_brain", "ceo", "meetings"))
    })

    test("returns correct paths with custom brain dir name", () => {
      // #given - a vault path and custom brain directory
      const vaultPath = "/tmp/my-vault"
      const customDir = ".brain-custom"

      // #when
      const paths = createBrainPaths(vaultPath, customDir)

      // #then
      expect(paths.brain).toBe(join(resolve(vaultPath), customDir))
      expect(paths.working).toBe(join(resolve(vaultPath), customDir, "working"))
      expect(paths.soulFile).toBe(join(resolve(vaultPath), customDir, "soul.md"))
      expect(paths.lockFile).toBe(join(resolve(vaultPath), customDir, "locks", "writer.lock"))
    })

    test("CEO paths use custom brain dir", () => {
      // #given
      const vaultPath = "/tmp/my-vault"
      const customDir = ".brain-custom"
      // #when
      const paths = createBrainPaths(vaultPath, customDir)
      // #then
      expect(paths.ceo).toBe(join(resolve(vaultPath), customDir, "ceo"))
      expect(paths.peopleStore).toBe(join(resolve(vaultPath), customDir, "ceo", "people"))
    })

    test("all path fields resolve to absolute paths under vault", () => {
      // #given - a relative vault path
      const vaultPath = "relative/vault/path"

      // #when
      const paths = createBrainPaths(vaultPath)

      // #then
      const allPaths = [
        paths.vault,
        paths.brain,
        paths.working,
        paths.daily,
        paths.akashicDaily,
        paths.index,
        paths.locks,
        paths.weeklyArchive,
        paths.monthlyArchive,
        paths.quarterlyArchive,
        paths.soulFile,
        paths.configFile,
        paths.readmeFile,
        paths.dbFile,
        paths.stateFile,
        paths.lockFile,
        paths.ceo,
        paths.peopleStore,
        paths.decisionsStore,
        paths.commitmentsStore,
        paths.ceoMeetings,
      ]

      for (const p of allPaths) {
        expect(isAbsolute(p)).toBe(true)
        expect(p.startsWith(paths.vault)).toBe(true)
      }
    })
  })

  describe("detectVaultPath", () => {
    test("finds vault with .obsidian/app.json", async () => {
      // #given - a fake vault with .obsidian/app.json
      const fakeVault = join(TEST_DIR, "vault-detect")
      mkdirSync(join(fakeVault, ".obsidian"), { recursive: true })
      await Bun.write(join(fakeVault, ".obsidian", "app.json"), "{}")

      // #when - searching from a subdirectory
      const subDir = join(fakeVault, "notes", "subfolder")
      mkdirSync(subDir, { recursive: true })
      const result = await detectVaultPath(subDir)

      // #then
      expect(result).toBe(fakeVault)
    })

    test("returns undefined when no vault found", async () => {
      // #given - a directory with no .obsidian anywhere
      const noVault = join(TEST_DIR, "no-vault-" + Date.now())
      mkdirSync(noVault, { recursive: true })

      // #when
      const result = await detectVaultPath(noVault)

      // #then
      expect(result).toBeUndefined()
    })

    test("finds vault when starting at vault root itself", async () => {
      // #given - starting directly at vault root
      const fakeVault = join(TEST_DIR, "vault-root")
      mkdirSync(join(fakeVault, ".obsidian"), { recursive: true })
      await Bun.write(join(fakeVault, ".obsidian", "app.json"), "{}")

      // #when
      const result = await detectVaultPath(fakeVault)

      // #then
      expect(result).toBe(fakeVault)
    })
  })
})
