import type { AgentPromptSection, EvidencePack } from "../types"

function summarizeEvidence(evidence: EvidencePack): string {
  const decisions = evidence.related_decisions
    .slice(0, 4)
    .map((d) => `- [결정:${d.id}] ${d.title} | 상태:${d.status} | 확신:${d.confidence} | 요지:${d.decision}`)
    .join("\n")

  const commitments = evidence.related_commitments
    .slice(0, 4)
    .map((c) => `- [약속:${c.id}] ${c.description} | 담당:${c.assigned_to} | 상태:${c.status}${c.due_date ? ` | 마감:${c.due_date}` : ""}`)
    .join("\n")

  const events = evidence.recent_events
    .slice(0, 5)
    .map((e) => `- [이벤트:${e.id}] ${e.timestamp} | ${e.type} | 우선순위:${e.priority} | ${e.summary}`)
    .join("\n")

  const vault = evidence.vault_content
    .slice(0, 3)
    .map((v) => `- [문서] ${v.path} | 관련도:${v.relevance_score.toFixed(2)} | 인용:"${v.original_quote.slice(0, 180)}"`)
    .join("\n")

  return [
    `질문: ${evidence.question}`,
    `맥락: ${evidence.context || "(제공된 맥락 없음)"}`,
    `수집시각: ${evidence.gathered_at}`,
    `메타: 총 ${evidence.metadata.total_items}건, 검색쿼리 ${evidence.metadata.search_queries.length}개, 범위 ${evidence.metadata.time_range.from} ~ ${evidence.metadata.time_range.to}`,
    "",
    "관련 의사결정:",
    decisions || "- 없음",
    "",
    "관련 커밋먼트:",
    commitments || "- 없음",
    "",
    "최근 이벤트:",
    events || "- 없음",
    "",
    "지식 저장소 근거:",
    vault || "- 없음",
  ].join("\n")
}

export function buildResearcherPrompt(evidence: EvidencePack): AgentPromptSection {
  return {
    role: "researcher",
    role_label: "Researcher",
    system_instruction: [
      "당신은 객관적 조사관(Researcher)이다.",
      "목표는 찬반 결론을 내리는 것이 아니라, 의사결정에 필요한 사실을 편향 없이 정리하는 것이다.",
      "아래 근거 데이터만 사용해 사실, 맥락, 데이터 공백을 보고하라.",
      "의사결정/이벤트/약속은 가능한 한 ID와 함께 명시하라.",
      "\n=== Evidence Snapshot ===\n",
      summarizeEvidence(evidence),
    ].join("\n"),
    constraints: [
      "찬성/반대 입장을 취하지 말 것",
      "증거가 약하면 '불충분'으로 명확히 표기할 것",
      "추측, 미확인 가정, 과장 금지",
      "근거 항목(ID/경로/타임스탬프) 없이 단정 금지",
      "데이터 공백을 최소 3개 이상 식별할 것",
    ],
    output_format: [
      "## 사실 정리",
      "- 핵심 사실 (5~10개, 각 항목에 출처 ID 포함)",
      "",
      "## 관련 패턴",
      "- 반복된 성공/실패 신호",
      "- 사람/이해관계 연결 신호",
      "",
      "## 데이터 공백",
      "- 공백 항목",
      "- 왜 중요한지",
      "- 어떤 추가 증거가 필요한지",
      "",
      "## 중립 요약",
      "- 현재 시점에서 확실한 것 / 불확실한 것",
    ].join("\n"),
  }
}
