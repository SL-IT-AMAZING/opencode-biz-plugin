import type { ActionMemo, ActionMemoInput } from "./types"

const MAX_SLUG_LENGTH = 50

function trimTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, "")
}

function formatDateHumanReadable(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)
}

function sourceReferenceNumber(sourceId: string, sources: ActionMemo["sources"]): number | null {
  const index = sources.findIndex((source) => source.id === sourceId)
  return index >= 0 ? index + 1 : null
}

export function slugifyQuestion(question: string): string {
  const normalized = question
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")

  const slug = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "")
  return slug.length > 0 ? slug : "memo"
}

export function createActionMemo(input: ActionMemoInput): ActionMemo {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const date = createdAt.slice(0, 10)
  const slug = slugifyQuestion(input.question)
  const basePath = trimTrailingSlashes(input.vault_base_path)
  const fileName = `${date}-debate-${slug}.md`
  const vaultPath = `${basePath}/${fileName}`

  return {
    id,
    created_at: createdAt,
    question: input.question,
    recommendation: input.recommendation,
    confidence: input.confidence,
    key_arguments: {
      for: input.arguments_for,
      against: input.arguments_against,
    },
    risks: input.risks,
    action_items: input.action_items,
    next_checkpoint: input.next_checkpoint,
    sources: input.sources,
    devils_advocate_notes: input.devils_advocate_notes,
    vault_path: vaultPath,
  }
}

export function formatActionMemoMarkdown(memo: ActionMemo): string {
  const lines: string[] = [
    "---",
    `id: ${memo.id}`,
    `created_at: ${memo.created_at}`,
    `confidence: ${memo.confidence}`,
    'type: "debate-memo"',
    "---",
    "",
    "# 질문",
    memo.question,
    "",
    "# 권장 사항",
    memo.recommendation,
    "",
    "# 핵심 논거",
    "## 찬성",
  ]

  if (memo.key_arguments.for.length === 0) {
    lines.push("- 없음")
  } else {
    for (const argument of memo.key_arguments.for) {
      const refNumber = sourceReferenceNumber(argument.source, memo.sources)
      const ref = refNumber === null ? argument.source : `[${refNumber}]`
      lines.push(`- ${argument.point} (출처: ${ref})`)
    }
  }

  lines.push("", "## 반대")

  if (memo.key_arguments.against.length === 0) {
    lines.push("- 없음")
  } else {
    for (const argument of memo.key_arguments.against) {
      const refNumber = sourceReferenceNumber(argument.source, memo.sources)
      const ref = refNumber === null ? argument.source : `[${refNumber}]`
      lines.push(`- ${argument.point} (출처: ${ref})`)
    }
  }

  lines.push("", "# 위험 요소")

  if (memo.risks.length === 0) {
    lines.push("- 없음")
  } else {
    for (const risk of memo.risks) {
      const mitigation = risk.mitigation ? ` / 완화: ${risk.mitigation}` : ""
      lines.push(`- ${risk.risk} (심각도: ${risk.severity}${mitigation})`)
    }
  }

  lines.push("", "# 실행 항목")

  if (memo.action_items.length === 0) {
    lines.push("- 없음")
  } else {
    for (const item of memo.action_items) {
      const deadline = item.deadline ? ` / 기한: ${formatDateHumanReadable(item.deadline)}` : ""
      const owner = item.owner ? ` / 담당: ${item.owner}` : ""
      lines.push(`- ${item.action}${deadline}${owner}`)
    }
  }

  lines.push(
    "",
    "# 다음 체크포인트",
    `- 일정: ${formatDateHumanReadable(memo.next_checkpoint.date)}`,
    `- 기준: ${memo.next_checkpoint.criteria}`,
    "",
    "# 악마의 대변인 메모",
    memo.devils_advocate_notes || "없음",
    "",
    "# 출처",
  )

  if (memo.sources.length === 0) {
    lines.push("- 없음")
  } else {
    memo.sources.forEach((source, index) => {
      lines.push(`[${index + 1}] (${source.type}) ${source.id}: ${source.quote}`)
    })
  }

  return lines.join("\n")
}
