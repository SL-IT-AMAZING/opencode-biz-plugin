import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBrainSystem } from "./index"
import type { BrainConfig } from "./config"

describe("brain/createBrainSystem", () => {
  const TEST_DIR = join(tmpdir(), "brain-system-test-" + Date.now())

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  function makeConfig(overrides: Partial<BrainConfig> = {}): BrainConfig {
    return {
      enabled: true,
      vault_path: join(TEST_DIR, "vault"),
      brain_dir: "_brain",
      exclude_paths: [],
      ...overrides,
    }
  }

  describe("constructor", () => {
    test("throws when vault_path is undefined", () => {
      // #given - config without vault_path
      const config = makeConfig({ vault_path: undefined })

      // #when / #then
      expect(() => createBrainSystem(config)).toThrow("vault_path")
    })

    test("creates valid system with paths, lock, and config", () => {
      // #given - a valid config
      const vaultPath = join(TEST_DIR, "vault")
      const config = makeConfig({ vault_path: vaultPath })

      // #when
      const system = createBrainSystem(config)

      // #then
      expect(system.paths).toBeDefined()
      expect(system.paths.vault).toContain("vault")
      expect(system.lock).toBeDefined()
      expect(system.config).toBe(config)
      expect(system.isInitialized()).toBe(false)
    })
  })

  describe("init", () => {
    test("scaffolds the vault and sets initialized", async () => {
      // #given - valid vault directory exists
      const vaultPath = join(TEST_DIR, "vault-init")
      mkdirSync(vaultPath, { recursive: true })
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)

      // #when
      const result = await system.init()

      // #then
      expect(result.errors).toHaveLength(0)
      expect(system.isInitialized()).toBe(true)
      expect(existsSync(system.paths.brain)).toBe(true)
      expect(existsSync(system.paths.soulFile)).toBe(true)
      expect(existsSync(system.paths.readmeFile)).toBe(true)
    })

    test("returns error on double-init", async () => {
      // #given - already initialized system
      const vaultPath = join(TEST_DIR, "vault-double")
      mkdirSync(vaultPath, { recursive: true })
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)
      await system.init()

      // #when
      const secondResult = await system.init()

      // #then
      expect(secondResult.errors.length).toBeGreaterThan(0)
      expect(secondResult.errors[0]).toContain("Already initialized")
    })
  })

  describe("shutdown", () => {
    test("releases lock and sets uninitialized", async () => {
      // #given - an initialized system
      const vaultPath = join(TEST_DIR, "vault-shutdown")
      mkdirSync(vaultPath, { recursive: true })
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)
      await system.init()
      expect(system.isInitialized()).toBe(true)

      // #when
      await system.shutdown()

      // #then
      expect(system.isInitialized()).toBe(false)
    })

    test("is safe to call when not initialized", async () => {
      // #given - a system that was never initialized
      const vaultPath = join(TEST_DIR, "vault-no-init")
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)

      // #when / #then - should not throw
      await system.shutdown()
      expect(system.isInitialized()).toBe(false)
    })
  })

  describe("isInitialized", () => {
    test("returns false before init", () => {
      // #given
      const config = makeConfig({ vault_path: join(TEST_DIR, "vault-state") })
      const system = createBrainSystem(config)

      // #when / #then
      expect(system.isInitialized()).toBe(false)
    })

    test("returns true after init", async () => {
      // #given
      const vaultPath = join(TEST_DIR, "vault-state-init")
      mkdirSync(vaultPath, { recursive: true })
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)

      // #when
      await system.init()

      // #then
      expect(system.isInitialized()).toBe(true)
    })

    test("returns false after shutdown", async () => {
      // #given
      const vaultPath = join(TEST_DIR, "vault-state-shutdown")
      mkdirSync(vaultPath, { recursive: true })
      const config = makeConfig({ vault_path: vaultPath })
      const system = createBrainSystem(config)
      await system.init()

      // #when
      await system.shutdown()

      // #then
      expect(system.isInitialized()).toBe(false)
    })
  })
})
