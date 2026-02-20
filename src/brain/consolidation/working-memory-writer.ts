import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ConsolidationCursor } from "./types"
import type { WorkingMemory } from "../types"

export interface WorkingMemoryWriter {
  writeSnapshot(memory: WorkingMemory, sessionId: string): Promise<void>
  readSnapshot(sessionId: string): Promise<WorkingMemory | null>
  writeCursor(cursor: ConsolidationCursor): Promise<void>
  readCursor(sessionId: string): Promise<ConsolidationCursor | null>
  toMarkdown(memory: WorkingMemory): string
}

function getSnapshotPath(workingDir: string, sessionId: string): string {
  return join(workingDir, `${sessionId}.working_memory.json`)
}

function getSnapshotMarkdownPath(workingDir: string, sessionId: string): string {
  return join(workingDir, `${sessionId}.working_memory.md`)
}

function getCursorPath(workingDir: string, sessionId: string): string {
  return join(workingDir, `${sessionId}.consolidation_cursor.json`)
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error as { code?: string }).code === "ENOENT"
}

function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function createWorkingMemoryWriter(workingDir: string): WorkingMemoryWriter {
  return {
    async writeSnapshot(memory: WorkingMemory, sessionId: string): Promise<void> {
      const snapshotPath = getSnapshotPath(workingDir, sessionId)
      const markdownPath = getSnapshotMarkdownPath(workingDir, sessionId)

      await writeFile(snapshotPath, toPrettyJson(memory), "utf8")
      await writeFile(markdownPath, this.toMarkdown(memory), "utf8")
    },

    async readSnapshot(sessionId: string): Promise<WorkingMemory | null> {
      try {
        const raw = await readFile(getSnapshotPath(workingDir, sessionId), "utf8")
        return JSON.parse(raw) as WorkingMemory
      } catch (error) {
        if (isMissingFileError(error) || error instanceof SyntaxError) {
          return null
        }
        throw error
      }
    },

    async writeCursor(cursor: ConsolidationCursor): Promise<void> {
      const cursorPath = getCursorPath(workingDir, cursor.sessionId)
      await writeFile(cursorPath, toPrettyJson(cursor), "utf8")
    },

    async readCursor(sessionId: string): Promise<ConsolidationCursor | null> {
      try {
        const raw = await readFile(getCursorPath(workingDir, sessionId), "utf8")
        return JSON.parse(raw) as ConsolidationCursor
      } catch (error) {
        if (isMissingFileError(error) || error instanceof SyntaxError) {
          return null
        }
        throw error
      }
    },

    toMarkdown(memory: WorkingMemory): string {
      const lines: string[] = []

      lines.push("# Working Memory")
      lines.push("")
      lines.push(`**Session**: ${memory.session_id}`)
      lines.push(`**Started**: ${memory.started_at}`)
      lines.push(`**Updated**: ${memory.updated_at}`)
      lines.push("")

      lines.push("## Context Summary")
      lines.push("")
      lines.push(memory.context_summary)
      lines.push("")

      lines.push("## Active Files")
      lines.push("")
      if (memory.active_files.length === 0) {
        lines.push("No active files.")
      } else {
        for (const activeFile of memory.active_files) {
          lines.push(`- ${activeFile}`)
        }
      }
      lines.push("")

      lines.push("## Decisions")
      lines.push("")
      if (memory.decisions.length === 0) {
        lines.push("No decisions recorded.")
      } else {
        memory.decisions.forEach((decision, index) => {
          lines.push(`${index + 1}. [${decision.confidence}] ${decision.decision} — ${decision.reasoning} (at ${decision.timestamp})`)
        })
      }
      lines.push("")

      lines.push("## Scratch")
      lines.push("")
      lines.push(memory.scratch.trim().length > 0 ? memory.scratch : "No scratch notes.")
      lines.push("")

      lines.push("## Retrieval Log")
      lines.push("")
      if (memory.retrieval_log.length === 0) {
        lines.push("No searches recorded.")
      } else {
        for (const retrieval of memory.retrieval_log) {
          lines.push(`- [${retrieval.timestamp}] "${retrieval.query}" → ${retrieval.results_count} results`)
        }
      }

      return `${lines.join("\n")}\n`
    },
  }
}
