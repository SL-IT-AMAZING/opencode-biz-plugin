import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import type { BrainToolDeps } from "./types"
import { BRAIN_LOG_DECISION_DESCRIPTION, BRAIN_DECISION_HISTORY_DESCRIPTION } from "./constants"
import { createDecisionTemplate } from "../brain/vault/templates"
import { createProvenance } from "../shared/provenance"
import type { DecisionRecord } from "../brain/types"

function toVaultRelativePath(absolutePath: string, vaultPath: string): string {
  if (!absolutePath.startsWith(vaultPath)) return absolutePath
  return absolutePath.slice(vaultPath.length + 1)
}

function toDecisionFileName(title: string): string {
  return title.toLowerCase().replace(/\s+/g, "-")
}

export function createDecisionTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  const brain_log_decision: ToolDefinition = tool({
    description: BRAIN_LOG_DECISION_DESCRIPTION,
    args: {
      title: tool.schema.string().min(1).describe("Decision title"),
      context: tool.schema.string().optional().describe("Context and background"),
      decision: tool.schema.string().min(1).describe("The decision made"),
      reasoning: tool.schema.string().min(1).describe("Reasoning behind the decision"),
      alternatives: tool.schema.array(tool.schema.string()).optional().describe("Alternatives considered"),
      participants: tool.schema.array(tool.schema.string()).optional().describe("People involved in decision"),
      confidence: tool.schema.enum(["high", "medium", "low"]).optional().describe("Confidence level (default: medium)"),
    },
    execute: async (args) => {
      try {
        const id = crypto.randomUUID()
        const timestamp = new Date().toISOString()
        const date = timestamp.split("T")[0]
        const confidence = args.confidence ?? "medium"
        const filename = `${date}-${toDecisionFileName(args.title)}.md`
        const absoluteVaultPath = join(deps.paths.decisionsStore, filename)
        const vaultPath = toVaultRelativePath(absoluteVaultPath, deps.paths.vault)

        const record: DecisionRecord = {
          id,
          timestamp,
          title: args.title,
          context: args.context ?? "",
          decision: args.decision,
          reasoning: args.reasoning,
          alternatives_considered: args.alternatives ?? [],
          participants: args.participants ?? [],
          confidence,
          status: "decided",
          provenance: createProvenance({
            source_type: "conversation",
            source_id: id,
            confidence: 1,
            created_by: "user",
          }),
          vault_path: vaultPath,
          schema_version: 1,
        }

        if (deps.decisionStore) {
          await deps.decisionStore.add(record)
        }

        await mkdir(deps.paths.decisionsStore, { recursive: true })
        const markdown = createDecisionTemplate(args.title, args.decision, args.reasoning, confidence)
        await Bun.write(absoluteVaultPath, markdown)

        let eventId: string | undefined
        if (deps.akashicLogger) {
          const event = await deps.akashicLogger.log({
            type: "decision.made",
            source: "ceo",
            priority: 75,
            data: {
              title: args.title,
              decision: args.decision,
              reasoning: args.reasoning,
              confidence,
              participants: args.participants ?? [],
              vault_path: vaultPath,
            },
            provenance: record.provenance,
          })
          eventId = event.id
        }

        return JSON.stringify({
          success: true,
          decision_id: id,
          vault_path: vaultPath,
          event_id: eventId,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({
          success: false,
          error: message,
          code: "VAULT_NOT_FOUND",
        })
      }
    },
  })

  const brain_decision_history: ToolDefinition = tool({
    description: BRAIN_DECISION_HISTORY_DESCRIPTION,
    args: {
      query: tool.schema.string().optional().describe("Free-text search query"),
      topic: tool.schema.string().optional().describe("Filter by topic"),
      person: tool.schema.string().optional().describe("Filter by participant name"),
      from: tool.schema.string().optional().describe("Start date (YYYY-MM-DD)"),
      to: tool.schema.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: tool.schema.number().optional().describe("Max results (default: 20)"),
    },
    execute: async (args) => {
      if (!deps.decisionStore) {
        return JSON.stringify({ results: [], total: 0, message: "Decision store not available" })
      }

      const source = args.query
        ? await deps.decisionStore.search(args.query)
        : await deps.decisionStore.list()

      const personNeedle = args.person?.toLowerCase()
      const topicNeedle = args.topic?.toLowerCase()

      const filtered = source
        .filter((record) => {
          if (!personNeedle) return true
          return record.participants.some((participant) => participant.toLowerCase().includes(personNeedle))
        })
        .filter((record) => {
          if (!topicNeedle) return true
          return [record.title, record.context, record.decision, record.reasoning]
            .join("\n")
            .toLowerCase()
            .includes(topicNeedle)
        })
        .filter((record) => {
          const date = record.timestamp.slice(0, 10)
          if (args.from && date < args.from) return false
          if (args.to && date > args.to) return false
          return true
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

      const limit = args.limit ?? 20
      const results = filtered.slice(0, limit).map((record) => ({
        decision_id: record.id,
        title: record.title,
        decision: record.decision,
        reasoning: record.reasoning,
        confidence: record.confidence,
        participants: record.participants,
        timestamp: record.timestamp,
        vault_path: record.vault_path,
      }))

      return JSON.stringify({ results, total: filtered.length })
    },
  })

  return {
    brain_log_decision,
    brain_decision_history,
  }
}
