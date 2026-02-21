import type { AgentPromptSection, EvidencePack } from "../types"

function summarizeEvidence(evidence: EvidencePack): string {
  const people = evidence.involved_people
    .slice(0, 5)
    .map((p) => `- [인물] ${p.name} | 관계:${p.relationship}${p.role ? ` | 역할:${p.role}` : ""} | 최근:${p.last_seen}`)
    .join("\n")

  const connections = evidence.entity_connections
    .slice(0, 4)
    .map((c) => {
      const top = c.related_entities
        .slice(0, 3)
        .map((r) => `${r.name}(${r.type},강도:${r.strength.toFixed(2)})`)
        .join(", ")
      return `- [연결] ${c.entity_name}(${c.entity_type}) -> ${top || "연결없음"}`
    })
    .join("\n")

  const events = evidence.recent_events
    .slice(0, 5)
    .map((e) => `- [이벤트:${e.id}] ${e.timestamp} | 우선순위:${e.priority} | ${e.summary}`)
    .join("\n")

  return [
    `질문: ${evidence.question}`,
    `맥락: ${evidence.context || "(제공된 맥락 없음)"}`,
    `수집 범위: ${evidence.metadata.time_range.from} ~ ${evidence.metadata.time_range.to}`,
    "",
    "관계자 관점:",
    people || "- 없음",
    "",
    "엔티티 연결망:",
    connections || "- 없음",
    "",
    "최근 신호:",
    events || "- 없음",
  ].join("\n")
}

export function buildDevilsAdvocatePrompt(evidence: EvidencePack): AgentPromptSection {
  return {
    role: "devils_advocate",
    role_label: "Devil's Advocate",
    system_instruction: [
      "당신은 최종 검증자(Devil's Advocate)다.",
      "입력으로 Synthesizer의 통합 결론이 주어진다.",
      "당신의 임무는 맹점, 편향, 논리적 비약, 누락된 이해관계자 관점을 찾아 결론을 강하게 검증하는 것이다.",
      "과도한 낙관/비관 모두를 경계하고, 결론이 견디지 못할 반례를 제시하라.",
      "\n=== Evidence Snapshot ===\n",
      summarizeEvidence(evidence),
      "\n=== Prior Agent Outputs (runtime input) ===\n",
      "- Researcher 출력",
      "- Advocate 출력",
      "- Critic 출력",
      "- Synthesizer 출력",
    ].join("\n"),
    constraints: [
      "Synthesizer 결론을 기본적으로 의심하고 검증할 것",
      "최소 3개의 블라인드 스팟 또는 논리 결함을 제시할 것",
      "누락된 이해관계자/시간지평/2차 효과를 반드시 점검할 것",
      "근거 없는 파괴적 비판 금지, 반드시 출처 연결",
      "비판 후에는 결론 강화를 위한 수정 제안 포함",
    ],
    output_format: [
      "## 블라인드 스팟 점검",
      "- 누락된 관점",
      "- 왜 중요한지",
      "",
      "## 논리 오류/편향 탐지",
      "- 발견된 오류 또는 편향",
      "- 해당 문장/주장 출처",
      "",
      "## 반례 시나리오",
      "- 결론이 실패하는 조건",
      "- 조기 경보 지표",
      "",
      "## 수정 권고",
      "- 결론을 더 견고하게 만드는 수정안",
    ].join("\n"),
  }
}
