import { describe, expect, test } from "bun:test"
import { createSummaryBuilder, formatRelativeTime } from "./summary-builder"
import type { AggregatedEvents } from "./types"

function makeAggregated(overrides: Partial<AggregatedEvents> = {}): AggregatedEvents {
  return {
    fileActivities: [],
    decisions: [],
    scratchEntries: [],
    searchActivities: [],
    totalEvents: 0,
    timeRange: { from: "", to: "" },
    eventTypeCounts: {},
    ...overrides,
  }
}

describe("brain/consolidation/summary-builder", () => {
  test("#given empty aggregated events #when building context summary #then returns no activity message", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated()

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T12:00:00.000Z")

    // #then
    expect(summary).toBe("No activity recorded yet.")
  })

  test("#given active files #when building context summary #then renders file count and top basenames", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 5,
      fileActivities: [
        {
          path: "src/brain/consolidation/event-aggregator.ts",
          eventCount: 3,
          lastEventTime: "2025-08-01T10:30:00.000Z",
          maxPriority: 80,
          types: new Set(["file.modified"]),
        },
        {
          path: "src/brain/consolidation/types.ts",
          eventCount: 2,
          lastEventTime: "2025-08-01T10:10:00.000Z",
          maxPriority: 60,
          types: new Set(["file.modified"]),
        },
        {
          path: "README.md",
          eventCount: 1,
          lastEventTime: "2025-08-01T09:40:00.000Z",
          maxPriority: 40,
          types: new Set(["file.created"]),
        },
        {
          path: "src/index.ts",
          eventCount: 1,
          lastEventTime: "2025-08-01T09:00:00.000Z",
          maxPriority: 30,
          types: new Set(["file.created"]),
        },
      ],
      decisions: [
        {
          timestamp: "2025-08-01T11:00:00.000Z",
          decision: "Proceed with phased consolidation rollout",
          reasoning: "Reduce risk",
          confidence: "high",
        },
      ],
      eventTypeCounts: {
        "file.created": 1,
        "file.modified": 4,
        "file.deleted": 0,
      },
      searchActivities: [
        { query: "consolidation", resultsCount: 5, timestamp: "2025-08-01T11:10:00.000Z" },
      ],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toContain("Files: 4 active (event-aggregator.ts, types.ts, README.md).")
  })

  test("#given long latest decision #when building context summary #then truncates decision preview to 80 chars", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const longDecision = "This is a deliberately long decision message that should be truncated once it exceeds eighty characters in length"
    const aggregated = makeAggregated({
      totalEvents: 3,
      decisions: [
        {
          timestamp: "2025-08-01T11:00:00.000Z",
          decision: longDecision,
          reasoning: "Keep it concise",
          confidence: "medium",
        },
      ],
      eventTypeCounts: {
        "file.created": 1,
        "file.modified": 1,
        "file.deleted": 1,
      },
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toContain("latest: \"This is a deliberately long decision message that should be truncated once it...\"")
  })

  test("#given no files and no searches #when building context summary #then omits optional lines", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 2,
      decisions: [
        {
          timestamp: "2025-08-01T11:00:00.000Z",
          decision: "Keep the existing cursor format",
          reasoning: "Backward compatibility",
          confidence: "high",
        },
      ],
      eventTypeCounts: {
        "file.created": 0,
        "file.modified": 2,
        "file.deleted": 0,
      },
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).not.toContain("Files:")
    expect(summary).not.toContain("Searches:")
    expect(summary).toContain("Activity: 0 created, 2 modified, 0 deleted.")
  })

  test("#given context scratch override #when building context summary #then uses context override", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 4,
      scratchEntries: ["CONTEXT: Keep focused on consolidation regressions and cursor safety."],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toBe("Keep focused on consolidation regressions and cursor safety.")
  })

  test("#given multiple context scratch overrides #when building context summary #then uses last matching entry", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 2,
      scratchEntries: [
        "CONTEXT: First context",
        "note: unrelated",
        "context: Last context wins",
      ],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toBe("Last context wins")
  })

  test("#given mixed context casing #when building context summary #then detects case-insensitive prefix", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 1,
      scratchEntries: ["CoNtExT: Custom summary from mixed case prefix"],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toBe("Custom summary from mixed case prefix")
  })

  test("#given very long context override #when building context summary #then caps output at 500 chars", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const veryLong = "x".repeat(700)
    const aggregated = makeAggregated({
      totalEvents: 1,
      scratchEntries: [`CONTEXT: ${veryLong}`],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary.length).toBe(500)
  })

  test("#given no decisions #when building context summary #then renders no decisions sentence", () => {
    // #given
    const summaryBuilder = createSummaryBuilder()
    const aggregated = makeAggregated({
      totalEvents: 1,
      eventTypeCounts: {
        "file.created": 1,
      },
      fileActivities: [
        {
          path: "src/a.ts",
          eventCount: 1,
          lastEventTime: "2025-08-01T10:30:00.000Z",
          maxPriority: 30,
          types: new Set(["file.created"]),
        },
      ],
    })

    // #when
    const summary = summaryBuilder.buildContextSummary(aggregated, "2025-08-01T10:00:00.000Z")

    // #then
    expect(summary).toContain("No decisions recorded.")
  })

  describe("formatRelativeTime", () => {
    const now = new Date("2025-08-03T15:30:00.000Z")

    test("#given timestamp less than 60 seconds old #when formatting #then returns just now", () => {
      // #given
      const timestamp = "2025-08-03T15:29:40.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, now)

      // #then
      expect(formatted).toBe("just now")
    })

    test("#given timestamp less than 60 minutes old #when formatting #then returns minutes ago", () => {
      // #given
      const timestamp = "2025-08-03T15:12:00.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, now)

      // #then
      expect(formatted).toBe("18m ago")
    })

    test("#given timestamp less than 24 hours old #when formatting #then returns hours and minutes ago", () => {
      // #given
      const timestamp = "2025-08-03T12:10:00.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, now)

      // #then
      expect(formatted).toBe("3h 20m ago")
    })

    test("#given future timestamp on same day #when formatting #then returns today at time", () => {
      // #given
      const localNow = new Date("2025-08-03T08:00:00.000Z")
      const timestamp = "2025-08-03T18:05:00.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, localNow)

      // #then
      expect(formatted).toBe("today at 18:05")
    })

    test("#given timestamp from previous day #when formatting #then returns yesterday at time", () => {
      // #given
      const timestamp = "2025-08-02T13:20:00.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, now)

      // #then
      expect(formatted).toBe("yesterday at 13:20")
    })

    test("#given older timestamp #when formatting #then returns date fallback", () => {
      // #given
      const timestamp = "2025-07-20T13:20:00.000Z"

      // #when
      const formatted = formatRelativeTime(timestamp, now)

      // #then
      expect(formatted).toBe("2025-07-20")
    })
  })
})
