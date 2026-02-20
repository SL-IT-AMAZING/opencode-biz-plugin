export * from "./types"
export { BrainConfigSchema, type BrainConfig } from "./config"
export {
  createBrainPaths,
  detectVaultPath,
  scaffoldBrainVault,
  createWriteLock,
  type BrainPaths,
  type ScaffoldResult,
  type WriteLock,
} from "./vault"

import type { BrainConfig } from "./config"
import { createBrainPaths, detectVaultPath, scaffoldBrainVault, createWriteLock } from "./vault"
import type { BrainPaths, WriteLock, ScaffoldResult } from "./vault"

export interface BrainSystem {
  readonly paths: BrainPaths
  readonly config: BrainConfig
  readonly lock: WriteLock
  init(): Promise<ScaffoldResult>
  shutdown(): Promise<void>
  isInitialized(): boolean
}

export function createBrainSystem(config: BrainConfig): BrainSystem {
  const vaultPath = config.vault_path
  if (!vaultPath) {
    throw new Error(
      "Brain system requires vault_path in config. Set it explicitly or ensure you are inside an Obsidian vault.",
    )
  }

  const paths = createBrainPaths(vaultPath, config.brain_dir)
  const lock = createWriteLock(paths.lockFile)
  let initialized = false

  return {
    get paths() {
      return paths
    },
    get config() {
      return config
    },
    get lock() {
      return lock
    },

    async init(): Promise<ScaffoldResult> {
      if (initialized) {
        return { created: [], existed: [], errors: ["Already initialized"] }
      }

      const acquired = await lock.acquire("brain-system-init")
      if (!acquired) {
        return { created: [], existed: [], errors: ["Could not acquire write lock — another brain instance may be running"] }
      }

      try {
        const result = await scaffoldBrainVault(paths)
        if (result.errors.length === 0) {
          initialized = true
        }
        return result
      } finally {
        await lock.release()
      }
    },

    async shutdown(): Promise<void> {
      if (!initialized) return
      await lock.forceRelease()
      initialized = false
    },

    isInitialized(): boolean {
      return initialized
    },
  }
}
