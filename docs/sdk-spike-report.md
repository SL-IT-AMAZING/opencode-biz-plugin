# Phase 0: SDK Feasibility Spike Report

**Date:** 2026-02-20
**SDK Version:** `@opencode-ai/plugin@1.2.9` / `@opencode-ai/sdk@1.2.9`
**Status:** ✅ ALL 4 CAPABILITIES CONFIRMED — Proceed to Phase 1

---

## Executive Summary

All four SDK capabilities required by the ARCHITECTURE-PLAN.md (v2.0) are feasible.
Three are **fully proven in production** (already used by our plugin or oh-my-opencode).
One (LLM calls) has a **viable workaround** via `session.prompt()`, but the Evidence Pack
approach from the architecture plan remains the recommended path for Phase 4.

| # | Capability | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | System prompt injection | ✅ PROVEN | Brain plugin uses `experimental.chat.system.transform` |
| 2 | Session start detection | ✅ PROVEN | Brain plugin handles `session.created` events |
| 3 | User message reading | ✅ PROVEN | 3 pathways: `chat.message`, messages transform, client API |
| 4 | LLM call from plugin | ⚠️ INDIRECT | No `llm.complete()` — use `session.prompt()` or Evidence Pack |

**No Phase redesign required.** The architecture plan's decisions were correct.

---

## Q1: Can `experimental.chat.system.transform` Inject System Prompts?

### Verdict: ✅ YES — Fully Supported, Production-Proven

### Type Signature (from SDK `index.d.ts:197-202`)

```typescript
"experimental.chat.system.transform"?: (
  input: {
    sessionID?: string;
    model: Model;
  },
  output: {
    system: string[];
  }
) => Promise<void>;
```

### How It Works

- Called **before every LLM API call**
- `output.system` is a mutable string array — push content to inject into system prompt
- `input.sessionID` available for per-session context differentiation
- `input.model` available for model-specific behavior

### Production Evidence

**Brain plugin** (`src/hooks/index.ts:40-57`):
```typescript
"experimental.chat.system.transform": async (input, output) => {
  if (!deps.heartbeat || !input.sessionID) return
  const alreadyInjected = output.system.some(s => s.includes(HEARTBEAT_MARKER))
  if (alreadyInjected) return
  const sections = await deps.heartbeat.getSystemContext(input.sessionID)
  if (sections.length > 0) {
    output.system.push(`${HEARTBEAT_MARKER}\n${sections.join("\n")}`)
  }
}
```

**oh-my-opencode** uses `experimental.chat.messages.transform` (related hook) for context injection.

### Key Design Patterns Validated

1. **Dedup marker** — `HEARTBEAT_MARKER` prevents duplicate injection
2. **Session-scoped context** — Different content per session
3. **Async data loading** — Can `await` async operations (disk reads, DB queries)
4. **Graceful degradation** — Returns silently if no data available

### Phase Impact

- **Phase 3 (Proactive AI):** In-band nudge model via this hook is **FULLY FEASIBLE**
- No architecture changes needed

---

## Q2: Can Plugin Detect New Chat/Session Start?

### Verdict: ✅ YES — Fully Supported, Production-Proven

### Type Signature (from SDK `index.d.ts:109-111`)

```typescript
event?: (input: {
  event: Event;  // from @opencode-ai/sdk
}) => Promise<void>;
```

### Available Event Types (from oh-my-opencode `src/index.ts:399-476`)

| Event Type | Properties | Use Case |
|-----------|-----------|----------|
| `session.created` | `info: { id, title, parentID }` | Morning brief trigger, session init |
| `session.deleted` | `info: { id }` | Cleanup, cache invalidation |
| `session.error` | `sessionID, messageID, error` | Error recovery |
| `message.updated` | `info: { sessionID, agent, role }` | Track conversation state |

### Production Evidence

**Brain plugin** (`src/hooks/index.ts:91-98`):
```typescript
event: async ({ event }) => {
  if (event.type === "session.created") {
    const props = event.properties as Record<string, unknown> | undefined
    const sessionInfo = props?.info as { id?: string } | undefined
    if (sessionInfo?.id) {
      log("[brain-hook] session created", { sessionID: sessionInfo.id })
    }
  }
}
```

