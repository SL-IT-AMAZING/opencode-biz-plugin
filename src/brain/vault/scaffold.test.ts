import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { scaffoldBrainVault } from "./scaffold"
import { createBrainPaths } from "./paths"

describe("brain/vault/scaffold", () => {
  const TEST_DIR = join(tmpdir(), "brain-scaffold-test-" + Date.now())

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  test("creates all 9 directories", async () => {
    // #given - a valid vault path
    const vaultPath = join(TEST_DIR, "vault-dirs")
    mkdirSync(vaultPath, { recursive: true })
    const paths = createBrainPaths(vaultPath)

    // #when
    const result = await scaffoldBrainVault(paths)

    // #then
    const expectedDirs = [
      paths.brain,
      paths.working,
      paths.daily,
      paths.akashicDaily,
      paths.index,
      paths.locks,
      paths.weeklyArchive,
      paths.monthlyArchive,
      paths.quarterlyArchive,
    ]
    for (const dir of expectedDirs) {
      expect(existsSync(dir)).toBe(true)
    }
    expect(result.errors).toHaveLength(0)
  })

  test("creates 4 template files", async () => {
    // #given - a valid vault path
    const vaultPath = join(TEST_DIR, "vault-files")
    mkdirSync(vaultPath, { recursive: true })
    const paths = createBrainPaths(vaultPath)

    // #when
    const result = await scaffoldBrainVault(paths)

    // #then
    expect(existsSync(paths.readmeFile)).toBe(true)
    expect(existsSync(paths.soulFile)).toBe(true)
    expect(existsSync(paths.configFile)).toBe(true)
    expect(existsSync(paths.stateFile)).toBe(true)
    expect(result.errors).toHaveLength(0)

    const createdFiles = result.created.filter(
      (p) =>
        p === paths.readmeFile ||
        p === paths.soulFile ||
        p === paths.configFile ||
        p === paths.stateFile,
    )
    expect(createdFiles).toHaveLength(4)
  })

  test("does not overwrite existing files", async () => {
    // #given - vault with pre-existing soul.md
    const vaultPath = join(TEST_DIR, "vault-existing")
    mkdirSync(vaultPath, { recursive: true })
    const paths = createBrainPaths(vaultPath)

    mkdirSync(join(paths.brain), { recursive: true })
    const originalContent = "# My Custom Soul"
    writeFileSync(paths.soulFile, originalContent)

    // #when
    const result = await scaffoldBrainVault(paths)

    // #then
    const soulContent = await Bun.file(paths.soulFile).text()
    expect(soulContent).toBe(originalContent)
    expect(result.existed).toContain(paths.soulFile)
  })

  test("returns error for non-existent vault path", async () => {
    // #given - a vault path that does not exist
    const paths = createBrainPaths(join(TEST_DIR, "does-not-exist"))

    // #when
    const result = await scaffoldBrainVault(paths)

    // #then
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("does not exist")
  })

  test("returns error for vault path that is a file not directory", async () => {
    // #given - a vault path that is actually a file
    const filePath = join(TEST_DIR, "not-a-dir")
    writeFileSync(filePath, "just a file")
    const paths = createBrainPaths(filePath)

    // #when
    const result = await scaffoldBrainVault(paths)

    // #then
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain("not a directory")
  })
})
