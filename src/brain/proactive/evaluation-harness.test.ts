import { test, expect, describe } from "bun:test"
import {
  createEvaluationHarness,
  type CommitmentFixtureInput,
  type DecisionReversalFixtureInput,
} from "./evaluation-harness"

function perfectCommitmentDetector(input: CommitmentFixtureInput): boolean {
  if (input.status === "done" || input.status === "cancelled") {
    return false
  }

  if (input.status === "overdue") {
    return true
  }

  if (!input.due_date) {
    return false
  }

  const dueDateMs = new Date(input.due_date).getTime()
  const nowMs = new Date(input.current_date).getTime()
  if (Number.isNaN(dueDateMs) || Number.isNaN(nowMs)) {
    return false
  }

  return dueDateMs < nowMs
}

function alwaysFalseCommitmentDetector(): boolean {
  return false
}

function deterministicCommitmentDetector(input: CommitmentFixtureInput): boolean {
  const seed = `${input.description}|${input.assigned_to}|${input.status}|${input.current_date}`
  let score = 0
  for (const char of seed) {
    score += char.charCodeAt(0)
  }
  return score % 2 === 0
}

function perfectDecisionDetector(input: DecisionReversalFixtureInput): string[] {
  return [...input.expected_reversals]
}

function alwaysEmptyDecisionDetector(): string[] {
  return []
}

function deterministicDecisionDetector(input: DecisionReversalFixtureInput): string[] {
  return input.decisions
    .filter(decision => decision.id.charCodeAt(decision.id.length - 1) % 2 === 0)
    .map(decision => decision.id)
}

