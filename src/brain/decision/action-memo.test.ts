import { describe, expect, it } from "bun:test"
import { createActionMemo, formatActionMemoMarkdown, slugifyQuestion } from "./action-memo"
import type { ActionMemoInput } from "./types"

const baseInput: ActionMemoInput = {
  question: "Should we launch the AI assistant this quarter?",
  recommendation: "Launch with a limited beta rollout.",
  confidence: "medium",
  arguments_for: [
    { point: "Early users provide feedback quickly.", source: "SRC-1" },
    { point: "Competitors are moving fast.", source: "SRC-2" },
  ],
  arguments_against: [{ point: "Support load may spike.", source: "SRC-3" }],
  risks: [{ risk: "User trust risk", severity: "high", mitigation: "Tight quality gates" }],
  action_items: [
    { action: "Prepare beta onboarding", deadline: "2026-02-28T00:00:00.000Z", owner: "PM" },
    { action: "Set escalation protocol" },
  ],
  next_checkpoint: { date: "2026-03-10T00:00:00.000Z", criteria: "Beta retention above 40%" },
  sources: [
    { id: "SRC-1", type: "external", quote: "Pilot users improved activation by 18%." },
    { id: "SRC-2", type: "decision", quote: "Board requested faster market entry." },
    { id: "SRC-3", type: "event", quote: "Last launch doubled support tickets." },
  ],
  devils_advocate_notes: "If reliability drops below threshold, pause launch.",
  vault_base_path: "vault/memos",
}

describe("createActionMemo", () => {
  it("creates a valid ActionMemo from input", () => {
    const memo = createActionMemo(baseInput)

    expect(memo.question).toBe(baseInput.question)
    expect(memo.recommendation).toBe(baseInput.recommendation)
    expect(memo.confidence).toBe(baseInput.confidence)
    expect(memo.key_arguments.for).toEqual(baseInput.arguments_for)
    expect(memo.key_arguments.against).toEqual(baseInput.arguments_against)
    expect(memo.vault_path.endsWith(".md")).toBe(true)
  })

  it("generates UUID id", () => {
    const memo = createActionMemo(baseInput)

    expect(memo.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it("sets created_at timestamp", () => {
    const before = Date.now()
    const memo = createActionMemo(baseInput)
    const after = Date.now()
    const created = new Date(memo.created_at).getTime()

    expect(Number.isNaN(created)).toBe(false)
    expect(created).toBeGreaterThanOrEqual(before)
    expect(created).toBeLessThanOrEqual(after)
  })

  it("builds correct vault_path with date and slug", () => {
    const memo = createActionMemo(baseInput)
    const date = memo.created_at.slice(0, 10)
    const slug = slugifyQuestion(baseInput.question)

    expect(memo.vault_path).toBe(`vault/memos/${date}-debate-${slug}.md`)
  })

  it("preserves all input fields", () => {
    const memo = createActionMemo({ ...baseInput, vault_base_path: "vault/memos/" })

    expect(memo.key_arguments.for).toEqual(baseInput.arguments_for)
    expect(memo.key_arguments.against).toEqual(baseInput.arguments_against)
    expect(memo.risks).toEqual(baseInput.risks)
    expect(memo.action_items).toEqual(baseInput.action_items)
    expect(memo.next_checkpoint).toEqual(baseInput.next_checkpoint)
    expect(memo.sources).toEqual(baseInput.sources)
    expect(memo.devils_advocate_notes).toBe(baseInput.devils_advocate_notes)
    expect(memo.vault_path.startsWith("vault/memos/")).toBe(true)
  })
})

describe("formatActionMemoMarkdown", () => {
  it("contains YAML frontmatter with correct fields", () => {
    const memo = createActionMemo(baseInput)
    const markdown = formatActionMemoMarkdown(memo)

    expect(markdown).toContain("---")
    expect(markdown).toContain(`id: ${memo.id}`)
    expect(markdown).toContain(`created_at: ${memo.created_at}`)
    expect(markdown).toContain(`confidence: ${memo.confidence}`)
    expect(markdown).toContain('type: "debate-memo"')
  })

  it("contains all required sections", () => {
    const memo = createActionMemo(baseInput)
    const markdown = formatActionMemoMarkdown(memo)

    expect(markdown).toContain("# 질문")
    expect(markdown).toContain("# 권장 사항")
    expect(markdown).toContain("# 핵심 논거")
    expect(markdown).toContain("## 찬성")
    expect(markdown).toContain("## 반대")
    expect(markdown).toContain("# 위험 요소")
    expect(markdown).toContain("# 실행 항목")
    expect(markdown).toContain("# 다음 체크포인트")
    expect(markdown).toContain("# 악마의 대변인 메모")
    expect(markdown).toContain("# 출처")
  })

  it("numbers sources correctly and arguments reference sources", () => {
    const memo = createActionMemo(baseInput)
    const markdown = formatActionMemoMarkdown(memo)

    expect(markdown).toContain("[1] (external) SRC-1:")
    expect(markdown).toContain("[2] (decision) SRC-2:")
    expect(markdown).toContain("[3] (event) SRC-3:")
    expect(markdown).toContain("(출처: [1])")
    expect(markdown).toContain("(출처: [2])")
    expect(markdown).toContain("(출처: [3])")
  })
})

describe("slugifyQuestion", () => {
  it("converts basic question to slug", () => {
    expect(slugifyQuestion("Should We Launch Now?")).toBe("should-we-launch-now")
  })

  it("handles Korean characters by removing unsupported characters", () => {
    expect(slugifyQuestion("한국어 질문 should we go")).toBe("should-we-go")
  })

  it("removes special characters", () => {
    expect(slugifyQuestion("Hello, World! @2026 #Plan")).toBe("hello-world-2026-plan")
  })

  it("truncates to 50 characters", () => {
    const longQuestion = "this is a very long question that should be truncated for file names safely"
    const slug = slugifyQuestion(longQuestion)

    expect(slug.length).toBeLessThanOrEqual(50)
  })

  it("converts multiple spaces to a single hyphen", () => {
    expect(slugifyQuestion("a   b      c")).toBe("a-b-c")
  })
})
