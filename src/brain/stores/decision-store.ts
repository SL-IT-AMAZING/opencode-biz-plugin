import { readFile, appendFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import type { DecisionRecord } from "../types"
import type { DecisionStore } from "./types"

export function createDecisionStore(storePath: string): DecisionStore {
  const filePath = join(storePath, "decisions.jsonl")

  async function ensureDir(): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
  }

  async function readAll(): Promise<DecisionRecord[]> {
    try {
      const content = await readFile(filePath, "utf-8")
      return content
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as DecisionRecord)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
      throw err
    }
  }

  async function writeAll(records: DecisionRecord[]): Promise<void> {
    await ensureDir()
    const content = records.map(r => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : "")
    await writeFile(filePath, content, "utf-8")
  }

  return {
    async add(decision: DecisionRecord): Promise<void> {
      await ensureDir()
      await appendFile(filePath, JSON.stringify(decision) + "\n", "utf-8")
    },

    async get(id: string): Promise<DecisionRecord | undefined> {
      const records = await readAll()
      return records.find(r => r.id === id)
    },

    async listByStatus(status: DecisionRecord["status"]): Promise<DecisionRecord[]> {
      const records = await readAll()
      return records.filter(r => r.status === status)
    },

    async search(query: string): Promise<DecisionRecord[]> {
      const lower = query.toLowerCase()
      const records = await readAll()
      return records.filter(
        r =>
          r.title.toLowerCase().includes(lower) ||
          r.decision.toLowerCase().includes(lower) ||
          r.context.toLowerCase().includes(lower) ||
          r.reasoning.toLowerCase().includes(lower),
      )
    },

    async update(id: string, updates: Partial<DecisionRecord>): Promise<DecisionRecord | undefined> {
      const records = await readAll()
      const index = records.findIndex(r => r.id === id)
      if (index === -1) return undefined
      records[index] = { ...records[index], ...updates, id }
      await writeAll(records)
      return records[index]
    },

    async list(): Promise<DecisionRecord[]> {
      return readAll()
    },

    async count(): Promise<number> {
      const records = await readAll()
      return records.length
    },
  }
}
