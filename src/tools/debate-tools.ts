import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { BrainToolDeps } from "./types"
import { BRAIN_DEBATE_DESCRIPTION, BRAIN_REVIEW_DECISION_DESCRIPTION } from "./constants"
import { assembleEvidencePack, buildDebatePrompt } from "../brain/decision/orchestrator"
import type { EvidencePackDeps } from "../brain/decision/types"

function buildEvidencePackDeps(deps: BrainToolDeps): EvidencePackDeps {
  return {
    decisionStore: deps.decisionStore,
    commitmentStore: deps.commitmentStore,
    personStore: deps.personStore,
    akashicReader: deps.akashicReader,
    hybridSearcher: deps.hybridSearcher,
    fts: deps.fts,
    entityIndex: deps.entityIndex,
  }
}

export function createDebateTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  const brain_debate: ToolDefinition = tool({
    description: BRAIN_DEBATE_DESCRIPTION,
    args: {
      question: tool.schema.string().min(1).describe("The decision question to analyze"),
      context: tool.schema.string().optional().describe("Additional context for the decision"),
      participants: tool.schema.array(tool.schema.string()).optional().describe("Names of people involved"),
      time_range_days: tool.schema.number().min(1).max(365).optional().describe("Days of history to search (default: 30)"),
      max_evidence: tool.schema.number().min(1).max(50).optional().describe("Max evidence items per category (default: 10)"),
    },
    execute: async (args) => {
      try {
        const evidencePackDeps = buildEvidencePackDeps(deps)
        const evidence = await assembleEvidencePack(
          args.question,
          args.context ?? "",
          evidencePackDeps,
          {
            time_range_days: args.time_range_days,
            max_evidence_items: args.max_evidence,
            participants: args.participants,
          },
        )

        const structuredPrompt = buildDebatePrompt(evidence)
        const debateId = crypto.randomUUID()

        if (deps.akashicLogger) {
          await deps.akashicLogger.log({
            type: "debate.initiated",
            source: "ceo",
            priority: 80,
            data: {
              title: `Debate: ${args.question.slice(0, 100)}`,
              decision: "debate_initiated",
              reasoning: `Evidence pack assembled: ${evidence.metadata.total_items} items`,
              confidence: "medium",
              vault_path: `debate-${debateId}`,
            },
          })
        }

        return JSON.stringify({
          success: true,
          debate_id: debateId,
          evidence_summary: {
            decisions: evidence.related_decisions.length,
            commitments: evidence.related_commitments.length,
            people: evidence.involved_people.length,
            events: evidence.recent_events.length,
            vault_items: evidence.vault_content.length,
            entity_connections: evidence.entity_connections.length,
            total: evidence.metadata.total_items,
            gathering_ms: evidence.metadata.gathering_duration_ms,
          },
          structured_prompt: structuredPrompt,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })

  const brain_review_decision: ToolDefinition = tool({
    description: BRAIN_REVIEW_DECISION_DESCRIPTION,
    args: {
      decision_id: tool.schema.string().min(1).describe("ID of the decision to review"),
      include_outcomes: tool.schema.boolean().optional().describe("Include recorded outcomes (default: true)"),
    },
    execute: async (args) => {
      if (!deps.decisionStore) {
        return JSON.stringify({ success: false, error: "Decision store not available" })
      }

      try {
        const decision = await deps.decisionStore.get(args.decision_id)
        if (!decision) {
          return JSON.stringify({ success: false, error: `Decision not found: ${args.decision_id}` })
        }

        const includeOutcomes = args.include_outcomes !== false
        const outcomes = includeOutcomes ? (decision.outcomes ?? []) : []

        const hasPositive = outcomes.some((o) => o.assessment === "positive")
        const hasNegative = outcomes.some((o) => o.assessment === "negative")

        const outcomesSummary =
          outcomes.length > 0
            ? outcomes.map((o) => `- ${o.date}: ${o.description} (${o.assessment})`).join("\n")
            : "아직 기록된 결과가 없습니다."

        const reviewPrompt = [
          "# 의사결정 회고 분석",
          "",
          `**결정 제목**: ${decision.title}`,
          `**결정일**: ${decision.timestamp}`,
          `**상태**: ${decision.status}`,
          `**확신도**: ${decision.confidence}`,
          "",
          "## 원래 결정",
          decision.decision,
          "",
          "## 결정 근거",
          decision.reasoning,
          "",
          "## 고려된 대안",
          decision.alternatives_considered.length > 0
            ? decision.alternatives_considered.map((a) => `- ${a}`).join("\n")
            : "- 없음",
          "",
          "## 참여자",
          decision.participants.length > 0
            ? decision.participants.map((p) => `- ${p}`).join("\n")
            : "- 없음",
          "",
          "## 기록된 결과",
          outcomesSummary,
          "",
          "---",
          "",
          "## 회고 분석 요청",
          "위 결정과 결과를 바탕으로 다음을 분석하세요:",
          "",
          "### 1. 결정 품질 평가",
          "- 당시 정보 기준으로 합리적이었는가?",
          "- 누락된 고려사항은?",
          "",
          "### 2. 결과 분석",
          hasPositive && hasNegative
            ? "- 긍정적/부정적 결과가 모두 존재합니다. 각각의 원인을 분석하세요."
            : hasNegative
              ? "- 부정적 결과가 있습니다. 무엇이 잘못되었는지 분석하세요."
              : hasPositive
                ? "- 긍정적 결과가 있습니다. 성공 요인을 분석하세요."
                : "- 아직 결과가 없습니다. 예상되는 결과와 모니터링 포인트를 제안하세요.",
          "",
          "### 3. 교훈",
          "- 향후 유사한 결정에 적용할 수 있는 교훈은?",
          "- 의사결정 프로세스 개선점은?",
          "",
          "### 4. 후속 조치",
          "- 추가로 필요한 행동은?",
          "- 다음 체크포인트 제안",
        ].join("\n")

        if (deps.akashicLogger) {
          await deps.akashicLogger.log({
            type: "decision.reviewed",
            source: "ceo",
            priority: 60,
            data: {
              title: decision.title,
              decision: args.decision_id,
              description: `Review with ${outcomes.length} outcomes`,
            },
          })
        }

        return JSON.stringify({
          success: true,
          decision_id: decision.id,
          title: decision.title,
          status: decision.status,
          outcomes_count: outcomes.length,
          review_prompt: reviewPrompt,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })

  return {
    brain_debate,
    brain_review_decision,
  }
}
