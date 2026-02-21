import type { AgentPromptSection, EvidencePack } from "../types"

function summarizeEvidence(evidence: EvidencePack): string {
  const decisions = evidence.related_decisions
    .slice(0, 4)
    .map((d) => `- [결정:${d.id}] ${d.title} | ${d.status} | ${d.confidence}`)
    .join("\n")

  const commitments = evidence.related_commitments
    .slice(0, 4)
    .map((c) => `- [약속:${c.id}] ${c.description} | ${c.status}`)
    .join("\n")

  const events = evidence.recent_events
    .slice(0, 4)
    .map((e) => `- [이벤트:${e.id}] ${e.timestamp} | ${e.summary}`)
    .join("\n")

  return [
    `질문: ${evidence.question}`,
    `맥락: ${evidence.context || "(제공된 맥락 없음)"}`,
    `증거 총량: ${evidence.metadata.total_items}`,
    "",
    "대표 의사결정:",
    decisions || "- 없음",
    "",
    "대표 커밋먼트:",
    commitments || "- 없음",
    "",
    "대표 이벤트:",
    events || "- 없음",
  ].join("\n")
}

export function buildSynthesizerPrompt(evidence: EvidencePack): AgentPromptSection {
  return {
    role: "synthesizer",
    role_label: "Synthesizer",
    system_instruction: [
      "당신은 종합 조정자(Synthesizer)다.",
      "입력으로 Researcher/Advocate/Critic의 결과가 제공된다.",
      "당신의 임무는 세 관점을 비교해 합의점, 핵심 충돌, 미해결 불확실성을 구조화하는 것이다.",
      "절대 새로운 사실을 만들지 말고, 반드시 기존 에이전트 출력과 Evidence Snapshot에서 인용 가능한 내용만 사용하라.",
      "\n=== Evidence Snapshot ===\n",
      summarizeEvidence(evidence),
      "\n=== Agent Outputs (runtime input) ===\n",
      "- Researcher 출력",
      "- Advocate 출력",
      "- Critic 출력",
      "위 세 출력의 문장/근거를 직접 참조하여 통합하라.",
    ].join("\n"),
    constraints: [
      "새로운 사실, 새로운 수치, 새로운 사례 생성 금지",
      "모든 핵심 문장에 출처를 붙일 것(Researcher/Advocate/Critic 또는 Evidence ID)",
      "한쪽 의견으로 쏠리지 말고 충돌 지점을 명시할 것",
      "불확실성을 삭제하거나 약화하지 말 것",
      "권고를 제시하더라도 근거 추적 가능성을 유지할 것",
    ],
    output_format: [
      "## 합의된 사실",
      "- 공통으로 지지된 포인트 (출처)",
      "",
      "## 핵심 쟁점",
      "- Advocate vs Critic 충돌 요약 (각 출처)",
      "",
      "## 주요 불확실성",
      "- 아직 결정에 치명적인 미확정 요소",
      "- 필요한 추가 검증",
      "",
      "## 통합 판단(조건부)",
      "- 현재 기준 권고",
      "- 권고가 뒤집히는 조건",
    ].join("\n"),
  }
}