**oh-my-opencode** (`src/index.ts:418-426`):
```typescript
if (event.type === "session.created") {
  const sessionInfo = props?.info as
    | { id?: string; title?: string; parentID?: string }
    | undefined;
  if (!sessionInfo?.parentID) {
    setMainSession(sessionInfo?.id);  // Distinguish main vs child session
  }
}
```

### Key Discovery: Main vs Sub-Session Detection

- `parentID` field distinguishes main sessions from delegated sub-sessions
- **Morning brief** should only trigger on main sessions (`!parentID`)
- Sub-sessions (from delegate_task) have `parentID` set

### Phase Impact

- **Phase 3 (Proactive AI):** Morning brief trigger is **FULLY FEASIBLE**
- Can detect first session of the day by tracking timestamps
- Must filter out sub-sessions via `parentID`

---

## Q3: Can Plugin Read User Messages?

### Verdict: ✅ YES — Three Independent Pathways

### Pathway 1: `chat.message` Hook (RECOMMENDED for real-time)

**Type Signature** (SDK `index.d.ts:120-132`):
```typescript
"chat.message"?: (
  input: {
    sessionID: string;
    agent?: string;
    model?: { providerID: string; modelID: string };
    messageID?: string;
    variant?: string;
  },
  output: {
    message: UserMessage;
    parts: Part[];
  }
) => Promise<void>;
```

- Fires on **every new user message**
- `output.parts` contains message content (text, tool_use, etc.)
- Real-time — process as messages arrive
- oh-my-opencode uses this for keyword detection, ralph loop, auto-slash commands

### Pathway 2: `experimental.chat.messages.transform` (Full History)

**Type Signature** (SDK `index.d.ts:191-196`):
```typescript
"experimental.chat.messages.transform"?: (
  input: {},
  output: {
    messages: {
      info: Message;
      parts: Part[];
    }[];
  }
) => Promise<void>;
```

- Fires **before every LLM API call**
- Contains **FULL conversation history** (all messages)
- Can analyze entire context before response generation
- oh-my-opencode uses this for context injection and thinking block validation

### Pathway 3: `client.session.messages()` (Programmatic Query)

```typescript
// Available via PluginInput.client
client.session.messages({
  path: { id: sessionID }
}): Promise<SessionMessagesResponses>
```

- Query **any session's** message history programmatically
- Works from tools, hooks, or background processes
- Can access parent, sibling, or child sessions

### Phase Impact

- **Phase 1 (CEO Events):** Conversation logging via `chat.message` is **FULLY FEASIBLE**
- **Phase 3 (Proactive):** Context-aware nudges using message history is **FULLY FEASIBLE**
- **Phase 4 (Multi-agent):** Evidence collection from conversation is **FULLY FEASIBLE**
- Recommend `chat.message` for real-time logging, `messages.transform` for context analysis

---

## Q4: Does SDK Expose LLM Call Capability?

### Verdict: ⚠️ NO Direct `llm.complete()` — But `session.prompt()` Exists

### What Does NOT Exist

- No `client.llm.complete()` or `client.chat()` or `client.generate()`
- No standalone completion/inference API in the SDK
- Plugin tools execute as part of the model's tool-use loop — they cannot call back to the model

### What DOES Exist: Session-Based Delegation

**`client.session.prompt()`** (SDK `sdk.gen.d.ts:174`):
```typescript
// Send a message to a session, triggering an LLM response
client.session.prompt({
  path: { id: sessionID },
  body: {
    parts: [{ type: "text", text: "..." }],
    agent?: string,    // Optional: target specific agent
    model?: { ... },   // Optional: override model
  },
  query: { directory: ctx.directory }
})
```

**`client.session.promptAsync()`** (SDK `sdk.gen.d.ts:182`):
```typescript
// Send message and return immediately (fire-and-forget)
client.session.promptAsync({ ... })
```

**`client.session.create()`** (SDK `sdk.gen.d.ts:114`):
```typescript
// Create a new child session for isolated LLM interaction
client.session.create({ ... })
```

### How oh-my-opencode Uses Session Delegation

