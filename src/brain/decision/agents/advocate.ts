import type { AgentPromptSection, EvidencePack } from "../types"

function summarizeEvidence(evidence: EvidencePack): string {
  const supportiveDecisions = evidence.related_decisions
    .filter((d) => d.confidence !== "low")
    .slice(0, 5)
    .map((d) => `- [결정:${d.id}] ${d.title} | 상태:${d.status} | 확신:${d.confidence} | 근거:${d.reasoning.slice(0, 180)}`)
    .join("\n")

  const activeCommitments = evidence.related_commitments
    .filter((c) => c.status !== "cancelled")
    .slice(0, 5)
    .map((c) => `- [약속:${c.id}] ${c.description} | 담당:${c.assigned_to} | 상태:${c.status}${c.due_date ? ` | 마감:${c.due_date}` : ""}`)
    .join("\n")

  const positiveSignals = evidence.related_decisions
    .flatMap((d) => (d.outcomes ?? []).map((o) => ({ decisionId: d.id, ...o })))
    .filter((o) => o.assessment === "positive")
    .slice(0, 5)
    .map((o) => `- [성과:${o.decisionId}] ${o.date} | ${o.description}`)
    .join("\n")

  const vault = evidence.vault_content
    .slice(0, 4)
    .map((v) => `- [문서] ${v.path} | 관련도:${v.relevance_score.toFixed(2)} | 인용:"${v.original_quote.slice(0, 180)}"`)
    .join("\n")

  return [
    `질문: ${evidence.question}`,
    `맥락: ${evidence.context || "(제공된 맥락 없음)"}`,
    "",
    "찬성 논리를 강화할 수 있는 결정 근거:",
    supportiveDecisions || "- 없음",
    "",
    "실행 기반 커밋먼트:",
    activeCommitments || "- 없음",
    "",
    "과거 긍정 신호:",
    positiveSignals || "- 없음",
    "",
    "보조 문서 근거:",
    vault || "- 없음",
  ].join("\n")
}

export function buildAdvocatePrompt(evidence: EvidencePack): AgentPromptSection {
  return {
    role: "advocate",
    role_label: "Advocate",
    system_instruction: [
      "당신은 강력한 찬성 측 변호인(Advocate)이다.",
      "목표는 제안된 행동에 대해 가능한 가장 강한 steelman 논증을 만드는 것이다.",
      "약한 주장 대신, 실행 가능성과 기대 효과를 뒷받침하는 고품질 근거를 우선 사용하라.",
      "반론을 숨기지 말고, 가장 강한 반론을 인정한 뒤 재반박을 제시하라.",
      "\n=== Evidence Snapshot ===\n",
      summarizeEvidence(evidence),
    ].join("\n"),
    constraints: [
      "근거 없는 낙관 금지",
      "핵심 주장마다 최소 1개 이상 출처(ID/경로) 표기",
      "Critic을 조롱하거나 약한 허수아비 반론 구성 금지",
      "불확실성은 별도 섹션에서 명시",
      "동의 유도형 문장 대신 검증 가능한 주장 사용",
    ],
    output_format: [
      "## 핵심 주장 (FOR)",
      "- 주장",
      "- 근거(출처)",
      "- 기대효과",
      "",
      "## 반론 선제 대응",
      "- 예상 반론",
      "- 재반박",
      "",
      "## 실행 경로",
      "- 1단계~3단계 실행안",
      "- 성공 지표",
      "",
      "## 불확실성",
      "- 남는 리스크와 관찰 포인트",
    ].join("\n"),
  }
}
