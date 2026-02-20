import { describe, expect, test } from "bun:test"
import {
  createReadmeTemplate,
  createSoulTemplate,
  createConfigTemplate,
  createHideBrainCssSnippet,
  createInitialStateJson,
  createMeetingTemplate,
  createDecisionTemplate,
  createPersonTemplate,
} from "./templates"

describe("brain/vault/templates", () => {
  describe("createReadmeTemplate", () => {
    test("returns non-empty string", () => {
      // #given / #when
      const result = createReadmeTemplate()

      // #then
      expect(result.length).toBeGreaterThan(0)
    })

    test("contains Brain Memory System heading", () => {
      // #given / #when
      const result = createReadmeTemplate()

      // #then
      expect(result).toContain("# Brain Memory System")
    })
  })

  describe("createSoulTemplate", () => {
    test("returns non-empty string", () => {
      // #given / #when
      const result = createSoulTemplate()

      // #then
      expect(result.length).toBeGreaterThan(0)
    })

    test("contains YAML frontmatter", () => {
      // #given / #when
      const result = createSoulTemplate()

      // #then
      expect(result).toMatch(/^---\n/)
      expect(result).toContain("type: soul")
      expect(result).toContain("version: 1")
      expect(result).toMatch(/---\n\n/)
    })
  })

  describe("createConfigTemplate", () => {
    test("returns non-empty string", () => {
      // #given / #when
      const result = createConfigTemplate("/some/vault/path")

      // #then
      expect(result.length).toBeGreaterThan(0)
    })

    test("embeds the vault path", () => {
      // #given
      const vaultPath = "/Users/test/my-obsidian-vault"

      // #when
      const result = createConfigTemplate(vaultPath)

      // #then
      expect(result).toContain(vaultPath)
      expect(result).toContain(`vault_path: "${vaultPath}"`)
    })
  })

  describe("createInitialStateJson", () => {
    test("returns non-empty string", () => {
      // #given / #when
      const result = createInitialStateJson()

      // #then
      expect(result.length).toBeGreaterThan(0)
    })

    test("is valid JSON with expected keys", () => {
      // #given / #when
      const result = createInitialStateJson()
      const parsed = JSON.parse(result)

      // #then
      expect(parsed).toHaveProperty("files")
      expect(parsed).toHaveProperty("last_full_scan")
      expect(parsed).toHaveProperty("schema_version")
      expect(parsed.schema_version).toBe(1)
      expect(parsed.files).toEqual({})
      expect(parsed.last_full_scan).toBe("")
    })
  })

  describe("createHideBrainCssSnippet", () => {
    test("returns non-empty string", () => {
      // #given / #when
      const result = createHideBrainCssSnippet()

      // #then
      expect(result.length).toBeGreaterThan(0)
    })

    test("contains CSS selectors for _brain", () => {
      // #given / #when
      const result = createHideBrainCssSnippet()

      // #then
      expect(result).toContain('data-path="_brain"')
      expect(result).toContain("display: none")
      expect(result).toContain(".nav-folder-title")
    })
  })

  describe("createMeetingTemplate", () => {
    test("contains title and participants", () => {
      // #given / #when
      const result = createMeetingTemplate("Board Meeting", ["Alice", "Bob"], "2026-01-15")
      // #then
      expect(result).toContain("# Board Meeting")
      expect(result).toContain("- Alice")
      expect(result).toContain("- Bob")
      expect(result).toContain("date: 2026-01-15")
    })
  })

  describe("createDecisionTemplate", () => {
    test("contains decision and reasoning", () => {
      // #given / #when
      const result = createDecisionTemplate("Hire CTO", "Promote internally", "Better culture fit", "high")
      // #then
      expect(result).toContain("# Hire CTO")
      expect(result).toContain("Promote internally")
      expect(result).toContain("Better culture fit")
      expect(result).toContain("confidence: high")
    })
  })

  describe("createPersonTemplate", () => {
    test("contains name and relationship", () => {
      // #given / #when
      const result = createPersonTemplate("Kim CEO", "partner")
      // #then
      expect(result).toContain("# Kim CEO")
      expect(result).toContain("relationship: partner")
      expect(result).toContain("type: person")
    })

    test("contains YAML frontmatter", () => {
      // #given / #when
      const result = createPersonTemplate("Lee Investor", "investor")
      // #then
      expect(result).toMatch(/^---\n/)
      expect(result).toContain('name: "Lee Investor"')
    })
  })
})