```typescript
// From src/tools/call-omo-agent/tools.ts
const createResult = await ctx.client.session.create({ ... })
await ctx.client.session.prompt({
  path: { id: sessionID },
  body: { parts: [{ type: "text", text: debatePrompt }] }
})
// Poll for completion
const messagesResult = await ctx.client.session.messages({
  path: { id: sessionID }
})
```

### Phase 4 Architecture Decision: CONFIRMED

The architecture plan's **Evidence Pack approach** (Method A) is the correct design:

| Approach | Feasibility | Recommendation |
|----------|-------------|----------------|
| **Method A: Evidence Pack** | ✅ Fully feasible | **RECOMMENDED** — Tool returns structured evidence, host model synthesizes in single completion |
| **Method B: Session Delegation** | ✅ Feasible but complex | Alternative — Create child sessions for each debate role |
| Direct LLM call | ❌ Not possible | N/A |

**Why Evidence Pack wins:**
1. No session management overhead
2. Single LLM call = more token-efficient
3. Structured output, no polling needed
4. Tool returns data, model does reasoning (natural tool-use pattern)

### Phase Impact

- **Phase 4 (Multi-agent):** Evidence Pack approach **CONFIRMED as correct**
- Session delegation is available as **Method B fallback** if Evidence Pack proves insufficient
- No architecture changes needed

---

## Complete SDK Hook Reference

### Standard Hooks

| Hook | Signature | When | Mutable? |
|------|----------|------|----------|
| `event` | `(input: { event: Event }) → void` | Any lifecycle event | Read-only |
| `config` | `(input: Config) → void` | Config changes | Read-only |
| `chat.message` | `(input: {sessionID, agent?, model?, messageID?}, output: {message, parts})` | New user message | Output mutable |
| `chat.params` | `(input: {sessionID, agent, model, provider, message}, output: {temperature, topP, topK, options})` | Before LLM call | Output mutable |
| `chat.headers` | `(input: {sessionID, agent, model, provider, message}, output: {headers})` | Before LLM API request | Output mutable |
| `permission.ask` | `(input: Permission, output: {status})` | Permission check | Output mutable |
| `command.execute.before` | `(input: {command, sessionID, arguments}, output: {parts})` | Before slash command | Output mutable |
| `tool.execute.before` | `(input: {tool, sessionID, callID}, output: {args})` | Before any tool | Output mutable |
| `tool.execute.after` | `(input: {tool, sessionID, callID, args}, output: {title, output, metadata})` | After any tool | Output mutable |
| `tool.definition` | `(input: {toolID}, output: {description, parameters})` | Tool registration | Output mutable |
| `shell.env` | `(input: {cwd, sessionID?, callID?}, output: {env})` | Shell execution | Output mutable |

### Experimental Hooks

| Hook | Signature | When | Use Case |
|------|----------|------|----------|
| `experimental.chat.system.transform` | `(input: {sessionID?, model}, output: {system: string[]})` | Before every LLM call | **System prompt injection** |
| `experimental.chat.messages.transform` | `(input: {}, output: {messages: {info, parts}[]})` | Before every LLM call | **Message history transform** |
| `experimental.session.compacting` | `(input: {sessionID}, output: {context: string[], prompt?})` | Before compaction | **Memory state preservation** |
| `experimental.text.complete` | `(input: {sessionID, messageID, partID}, output: {text})` | Text completion | **Post-process completions** |

### Tool Context (available in tool handlers)

```typescript
type ToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;   // Current project directory
  worktree: string;    // Project worktree root
  abort: AbortSignal;  // Cancellation signal
  metadata(input: { title?: string; metadata?: Record<string, any> }): void;
  ask(input: AskInput): Promise<void>;  // Request user permission
}
```

### Client API (available via `PluginInput.client`)

