export const BRAIN_SEARCH_DESCRIPTION =
  "Search brain memories and vault content using hybrid search (full-text + semantic). Returns relevant chunks ranked by combined relevance with diversity."

export const BRAIN_GET_DESCRIPTION =
  "Retrieve a specific memory: soul (identity/preferences), working (current session), daily (date summary), or file (vault content)."

export const BRAIN_WRITE_DESCRIPTION =
  "Write to brain memory. Types: 'working' updates session context, 'scratch' adds temporary notes, 'decision' records a decision with reasoning."

export const BRAIN_RECALL_DESCRIPTION =
  "Recall past events from the Akashic Record. Filter by date range, event types, or free-text query."

export const BRAIN_CONSOLIDATE_DESCRIPTION =
  "Trigger memory consolidation. 'working' saves current session state, 'daily' summarizes today, 'full' runs complete consolidation cycle."

export const MEMORY_TYPES = ["soul", "working", "daily", "file"] as const
export const WRITE_TYPES = ["working", "scratch", "decision"] as const
export const CONSOLIDATE_SCOPES = ["working", "daily", "full"] as const
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const