describe("brain/proactive/evaluation-harness fixtures", () => {
  const harness = createEvaluationHarness()
  const commitmentFixtures = harness.getCommitmentFixtures()
  const decisionFixtures = harness.getDecisionReversalFixtures()

  test("#given commitment fixtures #when reading list #then contains at least 20 fixtures", () => {
    expect(commitmentFixtures.length).toBeGreaterThanOrEqual(20)
  })

  test("#given decision fixtures #when reading list #then contains at least 10 fixtures", () => {
    expect(decisionFixtures.length).toBeGreaterThanOrEqual(10)
  })

  test("#given commitment fixtures #when mapping fixture ids #then all ids are unique", () => {
    const ids = commitmentFixtures.map(fixture => fixture.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("#given decision fixtures #when mapping fixture ids #then all ids are unique", () => {
    const ids = decisionFixtures.map(fixture => fixture.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("#given commitment fixtures #when grouping by category #then each required category is represented", () => {
    const categories = new Set(commitmentFixtures.map(fixture => fixture.category))
    expect(categories.has("clear_overdue")).toBe(true)
    expect(categories.has("recently_overdue")).toBe(true)
    expect(categories.has("future_due")).toBe(true)
    expect(categories.has("no_due_date")).toBe(true)
    expect(categories.has("completed")).toBe(true)
    expect(categories.has("cancelled")).toBe(true)
    expect(categories.has("edge_case")).toBe(true)
    expect(categories.has("false_positive_candidate")).toBe(true)
  })

  test("#given decision fixtures #when grouping by category #then each required category is represented", () => {
    const categories = new Set(decisionFixtures.map(fixture => fixture.category))
    expect(categories.has("explicit_reversal")).toBe(true)
    expect(categories.has("implicit_reversal")).toBe(true)
    expect(categories.has("no_reversal")).toBe(true)
    expect(categories.has("false_positive_candidate")).toBe(true)
  })

  test("#given commitment fixtures #when filtering clear overdue #then includes at least 5 positives", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "clear_overdue")
    expect(fixtures.length).toBeGreaterThanOrEqual(5)
    expect(fixtures.every(fixture => fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering recently overdue #then includes at least 3 positives", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "recently_overdue")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
    expect(fixtures.every(fixture => fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering future due #then all are negative", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "future_due")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
    expect(fixtures.every(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering no_due_date #then includes both positive and negative labels", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "no_due_date")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
    expect(fixtures.some(fixture => fixture.expected_detected)).toBe(true)
    expect(fixtures.some(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering completed #then all are negative", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "completed")
    expect(fixtures.length).toBeGreaterThanOrEqual(2)
    expect(fixtures.every(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering cancelled #then all are negative", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "cancelled")
    expect(fixtures.length).toBeGreaterThanOrEqual(2)
    expect(fixtures.every(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given commitment fixtures #when filtering edge cases #then includes at least three fixtures", () => {
    const fixtures = commitmentFixtures.filter(fixture => fixture.category === "edge_case")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
  })

  test("#given decision fixtures #when filtering explicit reversal #then includes at least 3 positives", () => {
    const fixtures = decisionFixtures.filter(fixture => fixture.category === "explicit_reversal")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
    expect(fixtures.every(fixture => fixture.expected_detected)).toBe(true)
  })

  test("#given decision fixtures #when filtering implicit reversal #then includes at least 3 positives", () => {
    const fixtures = decisionFixtures.filter(fixture => fixture.category === "implicit_reversal")
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
    expect(fixtures.every(fixture => fixture.expected_detected)).toBe(true)
  })

  test("#given decision fixtures #when filtering no reversal #then includes at least 2 negatives", () => {
    const fixtures = decisionFixtures.filter(fixture => fixture.category === "no_reversal")
    expect(fixtures.length).toBeGreaterThanOrEqual(2)
    expect(fixtures.every(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given decision fixtures #when filtering false positive candidates #then includes at least 2 negatives", () => {
    const fixtures = decisionFixtures.filter(fixture => fixture.category === "false_positive_candidate")
    expect(fixtures.length).toBeGreaterThanOrEqual(2)
    expect(fixtures.every(fixture => !fixture.expected_detected)).toBe(true)
  })

  test("#given decision fixtures #when validating labels #then expected_detected matches expected_reversals", () => {
    for (const fixture of decisionFixtures) {
      expect(fixture.expected_detected).toBe(fixture.input.expected_reversals.length > 0)
    }
  })

  test("#given decision fixtures #when validating expected ids #then expected reversals are all in decisions", () => {
    for (const fixture of decisionFixtures) {
      const decisionIds = new Set(fixture.input.decisions.map(decision => decision.id))
      for (const reversalId of fixture.input.expected_reversals) {
        expect(decisionIds.has(reversalId)).toBe(true)
      }
    }
  })

  test("#given commitment fixtures #when status is done or cancelled #then label is always negative", () => {
    for (const fixture of commitmentFixtures) {
      if (fixture.input.status === "done" || fixture.input.status === "cancelled") {
        expect(fixture.expected_detected).toBe(false)
      }
    }
  })

  test("#given commitment fixtures #when no due date and pending #then label is negative", () => {
    for (const fixture of commitmentFixtures) {
      if (!fixture.input.due_date && fixture.input.status === "pending") {
        expect(fixture.expected_detected).toBe(false)
      }
    }
  })

  test("#given commitment fixtures #when no due date and overdue #then label is positive", () => {
    for (const fixture of commitmentFixtures) {
      if (!fixture.input.due_date && fixture.input.status === "overdue") {
        expect(fixture.expected_detected).toBe(true)
      }
    }
  })

  test("#given harness fixtures #when mutating returned copies #then internal fixtures remain unchanged", () => {
    const mutableCommitments = harness.getCommitmentFixtures()
    const mutableDecisions = harness.getDecisionReversalFixtures()

    mutableCommitments[0]!.id = "mutated-id"
    mutableDecisions[0]!.input.decisions[0]!.title = "Mutated title"

    const freshCommitments = harness.getCommitmentFixtures()
    const freshDecisions = harness.getDecisionReversalFixtures()

    expect(freshCommitments[0]!.id).not.toBe("mutated-id")
    expect(freshDecisions[0]!.input.decisions[0]!.title).not.toBe("Mutated title")
  })
})

describe("brain/proactive/evaluation-harness metrics", () => {
  const harness = createEvaluationHarness()

  test("#given all metric counts as zero #when calculateMetrics #then returns zero precision recall and f1", () => {
    const result = harness.calculateMetrics(0, 0, 0, 0)
    expect(result.total).toBe(0)
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.f1_score).toBe(0)
  })

  test("#given perfect classification counts #when calculateMetrics #then all metrics equal 1", () => {
    const result = harness.calculateMetrics(5, 0, 7, 0)
    expect(result.total).toBe(12)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1_score).toBe(1)
  })

  test("#given no predicted positives #when calculateMetrics #then precision is zero", () => {
    const result = harness.calculateMetrics(0, 0, 5, 3)
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.f1_score).toBe(0)
  })

  test("#given only false positives #when calculateMetrics #then precision and f1 are zero", () => {
    const result = harness.calculateMetrics(0, 4, 2, 0)
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.f1_score).toBe(0)
  })

  test("#given mixed counts #when calculateMetrics #then computes expected decimal metrics", () => {
    const result = harness.calculateMetrics(8, 2, 5, 5)
    expect(result.total).toBe(20)
    expect(result.precision).toBeCloseTo(0.8)
    expect(result.recall).toBeCloseTo(8 / 13)
    expect(result.f1_score).toBeCloseTo((2 * 0.8 * (8 / 13)) / (0.8 + (8 / 13)))
  })
})

describe("brain/proactive/evaluation-harness evaluation", () => {
  const harness = createEvaluationHarness()

  test("#given perfect commitment detector #when evaluateCommitmentDetection #then returns perfect precision and recall", () => {
    const result = harness.evaluateCommitmentDetection(perfectCommitmentDetector)
    expect(result.total).toBe(harness.getCommitmentFixtures().length)
    expect(result.true_positives).toBeGreaterThan(0)
    expect(result.true_negatives).toBeGreaterThan(0)
    expect(result.false_positives).toBe(0)
    expect(result.false_negatives).toBe(0)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1_score).toBe(1)
  })

  test("#given null commitment detector #when evaluateCommitmentDetection #then precision and recall are zero", () => {
    const result = harness.evaluateCommitmentDetection(alwaysFalseCommitmentDetector)
    expect(result.total).toBe(harness.getCommitmentFixtures().length)
    expect(result.true_positives).toBe(0)
    expect(result.false_positives).toBe(0)
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.f1_score).toBe(0)
  })

  test("#given deterministic commitment detector #when evaluateCommitmentDetection #then evaluates without runtime errors", () => {
    const result = harness.evaluateCommitmentDetection(deterministicCommitmentDetector)
    expect(result.total).toBe(harness.getCommitmentFixtures().length)
    expect(result.total).toBe(
      result.true_positives + result.false_positives + result.true_negatives + result.false_negatives,
    )
    expect(result.precision).toBeGreaterThanOrEqual(0)
    expect(result.precision).toBeLessThanOrEqual(1)
    expect(result.recall).toBeGreaterThanOrEqual(0)
    expect(result.recall).toBeLessThanOrEqual(1)
  })

  test("#given perfect decision detector #when evaluateDecisionReversalDetection #then returns perfect precision and recall", () => {
    const result = harness.evaluateDecisionReversalDetection(perfectDecisionDetector)
    expect(result.true_positives).toBeGreaterThan(0)
    expect(result.false_positives).toBe(0)
    expect(result.false_negatives).toBe(0)
    expect(result.precision).toBe(1)
    expect(result.recall).toBe(1)
    expect(result.f1_score).toBe(1)
  })

  test("#given null decision detector #when evaluateDecisionReversalDetection #then recall is zero", () => {
    const result = harness.evaluateDecisionReversalDetection(alwaysEmptyDecisionDetector)
    expect(result.true_positives).toBe(0)
    expect(result.false_positives).toBe(0)
    expect(result.false_negatives).toBeGreaterThan(0)
    expect(result.precision).toBe(0)
    expect(result.recall).toBe(0)
    expect(result.f1_score).toBe(0)
  })

  test("#given deterministic decision detector #when evaluateDecisionReversalDetection #then evaluates without runtime errors", () => {
    const result = harness.evaluateDecisionReversalDetection(deterministicDecisionDetector)
    expect(result.total).toBeGreaterThan(0)
    expect(result.total).toBe(
      result.true_positives + result.false_positives + result.true_negatives + result.false_negatives,
    )
    expect(result.precision).toBeGreaterThanOrEqual(0)
    expect(result.precision).toBeLessThanOrEqual(1)
    expect(result.recall).toBeGreaterThanOrEqual(0)
    expect(result.recall).toBeLessThanOrEqual(1)
  })

  test("#given decision fixtures #when summing decisions #then evaluation total equals number of scored decisions", () => {
    const expectedTotal = harness
      .getDecisionReversalFixtures()
      .reduce((sum, fixture) => sum + fixture.input.decisions.length, 0)
    const result = harness.evaluateDecisionReversalDetection(alwaysEmptyDecisionDetector)
    expect(result.total).toBe(expectedTotal)
  })

  test("#given commitment fixtures #when evaluating always true detector #then creates both false positives and true positives", () => {
    const result = harness.evaluateCommitmentDetection(() => true)
    expect(result.true_positives).toBeGreaterThan(0)
    expect(result.false_positives).toBeGreaterThan(0)
    expect(result.true_negatives).toBe(0)
  })
})
