import type { ChunkInsert } from "./types"

const DEFAULT_MAX_CHUNK_SIZE = 800
const MIN_CHUNK_SIZE = 50
// Matches YAML frontmatter: starts with --- on first line, ends with --- on its own line
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/
// Matches markdown headings (# through ###)
const HEADING_RE = /^#{1,3}\s/m

function computeHash(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(content)
  return hasher.digest("hex")
}

function splitByParagraphs(text: string, maxSize: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const result: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current.length > 0) {
      result.push(current.trim())
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }

  if (current.trim().length > 0) {
    result.push(current.trim())
  }

  return result
}

function splitBySentences(text: string, maxSize: number): string[] {
  const sentences = text.split(/(?<=\.)\s+/)
  const result: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 > maxSize && current.length > 0) {
      result.push(current.trim())
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }

  if (current.trim().length > 0) {
    result.push(current.trim())
  }

  return result
}

function splitOversized(text: string, maxSize: number): string[] {
  const byParagraph = splitByParagraphs(text, maxSize)
  const result: string[] = []

  for (const chunk of byParagraph) {
    if (chunk.length <= maxSize) {
      result.push(chunk)
    } else {
      result.push(...splitBySentences(chunk, maxSize))
    }
  }

  return result
}

export function splitMarkdownChunks(
  content: string,
  maxChunkSize: number = DEFAULT_MAX_CHUNK_SIZE,
): ChunkInsert[] {
  let body = content.replace(FRONTMATTER_RE, "").trim()

  if (body.length === 0) return []

  const sections: string[] = []

  if (HEADING_RE.test(body)) {
    const parts = body.split(/(?=^#{1,3}\s)/m)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.length > 0) {
        sections.push(trimmed)
      }
    }
  } else {
    sections.push(body)
  }

  const rawChunks: string[] = []
  for (const section of sections) {
    if (section.length <= maxChunkSize) {
      rawChunks.push(section)
    } else {
      rawChunks.push(...splitOversized(section, maxChunkSize))
    }
  }

  return rawChunks
    .filter(chunk => chunk.length >= MIN_CHUNK_SIZE)
    .map((chunk, index) => ({
      content: chunk,
      chunk_index: index,
      content_hash: computeHash(chunk),
      is_evergreen: false,
    }))
}