```typescript
client.session.create()       // Create new session
client.session.prompt()       // Send message to session (sync)
client.session.promptAsync()  // Send message to session (async)
client.session.messages()     // Get session message history
client.session.message()      // Get single message
client.session.get()          // Get session info
client.session.todo()         // Get session todos
client.session.children()     // Get child sessions
client.session.fork()         // Fork session at message
client.session.summarize()    // Summarize session
client.session.abort()        // Abort session
client.session.status()       // Get session status

client.tui.showToast()        // Show toast notification
client.tui.appendPrompt()     // Append text to TUI prompt
client.tui.executeCommand()   // Execute TUI command

client.app.agents()           // List all agents
client.app.log()              // Write server log

client.config.get()           // Get config
client.config.providers()     // List providers

client.provider.list()        // List providers
client.tool.list()            // List tools with schemas

client.file.read()            // Read file
client.file.list()            // List files
client.find.text()            // Find text in files
```

---

## Additional Discoveries

### 1. BunShell Access (`PluginInput.$`)

Plugins have access to Bun's shell for running commands:
```typescript
const result = await ctx.$`ls -la ${directory}`.text()
```
Useful for: vault operations, git commands, file system ops.

### 2. Toast Notifications (`client.tui.showToast()`)

Can show non-blocking notifications to the user:
```typescript
await ctx.client.tui.showToast({
  body: { message: "Morning brief ready", type: "info" }
})
```
Useful for: Phase 3 proactive nudges as visual indicators.

### 3. `tool.definition` Hook — Dynamic Tool Modification

Can modify any tool's description/parameters at registration time:
```typescript
"tool.definition"?: (input: { toolID: string }, output: {
  description: string;
  parameters: any;
}) => Promise<void>;
```
Useful for: Context-aware tool descriptions based on user's CEO role.

### 4. `chat.params` Hook — LLM Parameter Control

Can modify temperature, topP, topK per-request:
```typescript
"chat.params"?: (input: {...}, output: {
  temperature: number;
  topP: number;
  topK: number;
  options: Record<string, any>;
}) => Promise<void>;
```
Useful for: Lower temperature for decision analysis, higher for brainstorming.

### 5. Plugin Config Access Pattern

Current brain plugin uses type assertion:
```typescript
const rawConfig = (ctx as unknown as Record<string, unknown>).brain ?? {}
```
This is fragile. Consider using the `config` hook for dynamic config updates.

---

## Phase 1 Impact Assessment

### No Blockers Found

All Phase 1 deliverables are feasible with the current SDK:

| Phase 1 Item | SDK Support | Notes |
|-------------|-------------|-------|
| CEO event types (AkashicEvent union) | ✅ No SDK dependency | Pure TypeScript types |
| 7 new tools (brain_log_meeting, etc.) | ✅ `tool()` API proven | Same pattern as existing 5 tools |
| Business scorer extension | ✅ No SDK dependency | Internal scoring logic |
| Vault templates (meeting, decision, CRM) | ✅ File system via paths | Same as current templates |
| Storage migration (schema_version) | ✅ No SDK dependency | JSONL format, internal migration |
| Conversation detection | ✅ `chat.message` hook | NEW: wire into event hook |
| Provenance tracking | ✅ No SDK dependency | Metadata on AkashicEvent |

### New Capabilities Available for Phase 1

1. **`chat.message` hook** — Can automatically detect and log conversations
   without requiring the user to explicitly call `brain_log_meeting`
2. **`tool.execute.after` hook** — Can observe what tools were used and
   log decisions/commitments inferred from tool usage
3. **`client.tui.showToast()`** — Can show subtle notifications when
   events are auto-logged ("Meeting notes captured")

### Recommended Phase 1 Addition

Add `chat.message` hook to automatically detect conversation topics and
suggest logging. This creates a more JARVIS-like experience where the
system proactively captures important events rather than waiting for
explicit tool calls.

---

## Conclusion

**Phase 0 SDK Spike: PASSED ✅**

The OpenCode plugin SDK is significantly more capable than initially assumed.
All four architectural assumptions from the plan are validated. The SDK provides
a rich set of hooks covering the full request lifecycle, message access, system
prompt injection, and session management.

**Proceed to Phase 1 implementation with confidence.**

Key architectural decisions confirmed:
1. Phase 3 proactive AI → `experimental.chat.system.transform` (in-band nudge) ✅
2. Phase 3 morning brief → `event` hook with `session.created` ✅
3. Phase 4 multi-agent → Evidence Pack approach (tool returns data, model reasons) ✅
4. Conversation logging → `chat.message` hook for real-time detection ✅
