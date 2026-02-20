import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createThalamusWatcher } from "./watcher"
import { createBrainPaths } from "../vault/paths"
import type { BrainWatchConfig } from "../config"

describe("brain/thalamus/watcher", () => {
  const tmpDir = join(tmpdir(), "thalamus-watcher-test-" + Date.now())
  const paths = createBrainPaths(tmpDir)
  const config: BrainWatchConfig = {
    enabled: true,
    patterns: ["**/*.md"],
    ignore: [],
    debounce_ms: 500,
    coalesce_window_ms: 2000,
  }

  describe("createThalamusWatcher", () => {
    test("returns object with correct interface shape", () => {
      // #given - valid paths and config
      // #when
      const watcher = createThalamusWatcher(paths, config, [])

      // #then
      expect(typeof watcher.start).toBe("function")
      expect(typeof watcher.stop).toBe("function")
      expect(typeof watcher.onEvent).toBe("function")
      expect(typeof watcher.isWatching).toBe("function")
      expect(typeof watcher.getWatchedCount).toBe("function")
    })

    test("isWatching returns false before start", () => {
      // #given - a newly created watcher
      const watcher = createThalamusWatcher(paths, config, [])

      // #when
      const watching = watcher.isWatching()

      // #then
      expect(watching).toBe(false)
    })

    test("getWatchedCount returns 0 before start", () => {
      // #given - a newly created watcher
      const watcher = createThalamusWatcher(paths, config, [])

      // #when
      const count = watcher.getWatchedCount()

      // #then
      expect(count).toBe(0)
    })

    test("onEvent returns an unsubscribe function", () => {
      // #given - a watcher
      const watcher = createThalamusWatcher(paths, config, [])

      // #when
      const unsubscribe = watcher.onEvent(() => {})

      // #then
      expect(typeof unsubscribe).toBe("function")
    })
  })
})
