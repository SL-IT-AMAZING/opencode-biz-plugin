import type { DecisionRecord, Commitment, PersonRecord, AkashicEvent, AkashicEventType } from "../types"
import type { CitedSearchResult } from "../search/types"

// ─── Evidence Pack ───────────────────────────────────────────────

export interface EvidencePack {
  question: string
  context: string
  gathered_at: string
  related_decisions: DecisionEvidence[]
  related_commitments: CommitmentEvidence[]
  involved_people: PersonEvidence[]
  recent_events: EventEvidence[]
  vault_content: VaultEvidence[]
  entity_connections: EntityConnectionEvidence[]
  metadata: EvidenceMetadata
}

export interface DecisionEvidence {
  id: string
  title: string
  decision: string
  reasoning: string
  confidence: "high" | "medium" | "low"
  status: DecisionRecord["status"]
  timestamp: string
  participants: string[]
  outcomes?: Array<{ date: string; description: string; assessment: "positive" | "neutral" | "negative" }>
}

export interface CommitmentEvidence {
  id: string
  description: string
  assigned_to: string
  due_date?: string
  status: Commitment["status"]
  created_at: string
}

export interface PersonEvidence {
  name: string
  role?: string
  company?: string
  relationship: PersonRecord["relationship"]
  key_topics: string[]
  interaction_count: number
  last_seen: string
}

export interface EventEvidence {
  id: string
  type: string
  timestamp: string
  summary: string
  priority: number
}

export interface VaultEvidence {
  path: string
  content: string
  relevance_score: number
  source_date: string
  original_quote: string
}

export interface EntityConnectionEvidence {
  entity_name: string
  entity_type: string
  related_entities: Array<{
    name: string
    type: string
    strength: number
  }>
}

export interface EvidenceMetadata {
  total_items: number
  search_queries: string[]
  time_range: { from: string; to: string }
  gathering_duration_ms: number
}

// ─── Agent Roles & Prompts ──────────────────────────────────────

export type AgentRole = "researcher" | "advocate" | "critic" | "synthesizer" | "devils_advocate"

export interface AgentPromptSection {
  role: AgentRole
  role_label: string
  system_instruction: string
  constraints: string[]
  output_format: string
}

export type AgentPromptBuilder = (evidence: EvidencePack) => AgentPromptSection

// ─── Agent Outputs (for anti-sycophancy analysis) ──────────────

export interface AgentOutput {
  role: AgentRole
  content: string
  citations: Citation[]
  key_points: string[]
}

export interface Citation {
  id: string
  type: "decision" | "commitment" | "event" | "vault" | "person" | "external"
  quote: string
  source: string
}

// ─── Debate Result ──────────────────────────────────────────────

export interface DebateResult {
  id: string
  question: string
  context: string
  evidence_pack: EvidencePack
  structured_prompt: string
  created_at: string
}

// ─── Anti-Sycophancy ────────────────────────────────────────────

export interface AntiSycophancyConfig {
  independent_drafts: "best_effort"
  forced_disagreement: true
  steelman_requirement: true
  minority_amplification: true
  synthesizer_citation_only: true
}

export const DEFAULT_ANTI_SYCOPHANCY_CONFIG: AntiSycophancyConfig = {
  independent_drafts: "best_effort",
  forced_disagreement: true,
  steelman_requirement: true,
  minority_amplification: true,
  synthesizer_citation_only: true,
}

export interface SycophancyIndicator {
  type: "unanimous_agreement" | "missing_counterargument" | "echo_pattern" | "weak_criticism" | "no_uncertainty"
  description: string
  severity: "low" | "medium" | "high"
}

export interface SycophancyReport {
  has_unanimous_agreement: boolean
  missing_counterarguments: boolean
  agreement_patterns: string[]
  indicators: SycophancyIndicator[]
  warnings: string[]
  overall_risk: "low" | "medium" | "high"
}

// ─── Action Memo ────────────────────────────────────────────────

export interface ActionMemo {
  id: string
  created_at: string
  question: string
  recommendation: string
  confidence: "high" | "medium" | "low"
  key_arguments: {
    for: Array<{ point: string; source: string }>
    against: Array<{ point: string; source: string }>
  }
  risks: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation?: string }>
  action_items: Array<{ action: string; deadline?: string; owner?: string }>
  next_checkpoint: { date: string; criteria: string }
  sources: Array<{ id: string; type: string; quote: string }>
  devils_advocate_notes: string
  vault_path: string
}

// ─── Debate Tool Options ────────────────────────────────────────

export interface DebateOptions {
  question: string
  context?: string
  participants?: string[]
  time_range_days?: number
  max_evidence_items?: number
}

export interface ReviewOptions {
  decision_id: string
  include_outcomes?: boolean
}

// ─── Evidence Pack Dependencies ─────────────────────────────────

export interface EvidencePackDeps {
  decisionStore: { search: (query: string) => Promise<DecisionRecord[]>; list: () => Promise<DecisionRecord[]>; listByStatus: (status: DecisionRecord["status"]) => Promise<DecisionRecord[]> } | null
  commitmentStore: { list: () => Promise<Commitment[]>; listOverdue: (now?: Date) => Promise<Commitment[]>; listByStatus: (status: Commitment["status"]) => Promise<Commitment[]> } | null
  personStore: { list: () => Promise<PersonRecord[]>; findByName: (name: string) => Promise<PersonRecord[]> } | null
  akashicReader: { readRange: (from: Date, to: Date) => Promise<AkashicEvent[]>; queryByType: (type: AkashicEventType, limit?: number) => Promise<AkashicEvent[]> }
  hybridSearcher: { search: (query: string, options?: { limit?: number }) => Promise<Array<{ id: string; path: string; chunk_index: number; content: string; fts_score: number; vec_score: number; temporal_score: number; combined_score: number }>>; searchWithCitations?: (query: string, options?: { limit?: number }) => Promise<CitedSearchResult[]> } | null
  fts: { search: (query: string, limit?: number) => Array<{ id: string; path: string; chunk_index: number; content: string; fts_score: number; vec_score: number; temporal_score: number; combined_score: number }> }
  entityIndex: { findEntity: (query: string, limit?: number) => Promise<Array<{ id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number }>>; getRelated: (entityId: string, limit?: number) => Promise<Array<{ entity: { id: string; type: string; name: string; aliases: string[]; vault_path: string | null }; co_occurrence_count: number; decayed_weight: number }>> } | null
}

// ─── Action Memo Template ───────────────────────────────────────

export interface ActionMemoInput {
  question: string
  recommendation: string
  confidence: "high" | "medium" | "low"
  arguments_for: Array<{ point: string; source: string }>
  arguments_against: Array<{ point: string; source: string }>
  risks: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation?: string }>
  action_items: Array<{ action: string; deadline?: string; owner?: string }>
  next_checkpoint: { date: string; criteria: string }
  sources: Array<{ id: string; type: string; quote: string }>
  devils_advocate_notes: string
  vault_base_path: string
}
