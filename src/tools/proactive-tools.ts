import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { MorningBriefGenerator } from "../brain/proactive/morning-brief"
import type { ProactiveEngine } from "../brain/proactive/types"

interface ProactiveToolDeps {
  proactiveEngine: ProactiveEngine | null
  morningBriefGenerator: MorningBriefGenerator | null
}

export function createProactiveTools(deps: ProactiveToolDeps): Record<string, ToolDefinition> {
  const brain_proactive_check: ToolDefinition = tool({
    description: "Check for proactive insights and notifications from the brain memory system. Call this at the beginning of conversations to receive context-aware nudges.",
    args: {
      session_id: tool.schema.string().describe("Current session ID"),
      current_hour: tool.schema.number().min(0).max(23).describe("Current hour (0-23)"),
    },
    execute: async (args) => {
      if (!deps.proactiveEngine) {
        return JSON.stringify({ has_message: false, reason: "proactive_disabled" })
      }

      const result = await deps.proactiveEngine.evaluate(args.session_id, args.current_hour)
      if (!result) {
        return JSON.stringify({ has_message: false, reason: "no_triggers" })
      }

      return JSON.stringify({
        has_message: true,
        message: result.message,
        why_now: result.why_now,
        score: result.score,
        trigger_type: `${result.trigger.type}/${result.trigger.subtype}`,
      })
    },
  })

  const brain_morning_brief: ToolDefinition = tool({
    description: "Generate a comprehensive morning briefing with yesterday's summary, overdue commitments, and pending decisions.",
    args: {},
    execute: async () => {
      if (!deps.morningBriefGenerator) {
        return JSON.stringify({ success: false, reason: "morning_brief_disabled" })
      }

      const result = await deps.morningBriefGenerator.generate()
      if (!result) {
        return JSON.stringify({ success: false, reason: "no_yesterday_data" })
      }

      return JSON.stringify({ success: true, brief: result })
    },
  })

  const brain_proactive_feedback: ToolDefinition = tool({
    description: "Record user feedback on a proactive message to improve future suggestions.",
    args: {
      trigger_type: tool.schema.enum(["time", "context", "pattern"]).describe("Type of the trigger"),
      trigger_subtype: tool.schema.string().describe("Subtype of the trigger"),
      reaction: tool.schema.enum(["engaged", "ignored", "dismissed"]).describe("User reaction to the proactive message"),
      session_id: tool.schema.string().describe("Current session ID"),
    },
    execute: async (args) => {
      if (!deps.proactiveEngine) {
        return JSON.stringify({ success: false, reason: "proactive_disabled" })
      }

      await deps.proactiveEngine.recordReaction({
        trigger_type: args.trigger_type,
        trigger_subtype: args.trigger_subtype,
        user_reaction: args.reaction,
        timestamp: new Date().toISOString(),
        session_id: args.session_id,
      })

      return JSON.stringify({ success: true, recorded: true })
    },
  })

  return {
    brain_proactive_check,
    brain_morning_brief,
    brain_proactive_feedback,
  }
}
