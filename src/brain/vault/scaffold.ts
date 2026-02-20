import { mkdir, stat } from "node:fs/promises"
import type { BrainPaths } from "./paths"
import {
  createReadmeTemplate,
  createSoulTemplate,
  createConfigTemplate,
  createInitialStateJson,
} from "./templates"

export interface ScaffoldResult {
  created: string[]
  existed: string[]
  errors: string[]
}

export async function scaffoldBrainVault(paths: BrainPaths): Promise<ScaffoldResult> {
  const result: ScaffoldResult = {
    created: [],
    existed: [],
    errors: [],
  }

  try {
    const vaultStat = await stat(paths.vault)
    if (!vaultStat.isDirectory()) {
      result.errors.push(`Vault path is not a directory: ${paths.vault}`)
      return result
    }
  } catch {
    result.errors.push(`Vault path does not exist: ${paths.vault}`)
    return result
  }

  const dirs = [
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

  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true })
      result.created.push(dir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        result.existed.push(dir)
      } else {
        result.errors.push(`Failed to create ${dir}: ${(err as Error).message}`)
      }
    }
  }

  const templates: Array<{ path: string; content: string }> = [
    { path: paths.readmeFile, content: createReadmeTemplate() },
    { path: paths.soulFile, content: createSoulTemplate() },
    { path: paths.configFile, content: createConfigTemplate(paths.vault) },
    { path: paths.stateFile, content: createInitialStateJson() },
  ]

  for (const { path, content } of templates) {
    try {
      const file = Bun.file(path)
      if (await file.exists()) {
        result.existed.push(path)
      } else {
        await Bun.write(path, content)
        result.created.push(path)
      }
    } catch (err) {
      result.errors.push(`Failed to write ${path}: ${(err as Error).message}`)
    }
  }

  return result
}
