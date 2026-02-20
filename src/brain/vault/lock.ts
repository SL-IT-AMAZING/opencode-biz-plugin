import { join } from "node:path"

const STALE_TIMEOUT_MS = 10_000

interface LockInfo {
  pid: number
  timestamp: number
  holder: string
}

export interface WriteLock {
  acquire(holder?: string): Promise<boolean>
  release(): Promise<void>
  isLocked(): Promise<boolean>
  forceRelease(): Promise<void>
}

export function createWriteLock(lockFilePath: string): WriteLock {
  let held = false

  async function readLockInfo(): Promise<LockInfo | null> {
    try {
      const file = Bun.file(lockFilePath)
      if (await file.exists()) {
        const content = await file.text()
        return JSON.parse(content) as LockInfo
      }
    } catch {
      // Lock file doesn't exist or is corrupted
    }
    return null
  }

  async function isStale(info: LockInfo): Promise<boolean> {
    const age = Date.now() - info.timestamp
    if (age > STALE_TIMEOUT_MS) return true
    try {
      process.kill(info.pid, 0)
      return false
    } catch {
      return true
    }
  }

  return {
    async acquire(holder = "brain-system"): Promise<boolean> {
      const existing = await readLockInfo()
      if (existing) {
        if (existing.pid === process.pid) {
          held = true
          return true
        }
        if (!(await isStale(existing))) {
          return false
        }
      }

      const lockInfo: LockInfo = {
        pid: process.pid,
        timestamp: Date.now(),
        holder,
      }
      await Bun.write(lockFilePath, JSON.stringify(lockInfo, null, 2))
      held = true
      return true
    },

    async release(): Promise<void> {
      if (!held) return
      try {
        const { unlink } = await import("node:fs/promises")
        await unlink(lockFilePath)
      } catch {
        // Already deleted
      }
      held = false
    },

    async isLocked(): Promise<boolean> {
      const info = await readLockInfo()
      if (!info) return false
      if (await isStale(info)) {
        try {
          const { unlink } = await import("node:fs/promises")
          await unlink(lockFilePath)
        } catch {
          // ignore
        }
        return false
      }
      return true
    },

    async forceRelease(): Promise<void> {
      try {
        const { unlink } = await import("node:fs/promises")
        await unlink(lockFilePath)
      } catch {
        // ignore
      }
      held = false
    },
  }
}
