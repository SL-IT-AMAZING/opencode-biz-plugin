import { describe, test, expect } from "bun:test"
import { splitMarkdownChunks } from "./chunker"

describe("brain/search/chunker", () => {
  describe("splitMarkdownChunks", () => {
    test("#given content with headings → splits on heading boundaries", () => {
      // #given
      const content = [
        "# Introduction",
        "",
        "This is the introduction section with enough content to pass the minimum size filter.",
        "",
        "## Methods",
        "",
        "This is the methods section with enough content to pass the minimum size filter too.",
        "",
        "## Results",
        "",
        "This is the results section with enough content to be included in the final chunks.",
      ].join("\n")

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBeGreaterThanOrEqual(3)
      expect(chunks[0].content).toContain("Introduction")
      expect(chunks[1].content).toContain("Methods")
      expect(chunks[2].content).toContain("Results")
    })

    test("#given content with YAML frontmatter → strips frontmatter", () => {
      // #given
      const content = [
        "---",
        "title: Test Document",
        "date: 2025-01-01",
        "tags: [test, sample]",
        "---",
        "",
        "# Main Content",
        "",
        "This is the main content of the document with enough text to pass the minimum chunk size filter.",
      ].join("\n")

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBeGreaterThan(0)
      for (const chunk of chunks) {
        expect(chunk.content).not.toContain("title: Test Document")
        expect(chunk.content).not.toContain("date: 2025-01-01")
      }
    })

    test("#given short content → returns single chunk", () => {
      // #given
      const content = "This is a short piece of content that should fit in a single chunk without any splitting needed."

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBe(1)
      expect(chunks[0].content).toBe(content)
    })

    test("#given empty content → returns empty array", () => {
      // #when
      const chunks = splitMarkdownChunks("")

      // #then
      expect(chunks).toEqual([])
    })

    test("#given large section → splits on paragraph boundaries", () => {
      // #given
      const paragraphs = Array.from(
        { length: 20 },
        (_, i) =>
          `Paragraph ${i + 1} with enough content to make this a reasonably sized block that contributes meaningfully to the total character count of the document.`,
      )
      const content = paragraphs.join("\n\n")

      // #when
      const chunks = splitMarkdownChunks(content, 300)

      // #then
      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks.length).toBeLessThan(paragraphs.length)
    })

    test("#given custom maxChunkSize → respects limit", () => {
      // #given
      const content = [
        "First paragraph with some substantive content that provides context and information about the topic at hand.",
        "",
        "Second paragraph continues the discussion with additional details and examples that illustrate the main points being made.",
        "",
        "Third paragraph wraps up the thoughts and provides conclusions about what was discussed in the previous sections of text.",
      ].join("\n")
      const maxSize = 150

      // #when
      const chunks = splitMarkdownChunks(content, maxSize)

      // #then
      expect(chunks.length).toBeGreaterThan(1)
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(maxSize * 2)
      }
    })

    test("#then each chunk has content_hash (64 hex chars SHA-256)", () => {
      // #given
      const content = "This is content with enough text to be a valid chunk for hashing purposes and verification."

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBeGreaterThan(0)
      for (const chunk of chunks) {
        expect(chunk.content_hash).toMatch(/^[0-9a-f]{64}$/)
      }
    })

    test("#then each chunk has sequential chunk_index starting at 0", () => {
      // #given
      const content = [
        "# First Section",
        "",
        "First section content that is long enough to pass the minimum size filter easily for indexing.",
        "",
        "## Second Section",
        "",
        "Second section content that is also long enough to pass the minimum size filter for chunking.",
      ].join("\n")

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].chunk_index).toBe(i)
      }
    })

    test("#then each chunk has is_evergreen = false", () => {
      // #given
      const content = "This is content that should have is_evergreen set to false by default for all chunks produced."

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      expect(chunks.length).toBeGreaterThan(0)
      for (const chunk of chunks) {
        expect(chunk.is_evergreen).toBe(false)
      }
    })

    test("#then chunks below 50 chars are filtered out", () => {
      // #given
      const content = [
        "# A",
        "",
        "Ok",
        "",
        "# Real Section With Actual Content",
        "",
        "This section has enough content to be kept around after the filtering step that removes tiny chunks.",
      ].join("\n")

      // #when
      const chunks = splitMarkdownChunks(content)

      // #then
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThanOrEqual(50)
      }
    })
  })
})
