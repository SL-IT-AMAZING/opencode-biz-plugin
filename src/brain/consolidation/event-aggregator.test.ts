import { describe, expect, test } from "bun:test"
import { createEventAggregator } from "./event-aggregator"
import type { AkashicEvent } from "../types"
import type { SessionEntry } from "./types"

function makeEvent(overrides: Partial<AkashicEvent> & Pick<AkashicEvent, "id" | "timestamp" | "type" | "source" | "priority" | "data">): AkashicEvent {
  return { ...overrides }
}

describe("brain/consolidation/event-aggregator", () => {
  test("#given empty input → returns empty aggregated events", () => {
    // #given
    const aggregator = createEventAggregator()

    // #when
    const result = aggregator.aggregate([], [])

    // #then
    expect(result.fileActivities).toEqual([])
    expect(result.decisions).toEqual([])
    expect(result.scratchEntries).toEqual([])
    expect(result.searchActivities).toEqual([])
    expect(result.totalEvents).toBe(0)
    expect(result.timeRange).toEqual({ from: "", to: "" })
    expect(result.eventTypeCounts).toEqual({})
  })

  test("#given file events across paths → groups by path with latest metadata", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000001",
        timestamp: "2025-08-01T09:00:00.000Z",
        type: "file.created",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/a.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000002",
        timestamp: "2025-08-01T10:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 80,
        data: { path: "docs/a.md", diff_summary: "Added summary" },
      }),
      makeEvent({
        id: "01HY0000000000000000000003",
        timestamp: "2025-08-01T11:00:00.000Z",
        type: "file.deleted",
        source: "thalamus",
        priority: 40,
        data: { path: "docs/b.md" },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.fileActivities).toHaveLength(2)

    const aActivity = result.fileActivities.find(activity => activity.path === "docs/a.md")
    expect(aActivity).toBeDefined()
    expect(aActivity?.eventCount).toBe(2)
    expect(aActivity?.maxPriority).toBe(80)
    expect(aActivity?.lastEventTime).toBe("2025-08-01T10:00:00.000Z")
    expect(aActivity?.latestDiffSummary).toBe("Added summary")
    expect(aActivity?.types).toEqual(new Set(["file.created", "file.modified"]))
  })

  test("#given same-recency paths → sorts file activities by frequency descending", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000010",
        timestamp: "2025-08-01T12:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 10,
        data: { path: "docs/high-frequency.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000011",
        timestamp: "2025-08-01T12:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 15,
        data: { path: "docs/high-frequency.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000012",
        timestamp: "2025-08-01T12:00:00.000Z",
        type: "file.created",
        source: "thalamus",
        priority: 99,
        data: { path: "docs/low-frequency.md" },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.fileActivities).toHaveLength(2)
    expect(result.fileActivities[0].path).toBe("docs/high-frequency.md")
    expect(result.fileActivities[0].eventCount).toBe(2)
    expect(result.fileActivities[1].path).toBe("docs/low-frequency.md")
    expect(result.fileActivities[1].maxPriority).toBe(99)
  })

  test("#given decision session entries → extracts decisions with defaults", () => {
    // #given
    const aggregator = createEventAggregator()
    const sessionEntries: SessionEntry[] = [
      {
        type: "decision",
        content: "Use adapter pattern",
        timestamp: "2025-08-01T10:00:00.000Z",
      },
      {
        type: "decision",
        content: "Keep retries at 3",
        timestamp: "2025-08-01T12:00:00.000Z",
        reasoning: "Matches SLO behavior",
        confidence: "high",
      },
    ]

    // #when
    const result = aggregator.aggregate([], sessionEntries)

    // #then
    expect(result.decisions).toEqual([
      {
        timestamp: "2025-08-01T12:00:00.000Z",
        decision: "Keep retries at 3",
        reasoning: "Matches SLO behavior",
        confidence: "high",
      },
      {
        timestamp: "2025-08-01T10:00:00.000Z",
        decision: "Use adapter pattern",
        reasoning: "No reasoning",
        confidence: "medium",
      },
    ])
  })

  test("#given duplicate scratch entries → deduplicates and keeps earliest", () => {
    // #given
    const aggregator = createEventAggregator()
    const sessionEntries: SessionEntry[] = [
      {
        type: "scratch",
        content: "Remember to update metrics",
        timestamp: "2025-08-01T09:00:00.000Z",
      },
      {
        type: "scratch",
        content: "Remember to update metrics",
        timestamp: "2025-08-01T10:00:00.000Z",
      },
      {
        type: "scratch",
        content: "Check indexing backfill",
        timestamp: "2025-08-01T11:00:00.000Z",
      },
    ]

    // #when
    const result = aggregator.aggregate([], sessionEntries)

    // #then
    expect(result.scratchEntries).toEqual([
      "Remember to update metrics",
      "Check indexing backfill",
    ])
  })

  test("#given search events → extracts query and results count from metadata", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000020",
        timestamp: "2025-08-01T09:30:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 30,
        data: {
          metadata: {
            query: "memory compaction",
            results_count: 5,
          },
        },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.searchActivities).toEqual([
      {
        query: "memory compaction",
        resultsCount: 5,
        timestamp: "2025-08-01T09:30:00.000Z",
      },
    ])
  })

  test("#given repeated searches in 60s → deduplicates by query and keeps latest", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000030",
        timestamp: "2025-08-01T09:00:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 20,
        data: { metadata: { query: "akasha", results_count: 2 } },
      }),
      makeEvent({
        id: "01HY0000000000000000000031",
        timestamp: "2025-08-01T09:00:45.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 20,
        data: { metadata: { query: "akasha", results_count: 7 } },
      }),
      makeEvent({
        id: "01HY0000000000000000000032",
        timestamp: "2025-08-01T09:02:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 20,
        data: { metadata: { query: "akasha", results_count: 3 } },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.searchActivities).toEqual([
      {
        query: "akasha",
        resultsCount: 7,
        timestamp: "2025-08-01T09:00:45.000Z",
      },
      {
        query: "akasha",
        resultsCount: 3,
        timestamp: "2025-08-01T09:02:00.000Z",
      },
    ])
  })

  test("#given mixed event types → computes eventTypeCounts correctly", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000040",
        timestamp: "2025-08-01T09:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/a.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000041",
        timestamp: "2025-08-01T09:01:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/b.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000042",
        timestamp: "2025-08-01T09:02:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 20,
        data: { metadata: { query: "docs", results_count: 4 } },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.eventTypeCounts).toEqual({
      "file.modified": 2,
      "search.performed": 1,
    })
    expect(result.totalEvents).toBe(3)
  })

  test("#given unsorted timestamps → computes time range from earliest to latest", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000050",
        timestamp: "2025-08-01T11:00:00.000Z",
        type: "file.created",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/a.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000051",
        timestamp: "2025-08-01T08:30:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/a.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000052",
        timestamp: "2025-08-01T10:15:00.000Z",
        type: "file.deleted",
        source: "thalamus",
        priority: 20,
        data: { path: "docs/a.md" },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.timeRange).toEqual({
      from: "2025-08-01T08:30:00.000Z",
      to: "2025-08-01T11:00:00.000Z",
    })
  })

  test("#given mixed events and entries → aggregates all sections together", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000060",
        timestamp: "2025-08-01T09:00:00.000Z",
        type: "file.renamed",
        source: "thalamus",
        priority: 55,
        data: { path: "docs/renamed.md", diff_summary: "Renamed from docs/old.md" },
      }),
      makeEvent({
        id: "01HY0000000000000000000061",
        timestamp: "2025-08-01T09:05:00.000Z",
        type: "search.performed",
        source: "cortex",
        priority: 25,
        data: { metadata: { query: "renamed", results_count: 1 } },
      }),
    ]
    const sessionEntries: SessionEntry[] = [
      {
        type: "decision",
        content: "Keep rename history",
        timestamp: "2025-08-01T09:06:00.000Z",
        confidence: "low",
      },
      {
        type: "scratch",
        content: "follow up on references",
        timestamp: "2025-08-01T09:07:00.000Z",
      },
    ]

    // #when
    const result = aggregator.aggregate(events, sessionEntries)

    // #then
    expect(result.fileActivities).toHaveLength(1)
    expect(result.searchActivities).toHaveLength(1)
    expect(result.decisions).toHaveLength(1)
    expect(result.scratchEntries).toEqual(["follow up on references"])
    expect(result.eventTypeCounts).toEqual({
      "file.renamed": 1,
      "search.performed": 1,
    })
  })

  test("#given file events missing data.path → skips file activity aggregation", () => {
    // #given
    const aggregator = createEventAggregator()
    const events: AkashicEvent[] = [
      makeEvent({
        id: "01HY0000000000000000000070",
        timestamp: "2025-08-01T09:00:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: {},
      }),
      makeEvent({
        id: "01HY0000000000000000000071",
        timestamp: "2025-08-01T09:01:00.000Z",
        type: "file.modified",
        source: "thalamus",
        priority: 30,
        data: { path: "docs/real.md" },
      }),
    ]

    // #when
    const result = aggregator.aggregate(events, [])

    // #then
    expect(result.fileActivities).toHaveLength(1)
    expect(result.fileActivities[0].path).toBe("docs/real.md")
  })
})
