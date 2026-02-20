import { join, resolve } from "node:path"

export interface BrainPaths {
  vault: string
  brain: string
  working: string
  daily: string
  akashicDaily: string
  index: string
  locks: string
  weeklyArchive: string
  monthlyArchive: string
  quarterlyArchive: string
  soulFile: string
  configFile: string
  readmeFile: string
  dbFile: string
  stateFile: string
  lockFile: string
  // CEO store paths
  ceo: string
  peopleStore: string
  decisionsStore: string
  commitmentsStore: string
  ceoMeetings: string
}

export function createBrainPaths(vaultPath: string, brainDir = "_brain"): BrainPaths {
  const vault = resolve(vaultPath)
  const brain = join(vault, brainDir)
  return {
    vault,
    brain,
    working: join(brain, "working"),
    daily: join(brain, "memory", "daily"),
    akashicDaily: join(brain, "akashic", "daily"),
    index: join(brain, "index"),
    locks: join(brain, "locks"),
    weeklyArchive: join(brain, "archive", "weekly"),
    monthlyArchive: join(brain, "archive", "monthly"),
    quarterlyArchive: join(brain, "archive", "quarterly"),
    soulFile: join(brain, "soul.md"),
    configFile: join(brain, "config.md"),
    readmeFile: join(brain, "README.md"),
    dbFile: join(brain, "index", "brain.sqlite"),
    stateFile: join(brain, "index", "state.json"),
    lockFile: join(brain, "locks", "writer.lock"),
    ceo: join(brain, "ceo"),
    peopleStore: join(brain, "ceo", "people"),
    decisionsStore: join(brain, "ceo", "decisions"),
    commitmentsStore: join(brain, "ceo", "commitments"),
    ceoMeetings: join(brain, "ceo", "meetings"),
  }
}

export async function detectVaultPath(startDir: string): Promise<string | undefined> {
  let dir = resolve(startDir)
  const root = resolve("/")
  while (dir !== root) {
    try {
      const obsidianAppJson = Bun.file(join(dir, ".obsidian", "app.json"))
      if (await obsidianAppJson.exists()) return dir
    } catch {
      // Not found, continue walking up
    }
    const parent = resolve(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return undefined
}
