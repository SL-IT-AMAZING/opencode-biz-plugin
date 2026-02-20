import chokidar from "chokidar"
import { join, relative, basename } from "node:path"
import { ulid } from "ulid"
import type { BrainPaths } from "../vault"
import type { BrainWatchConfig } from "../config"
import type { AkashicEvent } from "../types"
import type { ThalamusWatcher, ThalamusEventHandler, PendingChange } from "./types"
import { scoreChange } from "./scorer"

export function createThalamusWatcher(
  paths: BrainPaths,
  config: BrainWatchConfig,
  excludePaths: string[] = [],
): ThalamusWatcher {
  let fsWatcher: ReturnType<typeof chokidar.watch> | null = null
  const handlers = new Set<ThalamusEventHandler>()
  const pending = new Map<string, PendingChange>()
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null
  let watching = false

  const brainDirName = basename(paths.brain)

  function buildIgnored(): (string | RegExp)[] {
    return [
      /(^|[/\\])\./,                                           // Hidden files/dirs (.obsidian, .git, etc.)
      new RegExp(`(^|[/\\\\])${brainDirName}([/\\\\]|$)`),     // Brain system dir
      /node_modules/,
      ...excludePaths.map(p => join(paths.vault, p)),
      ...config.ignore,
    ]
  }

  function toRelative(absPath: string): string {
    return relative(paths.vault, absPath)
  }

  function matchesWatchPatterns(absPath: string): boolean {
    const rel = toRelative(absPath)
    return config.patterns.some(pattern => {
      if (pattern === "**/*") return true
      // Handle "**/*.ext" glob pattern
      const globMatch = pattern.match(/^\*\*\/\*(\.\w+)$/)
      if (globMatch) return rel.endsWith(globMatch[1])
      // Handle "*.ext" pattern
      const extMatch = pattern.match(/^\*(\.\w+)$/)
      if (extMatch) return rel.endsWith(extMatch[1])
      return rel.includes(pattern)
    })
  }

  function toEventType(changeType: "add" | "change" | "unlink"): AkashicEvent["type"] {
    switch (changeType) {
      case "add": return "file.created"
      case "change": return "file.modified"
      case "unlink": return "file.deleted"
    }
  }

  async function emitToHandlers(event: AkashicEvent): Promise<void> {
    await Promise.allSettled(
      [...handlers].map(h => Promise.resolve(h(event))),
    )
  }

  async function processPending(): Promise<void> {
    const batch = new Map(pending)
    pending.clear()
    coalesceTimer = null

    for (const [, change] of batch) {
      if (!matchesWatchPatterns(change.path)) continue

      const significance = await scoreChange(change, paths.vault)

      const event: AkashicEvent = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        type: toEventType(change.type),
        source: "thalamus",
        priority: significance.score,
        data: {
          path: toRelative(change.path),
          diff_summary: significance.reason,
          metadata: {
            significance_type: significance.type,
            change_type: change.type,
          },
        },
      }

      await emitToHandlers(event)
    }
  }

  function scheduleCoalesce(): void {
    if (coalesceTimer) return
    coalesceTimer = setTimeout(() => {
      processPending().catch(() => {})
    }, config.coalesce_window_ms)
  }

  function onFileEvent(type: "add" | "change" | "unlink", filePath: string): void {
    pending.set(filePath, {
      path: filePath,
      type,
      timestamp: Date.now(),
    })
    scheduleCoalesce()
  }

  return {
    async start(): Promise<void> {
      if (watching) return

      fsWatcher = chokidar.watch(paths.vault, {
        ignored: buildIgnored(),
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: config.debounce_ms,
          pollInterval: 100,
        },
        persistent: true,
      })

      fsWatcher.on("add", path => onFileEvent("add", path))
      fsWatcher.on("change", path => onFileEvent("change", path))
      fsWatcher.on("unlink", path => onFileEvent("unlink", path))

      await new Promise<void>(resolve => {
        fsWatcher!.on("ready", resolve)
      })

      watching = true
    },

    async stop(): Promise<void> {
      if (!watching || !fsWatcher) return

      if (coalesceTimer) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }

      if (pending.size > 0) {
        await processPending()
      }

      await fsWatcher.close()
      fsWatcher = null
      watching = false
    },

    onEvent(handler: ThalamusEventHandler): () => void {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },

    isWatching(): boolean {
      return watching
    },

    getWatchedCount(): number {
      if (!fsWatcher) return 0
      const watched = fsWatcher.getWatched()
      let count = 0
      for (const files of Object.values(watched)) {
        count += files.length
      }
      return count
    },
  }
}
