import { describe, expect, test } from "bun:test"
import {
  createReadmeTemplate,
  createSoulTemplate,
  createConfigTemplate,
  createHideBrainCssSnippet,
  createInitialStateJson,
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
})
