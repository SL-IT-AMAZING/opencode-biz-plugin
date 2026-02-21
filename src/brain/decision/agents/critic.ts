import type { AgentPromptSection, EvidencePack } from "../types"

function summarizeEvidence(evidence: EvidencePack): string {
  const weakDecisions = evidence.related_decisions
    .filter((d) => d.confidence === "low" || d.status === "reversed" || d.status === "proposed")
    .slice(0, 5)
    .map((d) => `- [결정:${d.id}] ${d.title} | 상태:${d.status} | 확신:${d.confidence} | 리스크근거:${d.reasoning.slice(0, 180)}`)
    .join("\n")

  const negativeOutcomes = evidence.related_decisions
    .flatMap((d) => (d.outcomes ?? []).map((o) => ({ decisionId: d.id, ...o })))
    .filter((o) => o.assessment === "negative")
    .slice(0, 6)
    .map((o) => `- [실패:${o.decisionId}] ${o.date} | ${o.description}`)
    .join("\n")

  const riskyCommitments = evidence.related_commitments
    .filter((c) => c.status === "overdue" || c.status === "cancelled")
    .slice(0, 6)
    .map((c) => `- [약속:${c.id}] ${c.description} | 담당:${c.assigned_to} | 상태:${c.status}${c.due_date ? ` | 마감:${c.due_date}` : ""}`)
    .join("\n")

  const riskEvents = evidence.recent_events
    .filter((e) => e.priority >= 7)
    .slice(0, 6)
    .map((e) => `- [이벤트:${e.id}] ${e.timestamp} | ${e.type} | 우선순위:${e.priority} | ${e.summary}`)
    .join("\n")

  return [
    `질문: ${evidence.question}`,
    `맥락: ${evidence.context || "(제공된 맥락 없음)"}`,
    "",
    "취약 신호가 있는 의사결정:",
    weakDecisions || "- 없음",
    "",
    "과거 부정적 결과:",
    negativeOutcomes || "- 없음",
    "",
    "실행 리스크가 높은 커밋먼트:",
    riskyCommitments || "- 없음",
    "",
    "고우선순위 이벤트:",
    riskEvents || "- 없음",
  ].join("\n")
}

export function buildCriticPrompt(evidence: EvidencePack): AgentPromptSection {
  return {
    role: "critic",
    role_label: "Critic",
    system_instruction: [
      "당신은 반대 측 비평가(Critic)다.",
      "목표는 제안된 행동의 실패 가능성과 숨은 비용을 가장 강하게 드러내는 것이다.",
      "Advocate와 합의하려 하지 말고, 진짜 반대 논리를 구성하라.",
      "과거 실패 패턴, 실행 병목, 이해관계 충돌, 증거 공백을 근거로 공격하라.",
      "\n=== Evidence Snapshot ===\n",
      summarizeEvidence(evidence),
    ].join("\n"),
    constraints: [
      "Advocate 입장에 동조하거나 절충으로 시작하지 말 것",
      "최소 3개의 실질적 반대 논거를 제시할 것",
      "각 논거는 구체 근거(ID/이벤트/약속/문서)와 연결할 것",
      "과장된 공포 조장 금지, 검증 가능한 위험만 사용",
      "리스크 발생 조건과 파급 범위를 명시할 것",
    ],
    output_format: [
      "## 핵심 반대 주장 (AGAINST)",
      "- 주장",
      "- 근거(출처)",
      "- 실패 시 영향",
      "",
      "## 과거 실패/경고 신호",
      "- 반복 패턴",
      "- 이번 의사결정과의 유사점",
      "",
      "## 치명적 불확실성",
      "- 아직 모르는 것",
      "- 왜 의사결정을 보류/수정해야 하는지",
      "",
      "## 최소 안전장치",
      "- 진행한다면 반드시 필요한 방어선",
    ].join("\n"),
  }
}
