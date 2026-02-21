import {
  buildAdvocatePrompt,
  buildCriticPrompt,
  buildDevilsAdvocatePrompt,
  buildResearcherPrompt,
  buildSynthesizerPrompt,
} from "./agents"
import { buildAntiSycophancyInstructions } from "./anti-sycophancy"
import type { AgentPromptSection, EvidencePack, EvidencePackDeps } from "./types"

const DEFAULT_TIME_RANGE_DAYS = 30
const DEFAULT_MAX_EVIDENCE_ITEMS = 10
const CEO_EVENT_TYPES = new Set([
  "decision.made",
  "meeting.recorded",
  "commitment.created",
  "commitment.completed",
  "commitment.missed",
])

function toWords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
}

function formatRoleSection(role: AgentPromptSection): string {
  const constraints = role.constraints.map((constraint, index) => `${index + 1}. ${constraint}`).join("\n")
  return [
    `### [${role.role_label}]`,
    role.system_instruction,
    `**제약**:`,
    constraints,
    `**출력 형식**:`,
    role.output_format,
  ].join("\n")
}

export async function assembleEvidencePack(
  question: string,
  context: string,
  deps: EvidencePackDeps,
  options?: {
    time_range_days?: number
    max_evidence_items?: number
    participants?: string[]
  },
): Promise<EvidencePack> {
  const startedAtMs = Date.now()
  const maxEvidenceItems = options?.max_evidence_items ?? DEFAULT_MAX_EVIDENCE_ITEMS
  const timeRangeDays = options?.time_range_days ?? DEFAULT_TIME_RANGE_DAYS
  const participants = options?.participants ?? []
  const now = new Date()
  const fromDate = new Date(now.getTime() - timeRangeDays * 24 * 60 * 60 * 1000)

  let relatedDecisions: EvidencePack["related_decisions"] = []
  let relatedCommitments: EvidencePack["related_commitments"] = []
  let involvedPeople: EvidencePack["involved_people"] = []
  let recentEvents: EvidencePack["recent_events"] = []
  let vaultContent: EvidencePack["vault_content"] = []
  let entityConnections: EvidencePack["entity_connections"] = []

  try {
    const decisions = await deps.decisionStore?.search(question)
    relatedDecisions = (decisions ?? []).slice(0, maxEvidenceItems).map((decision) => ({
      id: decision.id,
      title: decision.title,
      decision: decision.decision,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      status: decision.status,
      timestamp: decision.timestamp,
      participants: decision.participants,
      outcomes: decision.outcomes,
    }))
  } catch {
    relatedDecisions = []
  }

  try {
    const questionWords = toWords(question)
    const commitments = await deps.commitmentStore?.list()
    const keywordMatched = (commitments ?? []).filter((commitment) => {
      const description = commitment.description.toLowerCase()
      return questionWords.some((word) => description.includes(word))
    })
    const overdue = (await deps.commitmentStore?.listOverdue()) ?? []
    const merged = [...keywordMatched, ...overdue]
    const deduped = new Map<string, (typeof merged)[number]>()
    for (const commitment of merged) {
      if (!deduped.has(commitment.id)) {
        deduped.set(commitment.id, commitment)
      }
    }
    relatedCommitments = Array.from(deduped.values())
      .slice(0, maxEvidenceItems)
      .map((commitment) => ({
        id: commitment.id,
        description: commitment.description,
        assigned_to: commitment.assigned_to,
        due_date: commitment.due_date,
        status: commitment.status,
        created_at: commitment.created_at,
      }))
  } catch {
    relatedCommitments = []
  }

  try {
    const people = [] as EvidencePack["involved_people"]
    for (const participant of participants) {
      const found = await deps.personStore?.findByName(participant)
      for (const person of found ?? []) {
        people.push({
          name: person.name,
          role: person.role,
          company: person.company,
          relationship: person.relationship,
          key_topics: person.key_topics,
          interaction_count: person.interaction_count,
          last_seen: person.last_seen,
        })
      }
    }
    const dedupedByName = new Map<string, EvidencePack["involved_people"][number]>()
    for (const person of people) {
      const key = person.name.toLowerCase()
      if (!dedupedByName.has(key)) {
        dedupedByName.set(key, person)
      }
    }
    involvedPeople = Array.from(dedupedByName.values()).slice(0, maxEvidenceItems)
  } catch {
    involvedPeople = []
  }

  try {
    const events = await deps.akashicReader.readRange(fromDate, now)
    recentEvents = events
      .filter((event) => event.priority >= 30 || CEO_EVENT_TYPES.has(event.type))
      .slice(0, maxEvidenceItems)
      .map((event) => ({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        summary:
          event.data.description ??
          event.data.title ??
          event.data.decision ??
          event.data.content_snippet ??
          event.type,
        priority: event.priority,
      }))
  } catch {
    recentEvents = []
  }

  try {
    if (deps.hybridSearcher?.searchWithCitations) {
      const results = await deps.hybridSearcher.searchWithCitations(question, { limit: maxEvidenceItems })
      vaultContent = results.slice(0, maxEvidenceItems).map((result) => ({
        path: result.path,
        content: result.content,
        relevance_score: result.combined_score,
        source_date: result.provenance.source_date,
        original_quote: result.provenance.original_quote,
      }))
    } else if (deps.hybridSearcher) {
      const results = await deps.hybridSearcher.search(question, { limit: maxEvidenceItems })
      vaultContent = results.slice(0, maxEvidenceItems).map((result) => ({
        path: result.path,
        content: result.content,
        relevance_score: result.combined_score,
        source_date: "",
        original_quote: result.content.slice(0, 200),
      }))
    } else {
      const results = deps.fts.search(question, maxEvidenceItems)
      vaultContent = results.slice(0, maxEvidenceItems).map((result) => ({
        path: result.path,
        content: result.content,
        relevance_score: result.combined_score,
        source_date: "",
        original_quote: result.content.slice(0, 200),
      }))
    }
  } catch {
    vaultContent = []
  }

  try {
    const connections = [] as EvidencePack["entity_connections"]
    for (const person of involvedPeople) {
      const matchedEntities = await deps.entityIndex?.findEntity(person.name)
      const primary = matchedEntities?.[0]
      if (!primary) {
        continue
      }
      const related = await deps.entityIndex?.getRelated(primary.id)
      connections.push({
        entity_name: primary.name,
        entity_type: primary.type,
        related_entities: (related ?? []).slice(0, maxEvidenceItems).map((item) => ({
          name: item.entity.name,
          type: item.entity.type,
          strength: item.decayed_weight,
        })),
      })
    }
    entityConnections = connections.slice(0, maxEvidenceItems)
  } catch {
    entityConnections = []
  }

  const gatheringDurationMs = Date.now() - startedAtMs
  const gatheredAt = new Date().toISOString()
  const totalItems =
    relatedDecisions.length +
    relatedCommitments.length +
    involvedPeople.length +
    recentEvents.length +
    vaultContent.length +
    entityConnections.length

  return {
    question,
    context,
    gathered_at: gatheredAt,
    related_decisions: relatedDecisions,
    related_commitments: relatedCommitments,
    involved_people: involvedPeople,
    recent_events: recentEvents,
    vault_content: vaultContent,
    entity_connections: entityConnections,
    metadata: {
      total_items: totalItems,
      search_queries: [question],
      time_range: {
        from: fromDate.toISOString(),
        to: now.toISOString(),
      },
      gathering_duration_ms: gatheringDurationMs,
    },
  }
}

