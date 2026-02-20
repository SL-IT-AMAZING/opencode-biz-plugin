import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"
import type { BrainToolDeps } from "./types"
import { BRAIN_LOG_MEETING_DESCRIPTION } from "./constants"
import { createMeetingTemplate } from "../brain/vault/templates"
import { createProvenance } from "../shared/provenance"
import type { Commitment, PersonRecord } from "../brain/types"

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

function toVaultRelativePath(absolutePath: string, vaultPath: string): string {
  if (!absolutePath.startsWith(vaultPath)) return absolutePath
  return absolutePath.slice(vaultPath.length + 1)
}

function createDeterministicEventId(title: string, date: string, participants: string[]): string {
  const peopleKey = participants.map(p => p.trim().toLowerCase()).sort().join("-")
  const compactPeople = peopleKey.replace(/[^a-z0-9-]/g, "")
  return `meeting-${date}-${toSlug(title)}-${compactPeople}`
}

function fillMeetingTemplate(
  title: string,
  participants: string[],
  date: string,
  notes: string,
  decisions: string[],
  actionItems: Array<{ task: string; assignee: string; due_date?: string }>,
): string {
  const notesContent = notes.trim().length > 0 ? notes.trim() : "(No notes provided)"
  const decisionsContent = decisions.length > 0 ? decisions.map(d => `- ${d}`).join("\n") : "- None recorded"
  const actionItemsContent =
    actionItems.length > 0
      ? actionItems
          .map(item => `- [ ] ${item.task} — ${item.assignee}${item.due_date ? ` (due: ${item.due_date})` : ""}`)
          .join("\n")
      : "- None"

  const template = createMeetingTemplate(title, participants, date)
  const marker = "## Notes\n\n\n## Decisions\n\n\n## Action Items\n\n"
  const replacement = `## Notes\n\n${notesContent}\n\n## Decisions\n\n${decisionsContent}\n\n## Action Items\n\n${actionItemsContent}\n`
  if (template.includes(marker)) {
    return template.replace(marker, replacement)
  }
  return `${template}\n${replacement}`
}

export function createMeetingTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  const brain_log_meeting: ToolDefinition = tool({
    description: BRAIN_LOG_MEETING_DESCRIPTION,
    args: {
      title: tool.schema.string().min(1).describe("Meeting title"),
      participants: tool.schema.array(tool.schema.string()).min(1).describe("List of participant names"),
      notes: tool.schema.string().describe("Meeting notes and discussion content"),
      decisions: tool.schema.array(tool.schema.string()).optional().describe("Key decisions made"),
      action_items: tool.schema
        .array(
          tool.schema.object({
            task: tool.schema.string(),
            assignee: tool.schema.string(),
            due_date: tool.schema.string().optional(),
          }),
        )
        .optional()
        .describe("Action items with assignees"),
    },
    execute: async (args) => {
      try {
        const now = new Date().toISOString()
        const date = new Date().toISOString().split("T")[0]
        const title = args.title.trim()
        const participants = args.participants.map(p => p.trim()).filter(p => p.length > 0)
        if (participants.length === 0) {
          return JSON.stringify({
            success: false,
            error: "At least one participant is required",
            code: "VALIDATION_ERROR",
          })
        }

        const decisions = (args.decisions ?? []).map(d => d.trim()).filter(Boolean)
        const actionItems = (args.action_items ?? [])
          .map(item => ({
            task: item.task.trim(),
            assignee: item.assignee.trim(),
            due_date: item.due_date,
          }))
          .filter(item => item.task.length > 0 && item.assignee.length > 0)

        const vaultPath = join(deps.paths.ceoMeetings, `${date}-${title.toLowerCase().replace(/\s+/g, "-")}.md`)
        const vaultPathRelative = toVaultRelativePath(vaultPath, deps.paths.vault)
        const eventId = createDeterministicEventId(title, date, participants)
        const existed = await Bun.file(vaultPath).exists()
        const markdownContent = fillMeetingTemplate(title, participants, date, args.notes, decisions, actionItems)

        await mkdir(deps.paths.ceoMeetings, { recursive: true })
        await Bun.write(vaultPath, markdownContent)

        if (deps.personStore) {
          for (const participant of participants) {
            const existing = await deps.personStore.findByName(participant)
            const exact = existing.find(person => person.name.toLowerCase() === participant.toLowerCase())
            if (exact) {
              await deps.personStore.update(exact.id, {
                last_seen: now,
                interaction_count: exact.interaction_count + 1,
              })
              continue
            }
            const personRecord: PersonRecord = {
              id: crypto.randomUUID(),
              name: participant,
              aliases: [],
              relationship: "other",
              first_seen: now,
              last_seen: now,
              interaction_count: 1,
              key_topics: [],
              notes: `Auto-created from meeting: ${title}`,
              vault_path: `_brain/ceo/people/${toSlug(participant)}.md`,
              schema_version: 1,
            }
            await deps.personStore.add(personRecord)
          }
        }

        if (deps.akashicLogger) {
          await deps.akashicLogger.log({
            type: "meeting.recorded",
            source: "ceo",
            priority: 75,
            data: {
              title,
              participants,
              vault_path: vaultPathRelative,
              metadata: {
                decisions_count: decisions.length,
                action_items_count: actionItems.length,
              },
            },
            provenance: createProvenance({
              source_type: "meeting",
              source_id: eventId,
              confidence: 1,
              created_by: "user",
            }),
          })
        }

        if (deps.commitmentStore && actionItems.length > 0) {
          const existingCommitments = await deps.commitmentStore.list()
          for (const actionItem of actionItems) {
            const duplicate = existingCommitments.find(commitment => {
              return (
                commitment.source_event_id === eventId &&
                commitment.description === actionItem.task &&
                commitment.assigned_to.toLowerCase() === actionItem.assignee.toLowerCase()
              )
            })

            if (duplicate) continue

            const commitment: Commitment = {
              id: crypto.randomUUID(),
              created_at: now,
              description: actionItem.task,
              assigned_to: actionItem.assignee,
              due_date: actionItem.due_date,
              source_event_id: eventId,
              status: "pending",
              vault_path: vaultPathRelative,
              schema_version: 1,
            }
            await deps.commitmentStore.add(commitment)
          }
        }

        const summary = `Meeting ${existed ? "updated" : "logged"} with ${participants.length} participants, ${decisions.length} decisions, ${actionItems.length} action items`
        return JSON.stringify({
          success: true,
          vault_path: vaultPathRelative,
          event_id: eventId,
          summary,
        })
      } catch (error) {
        const err = error as NodeJS.ErrnoException
        const message = error instanceof Error ? error.message : String(error)
        const code = err.code === "ENOENT" ? "VAULT_NOT_FOUND" : "INTERNAL_ERROR"
        return JSON.stringify({
          success: false,
          error: message,
          code,
        })
      }
    },
  })

  return {
    brain_log_meeting,
  }
}
