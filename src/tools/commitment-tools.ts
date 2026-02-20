import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { BrainToolDeps } from "./types"
import { BRAIN_TRACK_COMMITMENT_DESCRIPTION, BRAIN_CHECK_COMMITMENTS_DESCRIPTION, COMMITMENT_STATUSES } from "./constants"
import type { Commitment } from "../brain/types"

function isOverdue(commitment: Commitment, nowIso: string): boolean {
  return Boolean(
    commitment.due_date
      && commitment.due_date < nowIso
      && (commitment.status === "pending" || commitment.status === "in_progress"),
  )
}

export function createCommitmentTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  const brain_track_commitment: ToolDefinition = tool({
    description: BRAIN_TRACK_COMMITMENT_DESCRIPTION,
    args: {
      description: tool.schema.string().min(1).describe("What was committed to"),
      assigned_to: tool.schema.string().min(1).describe("Person responsible"),
      due_date: tool.schema.string().optional().describe("Due date (YYYY-MM-DD)"),
      source_event_id: tool.schema.string().optional().describe("Source meeting/event ID"),
    },
    execute: async (args) => {
      if (!deps.commitmentStore) {
        return JSON.stringify({ success: false, error: "Commitment store not available", code: "INDEX_UNAVAILABLE" })
      }

      const commitment: Commitment = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        description: args.description,
        assigned_to: args.assigned_to,
        due_date: args.due_date,
        source_event_id: args.source_event_id ?? "",
        status: "pending",
        schema_version: 1,
      }

      await deps.commitmentStore.add(commitment)

      if (deps.akashicLogger) {
        await deps.akashicLogger.log({
          type: "commitment.created",
          source: "ceo",
          priority: 50,
          data: {
            description: args.description,
            assigned_to: args.assigned_to,
            due_date: args.due_date,
          },
        })
      }

      return JSON.stringify({ success: true, commitment_id: commitment.id, status: "pending" })
    },
  })

  const brain_check_commitments: ToolDefinition = tool({
    description: BRAIN_CHECK_COMMITMENTS_DESCRIPTION,
    args: {
      status: tool.schema.enum(COMMITMENT_STATUSES).optional().describe("Filter by status"),
      person: tool.schema.string().optional().describe("Filter by assigned person"),
      overdue_only: tool.schema.boolean().optional().describe("Show only overdue items (default: false)"),
      limit: tool.schema.number().optional().describe("Max results (default: 50)"),
    },
    execute: async (args) => {
      if (!deps.commitmentStore) {
        return JSON.stringify({
          results: [],
          summary: { pending: 0, overdue: 0, done: 0 },
          message: "Commitment store not available",
        })
      }

      const allCommitments = await deps.commitmentStore.list()

      let commitments: Commitment[]
      if (args.overdue_only) {
        commitments = await deps.commitmentStore.listOverdue()
      } else if (args.status) {
        commitments = await deps.commitmentStore.listByStatus(args.status)
      } else {
        commitments = [...allCommitments]
      }

      if (args.person) {
        const person = args.person.toLowerCase()
        commitments = commitments.filter(c => c.assigned_to.toLowerCase().includes(person))
      }

      const limit = args.limit ?? 50
      const limited = commitments.slice(0, limit)
      const nowIso = new Date().toISOString()

      const results = limited.map(c => ({
        id: c.id,
        description: c.description,
        assigned_to: c.assigned_to,
        due_date: c.due_date,
        status: c.status,
        created_at: c.created_at,
      }))

      const summary = {
        pending: allCommitments.filter(c => c.status === "pending").length,
        overdue: allCommitments.filter(c => isOverdue(c, nowIso)).length,
        done: allCommitments.filter(c => c.status === "done").length,
      }

      return JSON.stringify({ results, summary })
    },
  })

  return {
    brain_track_commitment,
    brain_check_commitments,
  }
}
