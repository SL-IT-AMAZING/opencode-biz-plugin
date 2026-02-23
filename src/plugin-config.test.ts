import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadBrainPluginConfig } from "./plugin-config"

describe("plugin-config", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    while (tempPaths.length > 0) {
      const path = tempPaths.pop()
      if (path) await rm(path, { recursive: true, force: true })
    }
  })

  test("#given project config file #when loadBrainPluginConfig #then project config is applied", async () => {
    const root = await mkdtemp(join(tmpdir(), "brain-plugin-config-test-"))
    tempPaths.push(root)
    await mkdir(join(root, ".opencode"), { recursive: true })
    await writeFile(
      join(root, ".opencode", "opencode-plugin-brain.json"),
      JSON.stringify({ proactive: { enabled: true, threshold: 0.7 } }),
    )

    const config = await loadBrainPluginConfig(root, {})
    expect(config.proactive?.enabled).toBe(true)
    expect(config.proactive?.threshold).toBe(0.7)
  })

  test("#given inline ctx brain config #when loadBrainPluginConfig #then inline config overrides file config", async () => {
    const root = await mkdtemp(join(tmpdir(), "brain-plugin-config-test-"))
    tempPaths.push(root)
    await mkdir(join(root, ".opencode"), { recursive: true })
    await writeFile(
      join(root, ".opencode", "opencode-plugin-brain.json"),
      JSON.stringify({ proactive: { enabled: false, threshold: 0.6 } }),
    )

    const config = await loadBrainPluginConfig(root, {
      brain: {
        proactive: { enabled: true, threshold: 0.8 },
      },
    })

    expect(config.proactive?.enabled).toBe(true)
    expect(config.proactive?.threshold).toBe(0.8)
  })

  test("#given no config file #when loadBrainPluginConfig #then default config is returned", async () => {
    const root = await mkdtemp(join(tmpdir(), "brain-plugin-config-test-"))
    tempPaths.push(root)

    const config = await loadBrainPluginConfig(root, {})
    expect(config.enabled).toBe(false)
    expect(config.brain_dir).toBe("_brain")
    expect(config.proactive).toBeUndefined()
  })
})
