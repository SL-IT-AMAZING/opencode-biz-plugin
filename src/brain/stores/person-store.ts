import { readFile, appendFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import type { PersonRecord } from "../types"
import type { PersonStore } from "./types"

export function createPersonStore(storePath: string): PersonStore {
  const filePath = join(storePath, "people.jsonl")

  async function ensureDir(): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
  }

  async function readAll(): Promise<PersonRecord[]> {
    try {
      const content = await readFile(filePath, "utf-8")
      return content
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as PersonRecord)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
      throw err
    }
  }

  async function writeAll(records: PersonRecord[]): Promise<void> {
    await ensureDir()
    const content = records.map(r => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : "")
    await writeFile(filePath, content, "utf-8")
  }

  return {
    async add(person: PersonRecord): Promise<void> {
      await ensureDir()
      await appendFile(filePath, JSON.stringify(person) + "\n", "utf-8")
    },

    async get(id: string): Promise<PersonRecord | undefined> {
      const records = await readAll()
      return records.find(r => r.id === id)
    },

    async findByName(name: string): Promise<PersonRecord[]> {
      const records = await readAll()
      const lower = name.toLowerCase()
      return records.filter(
        r => r.name.toLowerCase().includes(lower) || r.aliases.some(a => a.toLowerCase().includes(lower)),
      )
    },

    async update(id: string, updates: Partial<PersonRecord>): Promise<PersonRecord | undefined> {
      const records = await readAll()
      const index = records.findIndex(r => r.id === id)
      if (index === -1) return undefined
      records[index] = { ...records[index], ...updates, id }
      await writeAll(records)
      return records[index]
    },

    async list(): Promise<PersonRecord[]> {
      return readAll()
    },

    async count(): Promise<number> {
      const records = await readAll()
      return records.length
    },
  }
}
