import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { BrainConfigSchema, type BrainConfig } from "./brain/config"

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) return {}
  try {
    const raw = await Bun.file(filePath).text()
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function extractInlineBrainConfig(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {}
  const maybe = input as Record<string, unknown>
  const brain = maybe.brain
  if (!brain || typeof brain !== "object") return {}
  return brain as Record<string, unknown>
}

export async function loadBrainPluginConfig(directory: string, input: unknown): Promise<BrainConfig> {
  const globalConfigPath = join(homedir(), ".config", "opencode", "opencode-plugin-brain.json")
  const projectConfigPath = join(directory, ".opencode", "opencode-plugin-brain.json")

  const globalConfig = await readJsonFile(globalConfigPath)
  const projectConfig = await readJsonFile(projectConfigPath)
  const inlineConfig = extractInlineBrainConfig(input)

  return BrainConfigSchema.parse({
    ...globalConfig,
    ...projectConfig,
    ...inlineConfig,
  })
}
