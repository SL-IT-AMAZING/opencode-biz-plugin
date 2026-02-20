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

export type AkashicSource = "thalamus" | "cortex" | "consolidator" | "user"

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
  }
  session_id?: string
  content_hash?: string   // SHA-256
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
}

export interface DailyMemory {
  date: string
  summary: string
  key_decisions: Array<{ decision: string; context: string }>
  files_changed: Array<{ path: string; summary: string }>
  topics: string[]
  open_questions: string[]
  continuation_notes: string
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
