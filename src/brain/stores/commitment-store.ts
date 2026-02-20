import { readFile, appendFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import type { Commitment } from "../types"
import type { CommitmentStore } from "./types"

export function createCommitmentStore(storePath: string): CommitmentStore {
  const filePath = join(storePath, "commitments.jsonl")

  async function ensureDir(): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
  }

  async function readAll(): Promise<Commitment[]> {
    try {
      const content = await readFile(filePath, "utf-8")
      return content
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => JSON.parse(line) as Commitment)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
      throw err
    }
  }

  async function writeAll(records: Commitment[]): Promise<void> {
    await ensureDir()
    const content = records.map(r => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : "")
    await writeFile(filePath, content, "utf-8")
  }

  return {
    async add(commitment: Commitment): Promise<void> {
      await ensureDir()
      await appendFile(filePath, JSON.stringify(commitment) + "\n", "utf-8")
    },

    async get(id: string): Promise<Commitment | undefined> {
      const records = await readAll()
      return records.find(r => r.id === id)
    },

    async listByStatus(status: Commitment["status"]): Promise<Commitment[]> {
      const records = await readAll()
      return records.filter(r => r.status === status)
    },

    async listOverdue(now?: Date): Promise<Commitment[]> {
      const currentDate = (now ?? new Date()).toISOString()
      const records = await readAll()
      return records.filter(
        r => r.due_date && r.due_date < currentDate && (r.status === "pending" || r.status === "in_progress"),
      )
    },

    async complete(id: string): Promise<Commitment | undefined> {
      const records = await readAll()
      const index = records.findIndex(r => r.id === id)
      if (index === -1) return undefined
      records[index] = { ...records[index], status: "done", completed_at: new Date().toISOString() }
      await writeAll(records)
      return records[index]
    },

    async cancel(id: string): Promise<Commitment | undefined> {
      const records = await readAll()
      const index = records.findIndex(r => r.id === id)
      if (index === -1) return undefined
      records[index] = { ...records[index], status: "cancelled" }
      await writeAll(records)
      return records[index]
    },

    async update(id: string, updates: Partial<Commitment>): Promise<Commitment | undefined> {
      const records = await readAll()
      const index = records.findIndex(r => r.id === id)
      if (index === -1) return undefined
      records[index] = { ...records[index], ...updates, id }
      await writeAll(records)
      return records[index]
    },

    async list(): Promise<Commitment[]> {
      return readAll()
    },

    async count(): Promise<number> {
      const records = await readAll()
      return records.length
    },
  }
}
