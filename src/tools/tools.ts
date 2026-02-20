import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { join } from "node:path"
import { readdir, mkdir } from "node:fs/promises"
import type { BrainToolDeps } from "./types"
import {
  BRAIN_SEARCH_DESCRIPTION,
  BRAIN_GET_DESCRIPTION,
  BRAIN_WRITE_DESCRIPTION,
  BRAIN_RECALL_DESCRIPTION,
  BRAIN_CONSOLIDATE_DESCRIPTION,
  MEMORY_TYPES,
  WRITE_TYPES,
  CONSOLIDATE_SCOPES,
  CONFIDENCE_LEVELS,
} from "./constants"

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + "..."
}

function formatSearchResults(
  results: Array<{ path: string; content: string; fts_score: number; combined_score: number; chunk_index: number }>,
): string {
  if (results.length === 0) return "No results found."
  return results
    .map((r, i) => `[${i + 1}] ${r.path} (chunk ${r.chunk_index}, score: ${r.combined_score.toFixed(3)})\n${truncate(r.content, 200)}`)
    .join("\n\n")
}

export function createBrainTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  let autoConsolidateChecked = false

  function maybeConsolidate(): void {
    if (!deps.microConsolidator) return
    deps.microConsolidator.notifyActivity()
    if (deps.microConsolidator.shouldConsolidate()) {
      deps.microConsolidator.consolidate().catch(() => {})
    }
    if (deps.sleepConsolidator && !autoConsolidateChecked) {
      autoConsolidateChecked = true
      deps.sleepConsolidator.autoConsolidate().catch(() => {})
    }
  }

  const brain_search: ToolDefinition = tool({
    description: BRAIN_SEARCH_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("Search query for brain memories and vault content"),
      limit: tool.schema.number().optional().describe("Maximum results to return (default: 10)"),
      path: tool.schema.string().optional().describe("Filter results to specific vault path"),
    },
    execute: async (args) => {
      maybeConsolidate()
      const limit = args.limit ?? 10
      try {
        let results: Array<{
          path: string
          content: string
          fts_score: number
          vec_score: number
          combined_score: number
          chunk_index: number
        }>

        if (deps.hybridSearcher) {
          results = await deps.hybridSearcher.search(args.query, {
            limit,
            path: args.path,
          })
        } else {
          results = args.path
            ? deps.fts.searchByPath(args.query, args.path, limit)
            : deps.fts.search(args.query, limit)
        }

        return formatSearchResults(results)
      } catch (err) {
        return `Search error: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })

  const brain_get: ToolDefinition = tool({
    description: BRAIN_GET_DESCRIPTION,
    args: {
      type: tool.schema.enum(MEMORY_TYPES).describe("Type of memory to retrieve: soul, working, daily, or file"),
      key: tool.schema.string().optional().describe("Date (YYYY-MM-DD) for daily, relative path for file"),
    },
    execute: async (args) => {
      maybeConsolidate()
      try {
        switch (args.type) {
          case "soul": {
            const file = Bun.file(deps.paths.soulFile)
            if (!(await file.exists())) return "Soul file not found. Run brain initialization first."
            return await file.text()
          }
          case "working": {
            const workingDir = deps.paths.working
            try {
              const entries = await readdir(workingDir)
              const jsonFiles = entries.filter(e => e.endsWith(".json")).sort().reverse()
              if (jsonFiles.length === 0) return "No working memory found for current session."
              const latest = join(workingDir, jsonFiles[0])
              return await Bun.file(latest).text()
            } catch {
              return "No working memory directory found."
            }
          }
          case "daily": {
            if (!args.key) return "Error: 'key' is required for daily memory (YYYY-MM-DD format)."
            const dailyFile = join(deps.paths.daily, `${args.key}.md`)
            const file = Bun.file(dailyFile)
            if (!(await file.exists())) return `No daily memory found for ${args.key}.`
            return await file.text()
          }
          case "file": {
            if (!args.key) return "Error: 'key' is required for file retrieval (relative vault path)."
            const filePath = join(deps.paths.vault, args.key)
            const file = Bun.file(filePath)
            if (!(await file.exists())) return `File not found: ${args.key}`
            return await file.text()
          }
          default:
            return `Unknown memory type: ${args.type}`
        }
      } catch (err) {
        return `Error retrieving memory: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })

  const brain_write: ToolDefinition = tool({
    description: BRAIN_WRITE_DESCRIPTION,
    args: {
      type: tool.schema.enum(WRITE_TYPES).describe("What to write: working, scratch, or decision"),
      content: tool.schema.string().describe("Content to write"),
      reasoning: tool.schema.string().optional().describe("Reasoning for decisions"),
      confidence: tool.schema.enum(CONFIDENCE_LEVELS).optional().describe("Confidence level (default: medium)"),
    },
    execute: async (args) => {
      maybeConsolidate()
      try {
        await mkdir(deps.paths.working, { recursive: true })
        const sessionFile = join(deps.paths.working, "session.json")
        const file = Bun.file(sessionFile)

        let session: {
          entries: Array<{ type: string; content: string; timestamp: string; reasoning?: string; confidence?: string }>
        }

        if (await file.exists()) {
          session = JSON.parse(await file.text())
        } else {
          session = { entries: [] }
        }

        const entry: { type: string; content: string; timestamp: string; reasoning?: string; confidence?: string } = {
          type: args.type,
          content: args.content,
          timestamp: new Date().toISOString(),
        }

        if (args.type === "decision") {
          entry.reasoning = args.reasoning ?? "No reasoning provided"
          entry.confidence = args.confidence ?? "medium"
        }

        session.entries.push(entry)
        await Bun.write(sessionFile, JSON.stringify(session, null, 2))

        return `Written ${args.type} entry to working memory. Total entries: ${session.entries.length}`
      } catch (err) {
        return `Error writing memory: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })

  const brain_recall: ToolDefinition = tool({
    description: BRAIN_RECALL_DESCRIPTION,
    args: {
      query: tool.schema.string().describe("What to recall — topic, date range, or event type"),
      from: tool.schema.string().optional().describe("Start date (YYYY-MM-DD)"),
      to: tool.schema.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: tool.schema.number().optional().describe("Maximum events to return (default: 20)"),
    },
    execute: async (args) => {
      maybeConsolidate()
      try {
        const limit = args.limit ?? 20
        const startDate = args.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const endDate = args.to ?? new Date().toISOString().split("T")[0]
        const events = await deps.akashicReader.readRange(new Date(startDate), new Date(endDate))

        const filtered = args.query
          ? events.filter(e =>
              JSON.stringify(e).toLowerCase().includes(args.query.toLowerCase()),
            )
          : events

        const limited = filtered.slice(0, limit)

        if (limited.length === 0) return `No events found for query "${args.query}" in range ${startDate} to ${endDate}.`

        return limited
          .map(e => `[${e.timestamp}] ${e.type}: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}`)
          .join("\n")
      } catch (err) {
        return `Error recalling events: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })

  const brain_consolidate: ToolDefinition = tool({
    description: BRAIN_CONSOLIDATE_DESCRIPTION,
    args: {
      scope: tool.schema.enum(CONSOLIDATE_SCOPES).optional().describe("What to consolidate: working, daily, or full (default: working)"),
    },
    execute: async (args) => {
      const scope = args.scope ?? "working"

      if (!deps.microConsolidator) {
        return "Consolidation engine not available."
      }

      try {
        if (scope === "working") {
          const result = await deps.microConsolidator.consolidate()
          return [
            "Working memory consolidated.",
            `Events processed: ${result.eventsProcessed}`,
            `Entries processed: ${result.entriesProcessed}`,
            `Session: ${result.workingMemory.session_id}`,
            `Active files: ${result.workingMemory.active_files.length}`,
            `Decisions: ${result.workingMemory.decisions.length}`,
            `Duration: ${result.durationMs.toFixed(0)}ms`,
          ].join("\n")
        }

        if (scope === "daily") {
          if (!deps.sleepConsolidator) {
            return "Sleep consolidator not available."
          }
          const result = await deps.sleepConsolidator.consolidate("daily")
          return [
            "Daily consolidation complete.",
            `Dailies generated: ${result.dailiesGenerated}`,
            `Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "none"}`,
          ].join("\n")
        }

        if (scope === "full") {
          if (!deps.sleepConsolidator) {
            return "Sleep consolidator not available."
          }
          const result = await deps.sleepConsolidator.consolidate("full")
          return [
            "Full consolidation complete.",
            `Dailies generated: ${result.dailiesGenerated}`,
            `Weeklies generated: ${result.weekliesGenerated}`,
            `Monthlies generated: ${result.monthliesGenerated}`,
            `Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "none"}`,
          ].join("\n")
        }

        return `Unknown consolidation scope: ${scope}`
      } catch (err) {
        return `Consolidation error: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })

  return {
    brain_search,
    brain_get,
    brain_write,
    brain_recall,
    brain_consolidate,
  }
}
