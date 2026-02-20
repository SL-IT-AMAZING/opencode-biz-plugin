import type { PluginInput } from "@opencode-ai/plugin"
import type { MicroConsolidator } from "../brain/consolidation/types"
import type { Heartbeat } from "../brain/heartbeat/types"
import { log } from "../shared/logger"

interface CompactingInput {
  sessionID: string
}

interface CompactingOutput {
  context: string[]
  prompt?: string
}

interface SystemTransformInput {
  sessionID?: string
  model: unknown
}

interface SystemTransformOutput {
  system: string[]
}

interface EventInput {
  event: {
    type: string
    properties?: unknown
  }
}

interface BrainHookDeps {
  microConsolidator: MicroConsolidator | null
  heartbeat: Heartbeat | null
}

const HEARTBEAT_MARKER = "<!-- brain-heartbeat:v1 -->"

export function createBrainHook(ctx: PluginInput, deps: BrainHookDeps) {
  return {
    "experimental.chat.system.transform": async (
      input: SystemTransformInput,
      output: SystemTransformOutput,
    ): Promise<void> => {
      if (!deps.heartbeat || !input.sessionID) return

      const alreadyInjected = output.system.some(s => s.includes(HEARTBEAT_MARKER))
      if (alreadyInjected) return

      try {
        const sections = await deps.heartbeat.getSystemContext(input.sessionID)
        if (sections.length > 0) {
          output.system.push(`${HEARTBEAT_MARKER}\n${sections.join("\n")}`)
        }
      } catch (err) {
        log("[brain-hook] heartbeat error", { error: err instanceof Error ? err.message : String(err) })
      }
    },

    "experimental.session.compacting": async (
      input: CompactingInput,
      output: CompactingOutput,
    ): Promise<void> => {
      log("[brain-hook] compaction triggered", { sessionID: input.sessionID })

      const sections: string[] = ["<brain-memory-state>"]
      sections.push("## Brain Memory System")
      sections.push("")
      sections.push("The brain memory system is active. During compaction:")
      sections.push("- Working memory entries from this session should be preserved in the summary")
      sections.push("- Soul memory (identity/preferences) persists on disk and does not need compaction")
      sections.push("- Use `brain_search` to retrieve relevant context after compaction")
      sections.push("- Use `brain_get` with type 'soul' to reload identity context")
      sections.push("- Use `brain_recall` to access historical events from the Akashic Record")
      sections.push("")
      sections.push("</brain-memory-state>")

      output.context.push(sections.join("\n"))

      if (deps.microConsolidator) {
        try {
          const result = await deps.microConsolidator.consolidate()
          sections.splice(sections.length - 1, 0, `Last consolidated: ${result.timestamp} (${result.eventsProcessed} events)`)
        } catch {}
      }

      if (deps.heartbeat) {
        deps.heartbeat.invalidateSession(input.sessionID)
      }
    },

    event: async ({ event }: EventInput): Promise<void> => {
      if (event.type === "session.created") {
        const props = event.properties as Record<string, unknown> | undefined
        const sessionInfo = props?.info as { id?: string } | undefined
        if (sessionInfo?.id) {
          log("[brain-hook] session created", { sessionID: sessionInfo.id })
        }
      }
    },
  }
}
