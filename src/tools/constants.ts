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

// === CEO Tool Descriptions ===

export const BRAIN_LOG_MEETING_DESCRIPTION =
  "Log a meeting record with participants, notes, decisions, and action items. Creates a structured meeting note in the vault and records it in the akashic log."

export const BRAIN_LOG_DECISION_DESCRIPTION =
  "Record a business decision with context, reasoning, alternatives considered, and confidence level. Creates a searchable decision record linked to relevant meetings and people."

export const BRAIN_DECISION_HISTORY_DESCRIPTION =
  "Search past business decisions by topic, person, date range, or free-text query. Returns decision records with reasoning, confidence, and relevant citations."

export const BRAIN_PEOPLE_LOOKUP_DESCRIPTION =
  "Look up people in the CEO's network by name, role, company, or relationship type. Returns contact information, interaction history, and key topics discussed."

export const BRAIN_RELATIONSHIP_MAP_DESCRIPTION =
  "Generate a relationship map centered on a specific person, showing connections, interaction frequency, and shared topics up to a specified depth."

export const BRAIN_TRACK_COMMITMENT_DESCRIPTION =
  "Track a commitment or action item with assignee and optional due date. Links to the source meeting or conversation where it originated."

export const BRAIN_CHECK_COMMITMENTS_DESCRIPTION =
  "Check status of tracked commitments. Filter by status, assignee, or show only overdue items. Returns commitments sorted by urgency."

// === CEO Enum Arrays ===

export const RELATIONSHIP_TYPES = ["team", "investor", "advisor", "partner", "customer", "other"] as const
export const DECISION_STATUSES = ["proposed", "decided", "implemented", "reversed"] as const
export const COMMITMENT_STATUSES = ["pending", "in_progress", "done", "overdue", "cancelled"] as const
export const CONVERSATION_TYPES = ["brainstorm", "decision", "review", "planning", "casual"] as const

// === Debate Tool Descriptions ===

export const BRAIN_DEBATE_DESCRIPTION =
  "Initiate a structured multi-agent debate analysis for a CEO decision. Gathers evidence from decision history, commitments, people, and vault content, then returns a structured prompt for multi-perspective analysis (Researcher, Advocate, Critic, Synthesizer, Devil's Advocate)."

export const BRAIN_REVIEW_DECISION_DESCRIPTION =
  "Review a past decision with outcome analysis. Retrieves the decision record and any recorded outcomes, then returns a structured prompt for retrospective evaluation."
