export function createReadmeTemplate(): string {
  return `# Brain Memory System

This directory is managed by the oh-my-opencode Brain Memory System.
It stores memories, event logs, and search indices for your AI assistant.

## Structure

- \`soul.md\` — Agent identity, principles, and user preferences
- \`working/\` — Session-level working memory (scratchpads)
- \`memory/daily/\` — Daily memory summaries
- \`akashic/daily/\` — Append-only event logs (Akashic Record)
- \`index/\` — SQLite search indices (derivative, rebuildable)
- \`archive/\` — Consolidated weekly/monthly/quarterly summaries
- \`locks/\` — Write coordination locks

## Privacy

- All data stays local on your machine
- The \`index/\` directory contains derived data and can be safely deleted (it will be rebuilt)
- Configure \`exclude_paths\` in your oh-my-opencode config to exclude sensitive folders from indexing

## Obsidian Integration

This folder uses a \`_\` prefix to follow Obsidian conventions for system folders.
You can add \`.obsidian/snippets/hide-brain.css\` to hide it from the sidebar.
`
}

export function createSoulTemplate(): string {
  return `---
type: soul
version: 1
last_updated: ${new Date().toISOString()}
---

# Soul

## Identity

> Who is this agent to you? This section is updated through conversation.

## Principles

- Be thorough and precise
- Respect user's time and context
- Remember past decisions and their reasoning

## Relationships

## Preferences

## Vocabulary
`
}

export function createConfigTemplate(vaultPath: string): string {
  return `---
type: brain-config
version: 1
vault_path: "${vaultPath}"
created: ${new Date().toISOString()}
---

# Brain Configuration

This file documents the brain system configuration for this vault.
The actual configuration is in your oh-my-opencode config file.

## Vault Path
\`${vaultPath}\`

## Notes
- Index files in \`index/\` are derivative and can be safely deleted
- Soul memory in \`soul.md\` is the most important file — back it up
- Working memory files are session-scoped and cleaned up automatically
`
}

export function createHideBrainCssSnippet(): string {
  return `/* Hide _brain/ folder from Obsidian sidebar */
.nav-folder-title[data-path="_brain"],
.nav-folder-title[data-path="_brain"] + .nav-folder-children {
  display: none;
}
`
}

export function createInitialStateJson(): string {
  return JSON.stringify({
    files: {},
    last_full_scan: "",
    schema_version: 1,
  }, null, 2)
}

export function createMeetingTemplate(title: string, participants: string[], date: string): string {
  return `---
type: meeting
title: "${title}"
date: ${date}
participants: [${participants.map(p => `"${p}"`).join(", ")}]
---

# ${title}

## Participants
${participants.map(p => `- ${p}`).join("\n")}

## Notes


## Decisions


## Action Items

`
}

export function createDecisionTemplate(title: string, decision: string, reasoning: string, confidence: string): string {
  return `---
type: decision
title: "${title}"
confidence: ${confidence}
date: ${new Date().toISOString().split("T")[0]}
status: decided
---

# ${title}

## Decision
${decision}

## Reasoning
${reasoning}

## Alternatives Considered


## Outcomes

`
}

export function createPersonTemplate(name: string, relationship: string): string {
  return `---
type: person
name: "${name}"
relationship: ${relationship}
first_seen: ${new Date().toISOString()}
---

# ${name}

## Role


## Company


## Key Topics


## Notes

`
}
