import { describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { createBrainHook } from "./index"
import type { BudgetState, ProactiveMessage } from "../brain/proactive/types"

const mockCtx = {
  client: {} as PluginInput["client"],
  project: {} as PluginInput["project"],
  worktree: "/tmp",
  directory: "/tmp",
  serverUrl: new URL("http://localhost"),
  $: Bun.$,
} satisfies PluginInput

const heartbeatMarker = "<!-- brain-heartbeat:v1 -->"

describe("hooks/createBrainHook coexistence", () => {
  test("#given existing heartbeat marker #when system transform runs #then proactive section is still appended", async () => {
    const hook = createBrainHook(mockCtx, {
      microConsolidator: null,
      heartbeat: {
        async getSystemContext() {
          return ["unused"]
        },
        invalidateSession() {},
      },
      proactiveEngine: {
        async evaluate() {
          return {
            trigger: { type: "time", subtype: "morning_brief" },
            message: "proactive-message",
            why_now: "reason",
            score: 0.8,
            timestamp: new Date().toISOString(),
          } satisfies ProactiveMessage
        },
        async recordReaction() {},
        getBudgetState() {
          return {
            date: "2026-01-01",
            messages_sent: 0,
            last_message_at: null,
          } satisfies BudgetState
        },
        resetBudget() {},
      },
      deliveryManager: {
        formatMessage(trigger, messageDraft, score) {
          return {
            trigger,
            message: messageDraft,
            why_now: "why",
            score,
            timestamp: new Date().toISOString(),
          }
        },
        formatSystemPromptSection(message) {
          return `<brain-proactive>${message.message}</brain-proactive>`
        },
        getBudgetState() {
          return {
            date: "2026-01-01",
            messages_sent: 0,
            last_message_at: null,
          }
        },
        recordDelivery() {},
        resetBudget() {},
        isDayChanged() {
          return false
        },
      },
    })

    const output = { system: [`${heartbeatMarker}\nexisting`] }

    await hook["experimental.chat.system.transform"](
      { sessionID: "s1", model: "x" },
      output,
    )

    expect(output.system.length).toBe(2)
    expect(output.system[0]).toContain(heartbeatMarker)
    expect(output.system[1]).toContain("<brain-proactive>")
    expect(output.system[1]).toContain("proactive-message")
  })

  test("#given no heartbeat marker #when system transform runs #then heartbeat marker is injected once", async () => {
    const hook = createBrainHook(mockCtx, {
      microConsolidator: null,
      heartbeat: {
        async getSystemContext() {
          return ["line-a", "line-b"]
        },
        invalidateSession() {},
      },
      proactiveEngine: null,
      deliveryManager: null,
    })

    const output = { system: [] as string[] }

    await hook["experimental.chat.system.transform"](
      { sessionID: "s1", model: "x" },
      output,
    )

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain(heartbeatMarker)
    expect(output.system[0]).toContain("line-a")
    expect(output.system[0]).toContain("line-b")
  })
})
