export type CeoEventType =
  | "conversation.logged"
  | "meeting.recorded"
  | "decision.made"
  | "commitment.created"
  | "commitment.completed"
  | "commitment.missed"
  | "person.mentioned"
  | "topic.discussed"
  | "insight.generated"
  | "followup.needed"

export type AkashicEventType =
  | "file.created"
  | "file.modified"
  | "file.deleted"
  | "file.renamed"
  | "session.started"
  | "session.ended"
  | "decision.detected"
  | "task.completed"
  | "memory.consolidated"
  | "search.performed"
  | "user.prompt"
  | "agent.response"
  | CeoEventType

export type AkashicSource = "thalamus" | "cortex" | "consolidator" | "user" | "ceo"

export interface Provenance {
  source_type: "conversation" | "meeting" | "document" | "manual" | "ai_generated"
  source_id: string
  confidence: number
  created_by: "user" | "ai" | "system"
  citation?: string
}

export interface EntityRef {
  type: "person" | "company" | "project" | "topic"
  name: string
  vault_path?: string
}

export interface AkashicEvent {
  id: string              // ULID (time-sortable, 26 chars)
  timestamp: string       // ISO 8601
  type: AkashicEventType
  source: AkashicSource
  priority: number        // 0-100 from scorer
  data: {
    path?: string         // Relative to vault root
    diff_summary?: string // Human-readable change summary
    content_snippet?: string // First 500 chars
    tags?: string[]
    metadata?: Record<string, unknown>
    title?: string
    participants?: string[]
    decision?: string
    reasoning?: string
    confidence?: "high" | "medium" | "low"
    description?: string
    assigned_to?: string
    due_date?: string
    topic?: string
    vault_path?: string
    entities?: EntityRef[]
  }
  session_id?: string
  content_hash?: string   // SHA-256
  provenance?: Provenance
}

export interface SoulMemory {
  identity: string
  principles: string[]
  relationships: Record<string, string>
  preferences: Record<string, unknown>
  vocabulary: Record<string, string>
  last_updated: string
}

export interface WorkingMemory {
  session_id: string
  started_at: string
  updated_at: string
  context_summary: string
  active_files: string[]
  decisions: Array<{
    timestamp: string
    decision: string
    reasoning: string
    confidence: "high" | "medium" | "low"
  }>
  scratch: string
  retrieval_log: Array<{
    query: string
    results_count: number
    timestamp: string
  }>
  active_topics?: string[]
  people_involved?: string[]
  open_commitments?: Array<{
    commitment: string
    due_date?: string
    assigned_to?: string
    status: "pending" | "in_progress" | "done" | "overdue"
  }>
  conversation_type?: "brainstorm" | "decision" | "review" | "planning" | "casual"
}

export interface DailyMemory {
  date: string
  summary: string
  key_decisions: Array<{ decision: string; context: string }>
  files_changed: Array<{ path: string; summary: string }>
  topics: string[]
  open_questions: string[]
  continuation_notes: string
  meetings?: Array<{
    title: string
    participants: string[]
    summary: string
    decisions: string[]
    action_items: string[]
    vault_path: string
  }>
  interactions?: Array<{
    type: "conversation" | "meeting" | "email" | "document"
    participants: string[]
    topic: string
    summary: string
  }>
  commitments_status?: {
    created: number
    completed: number
    overdue: number
    carried_over: string[]
  }
  mood_signal?: "productive" | "stressed" | "reflective" | "urgent"
}

export interface PersonRecord {
  id: string
  name: string
  aliases: string[]
  role?: string
  company?: string
  relationship: "team" | "investor" | "advisor" | "partner" | "customer" | "other"
  first_seen: string
  last_seen: string
  interaction_count: number
  key_topics: string[]
  notes: string
  vault_path: string
  schema_version: number
}

export interface DecisionRecord {
  id: string
  timestamp: string
  title: string
  context: string
  decision: string
  reasoning: string
  alternatives_considered: string[]
  participants: string[]
  confidence: "high" | "medium" | "low"
  status: "proposed" | "decided" | "implemented" | "reversed"
  outcomes?: Array<{
    date: string
    description: string
    assessment: "positive" | "neutral" | "negative"
  }>
  provenance: Provenance
  vault_path: string
  schema_version: number
}

export interface Commitment {
  id: string
  created_at: string
  description: string
  assigned_to: string
  due_date?: string
  source_event_id: string
  status: "pending" | "in_progress" | "done" | "overdue" | "cancelled"
  completed_at?: string
  vault_path?: string
  schema_version: number
}

export interface ArchivalMemory {
  period: string
  type: "weekly" | "monthly" | "quarterly"
  summary: string
  themes: string[]
  key_decisions: Array<{ date: string; decision: string }>
  metrics?: Record<string, number>
  source_count: number
}

export interface BrainRetrievalResult {
  memories: Array<{
    type: "soul" | "working" | "daily" | "archive" | "vault"
    content: string
    relevance: number
    source_path: string
    age_description: string
  }>
  working_summary?: string
  soul_excerpt?: string
  tokens_used: number
  tokens_budget: number
}

export interface BrainCompactionState {
  working_memory_path: string
  session_id: string
  active_files: string[]
  recent_decisions: string[]
  current_task_summary: string
  soul_hash: string
}

export interface SearchCandidate {
  id: string
  path: string
  chunk_index: number
  content: string
  fts_score: number
  vec_score: number
  temporal_score: number
  combined_score: number
}

export interface ChunkRecord {
  id: string
  path: string
  chunk_index: number
  content: string
  content_hash: string
  embedding?: Float32Array
  created_at: string
  updated_at: string
  is_evergreen: boolean
}

export interface IndexState {
  files: Record<string, {
    hash: string
    mtime: number
    chunk_count: number
    last_indexed: string
  }>
  last_full_scan: string
  schema_version: number
}
