import { describe, it, expect } from "bun:test"
import { createProvenance } from "./provenance"

describe("shared/provenance", () => {
  it("creates provenance with all required fields", () => {
    // #given
    const options = {
      source_type: "document" as const,
      source_id: "doc-123",
      confidence: 0.95,
      created_by: "ai" as const,
      citation: "Source: knowledge base",
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.source_type).toBe("document")
    expect(provenance.source_id).toBe("doc-123")
    expect(provenance.confidence).toBe(0.95)
    expect(provenance.created_by).toBe("ai")
    expect(provenance.citation).toBe("Source: knowledge base")
  })

  it("defaults confidence to 1 when not provided", () => {
    // #given
    const options = {
      source_type: "conversation" as const,
      source_id: "conv-456",
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.confidence).toBe(1)
  })

  it("defaults created_by to 'system' when not provided", () => {
    // #given
    const options = {
      source_type: "manual" as const,
      source_id: "manual-789",
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.created_by).toBe("system")
  })

  it("clamps confidence to 0 when negative", () => {
    // #given
    const options = {
      source_type: "ai_generated" as const,
      source_id: "ai-999",
      confidence: -0.5,
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.confidence).toBe(0)
  })

  it("clamps confidence to 1 when over 1", () => {
    // #given
    const options = {
      source_type: "meeting" as const,
      source_id: "mtg-111",
      confidence: 1.5,
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.confidence).toBe(1)
  })

  it("includes citation when provided", () => {
    // #given
    const options = {
      source_type: "document" as const,
      source_id: "doc-222",
      citation: "Page 42 of Smith et al.",
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.citation).toBe("Page 42 of Smith et al.")
  })

  it("omits citation when not provided", () => {
    // #given
    const options = {
      source_type: "conversation" as const,
      source_id: "conv-333",
    }

    // #when
    const provenance = createProvenance(options)

    // #then
    expect(provenance.citation).toBeUndefined()
  })
})
