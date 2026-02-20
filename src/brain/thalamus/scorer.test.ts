import { describe, expect, test, afterEach } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { scoreChange, scoreBusinessEvent } from "./scorer"
import type { PendingChange, BusinessScoreFactors } from "./types"

describe("brain/thalamus/scorer", () => {
  const TEST_DIR = join(tmpdir(), "scorer-test-" + Date.now())

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("scoreChange", () => {
    test("scores unlink as 70 with structure type", async () => {
      // #given - a deleted file change
      const change: PendingChange = {
        path: join(TEST_DIR, "deleted.md"),
        type: "unlink",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(70)
      expect(result.type).toBe("structure")
    })

    test("scores add as 60 with structure type", async () => {
      // #given - a newly created file change
      const change: PendingChange = {
        path: join(TEST_DIR, "new-file.md"),
        type: "add",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(60)
      expect(result.type).toBe("structure")
    })

    test("scores change with small file as 15", async () => {
      // #given - a changed file that is very small (<100 bytes)
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "tiny.md")
      await Bun.write(filePath, "hi")
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(15)
      expect(result.type).toBe("content")
    })

    test("scores change with large file as 80", async () => {
      // #given - a changed file larger than 50KB
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "large.md")
      await Bun.write(filePath, "x".repeat(60 * 1024))
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(80)
      expect(result.type).toBe("content")
    })

    test("scores change with medium file as 50", async () => {
      // #given - a changed file between 100 bytes and 50KB
      mkdirSync(TEST_DIR, { recursive: true })
      const filePath = join(TEST_DIR, "medium.md")
      await Bun.write(filePath, "x".repeat(500))
      const change: PendingChange = {
        path: filePath,
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(50)
      expect(result.type).toBe("content")
    })

    test("scores change as 30 when stat fails", async () => {
      // #given - a change pointing to a non-existent file path
      const change: PendingChange = {
        path: join(TEST_DIR, "nonexistent", "ghost.md"),
        type: "change",
        timestamp: Date.now(),
      }

      // #when
      const result = await scoreChange(change, TEST_DIR)

      // #then
      expect(result.score).toBe(30)
      expect(result.type).toBe("content")
    })
  })

  describe("scoreBusinessEvent", () => {
    test("returns base score 30 for minimal event", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(40)
    })

    test("adds 40 for decision.made event type", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "decision.made",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(70)
    })

    test("adds 30 for commitment.created event type", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "commitment.created",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(60)
    })

    test("adds 25 for meeting.recorded event type", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "meeting.recorded",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(55)
    })

    test("adds 35 for commitment.missed event type", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "commitment.missed",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(65)
    })

    test("adds 15 for has_decision flag", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: true,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(55)
    })

    test("adds 10 for has_commitment flag", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: true,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(50)
    })

    test("adds both decision and commitment bonuses", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: true,
        has_commitment: true,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(65)
    })

    test("adds 5 per participant up to max 15", () => {
      // #given
      const baseFactors: Omit<BusinessScoreFactors, "participant_count"> = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const oneParticipant = scoreBusinessEvent({ ...baseFactors, participant_count: 1 })
      const twoParticipants = scoreBusinessEvent({ ...baseFactors, participant_count: 2 })
      const threeParticipants = scoreBusinessEvent({ ...baseFactors, participant_count: 3 })
      const fourParticipants = scoreBusinessEvent({ ...baseFactors, participant_count: 4 })

      // #then
      expect(oneParticipant).toBe(45)
      expect(twoParticipants).toBe(50)
      expect(threeParticipants).toBe(55)
      expect(fourParticipants).toBe(55)
    })

    test("caps participant bonus at 15", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        participant_count: 10,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(55)
    })

    test("adds 15 for investment domain", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "investment",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(55)
    })

    test("adds 12 for hiring domain", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "hiring",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(52)
    })

    test("adds 0 for other domain", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "conversation.logged",
        has_decision: false,
        has_commitment: false,
        participant_count: 0,
        topic_novelty: 0,
        business_domain: "other",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(40)
    })

    test("caps total score at 100", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "decision.made",
        has_decision: true,
        has_commitment: true,
        participant_count: 5,
        topic_novelty: 1,
        business_domain: "investment",
      }

      // #when
      const result = scoreBusinessEvent(factors)

      // #then
      expect(result).toBe(100)
    })

    test("returns consistent scores for same input", () => {
      // #given
      const factors: BusinessScoreFactors = {
        event_type: "meeting.recorded",
        has_decision: true,
        has_commitment: false,
        participant_count: 2,
        topic_novelty: 0.5,
        business_domain: "strategy",
      }

      // #when
      const first = scoreBusinessEvent(factors)
      const second = scoreBusinessEvent(factors)

      // #then
      expect(first).toBe(second)
    })
  })
})