export function buildDebatePrompt(evidence: EvidencePack): string {
  const researcher = buildResearcherPrompt(evidence)
  const advocate = buildAdvocatePrompt(evidence)
  const critic = buildCriticPrompt(evidence)
  const synthesizer = buildSynthesizerPrompt(evidence)
  const devilsAdvocate = buildDevilsAdvocatePrompt(evidence)
  const antiSycophancyInstructions = buildAntiSycophancyInstructions()

  const actionMemoTemplate = `{
  "question": "${evidence.question}",
  "recommendation": "",
  "confidence": "high | medium | low",
  "arguments_for": [{ "point": "", "source": "" }],
  "arguments_against": [{ "point": "", "source": "" }],
  "risks": [{ "risk": "", "severity": "high | medium | low", "mitigation": "" }],
  "action_items": [{ "action": "", "deadline": "", "owner": "" }],
  "next_checkpoint": { "date": "", "criteria": "" },
  "sources": [{ "id": "", "type": "", "quote": "" }],
  "devils_advocate_notes": "",
  "vault_base_path": ""
}`

  return [
    "# 멀티에이전트 의사결정 분석",
    `**질문**: ${evidence.question}`,
    `**맥락**: ${evidence.context}`,
    `**수집 증거**: ${evidence.metadata.total_items}건`,
    "",
    "---",
    antiSycophancyInstructions,
    "---",
    "",
    "## Phase 1: 독립 분석",
    formatRoleSection(researcher),
    "",
    formatRoleSection(advocate),
    "",
    formatRoleSection(critic),
    "",
    "## Phase 2: 교차 검증 (1라운드)",
    "각 역할은 다른 역할의 출력을 검토하고 반박/보완합니다.",
    "- Researcher: Advocate와 Critic의 사실 오류 지적",
    "- Advocate: Critic의 논거에 대한 재반박",
    "- Critic: Advocate의 논거에 대한 추가 반박",
    "",
    "## Phase 3: 종합",
    formatRoleSection(synthesizer),
    "",
    "## Phase 4: 최종 검증",
    formatRoleSection(devilsAdvocate),
    "",
    "## Phase 5: 액션 메모",
    "위 분석을 바탕으로 다음 JSON 구조의 액션 메모를 작성하세요:",
    actionMemoTemplate,
  ].join("\n")
}
