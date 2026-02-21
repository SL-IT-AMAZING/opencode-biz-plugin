/**
 * A deterministic labeled fixture used for trigger evaluation.
 */
export interface LabeledFixture<T> {
  id: string
  description: string
  input: T
  expected_detected: boolean
  category: string
}

/**
 * Input shape for commitment_overdue evaluation fixtures.
 */
export interface CommitmentFixtureInput {
  description: string
  assigned_to: string
  due_date?: string
  status: "pending" | "in_progress" | "done" | "overdue" | "cancelled"
  created_at: string
  current_date: string
}

/**
 * Input shape for decision_reversal evaluation fixtures.
 */
export interface DecisionReversalFixtureInput {
  decisions: Array<{
    id: string
    title: string
    decision: string
    status: "proposed" | "decided" | "implemented" | "reversed"
    timestamp: string
  }>
  expected_reversals: string[]
}

/**
 * Standard classification metrics for detector evaluation.
 */
export interface EvaluationResult {
  total: number
  true_positives: number
  false_positives: number
  true_negatives: number
  false_negatives: number
  precision: number
  recall: number
  f1_score: number
}

/**
 * Harness API for evaluating proactive trigger detectors.
 */
export interface EvaluationHarness {
  getCommitmentFixtures(): LabeledFixture<CommitmentFixtureInput>[]
  getDecisionReversalFixtures(): LabeledFixture<DecisionReversalFixtureInput>[]
  evaluateCommitmentDetection(
    detector: (input: CommitmentFixtureInput) => boolean,
  ): EvaluationResult
  evaluateDecisionReversalDetection(
    detector: (input: DecisionReversalFixtureInput) => string[],
  ): EvaluationResult
  calculateMetrics(tp: number, fp: number, tn: number, fn: number): EvaluationResult
}

const commitmentFixtures: LabeledFixture<CommitmentFixtureInput>[] = [
  {
    id: "commitment-clear-overdue-1",
    description: "Past due by several days while still pending",
    category: "clear_overdue",
    expected_detected: true,
    input: {
      description: "Ship monthly release notes",
      assigned_to: "alice",
      due_date: "2026-01-10T10:00:00.000Z",
      status: "pending",
      created_at: "2026-01-02T09:00:00.000Z",
      current_date: "2026-01-20T09:00:00.000Z",
    },
  },
  {
    id: "commitment-clear-overdue-2",
    description: "In-progress work far past due date",
    category: "clear_overdue",
    expected_detected: true,
    input: {
      description: "Finalize migration checklist",
      assigned_to: "bob",
      due_date: "2026-02-01T12:00:00.000Z",
      status: "in_progress",
      created_at: "2026-01-20T08:00:00.000Z",
      current_date: "2026-02-15T08:00:00.000Z",
    },
  },
  {
    id: "commitment-clear-overdue-3",
    description: "Pending commitment missed by one week",
    category: "clear_overdue",
    expected_detected: true,
    input: {
      description: "Prepare postmortem draft",
      assigned_to: "carol",
      due_date: "2026-03-01T18:00:00.000Z",
      status: "pending",
      created_at: "2026-02-20T16:00:00.000Z",
      current_date: "2026-03-08T16:00:00.000Z",
    },
  },
  {
    id: "commitment-clear-overdue-4",
    description: "In-progress item overdue by months",
    category: "clear_overdue",
    expected_detected: true,
    input: {
      description: "Refactor event indexing",
      assigned_to: "david",
      due_date: "2025-11-30T23:00:00.000Z",
      status: "in_progress",
      created_at: "2025-10-10T09:30:00.000Z",
      current_date: "2026-02-20T09:30:00.000Z",
    },
  },
  {
    id: "commitment-clear-overdue-5",
    description: "Pending task with old due date",
    category: "clear_overdue",
    expected_detected: true,
    input: {
      description: "Update incident runbook",
      assigned_to: "erin",
      due_date: "2026-02-10T07:00:00.000Z",
      status: "pending",
      created_at: "2026-02-01T07:00:00.000Z",
      current_date: "2026-02-18T07:00:00.000Z",
    },
  },
  {
    id: "commitment-recently-overdue-1",
    description: "One day overdue and still pending",
    category: "recently_overdue",
    expected_detected: true,
    input: {
      description: "Review dependency updates",
      assigned_to: "frank",
      due_date: "2026-04-10T09:00:00.000Z",
      status: "pending",
      created_at: "2026-04-01T09:00:00.000Z",
      current_date: "2026-04-11T09:00:00.000Z",
    },
  },
  {
    id: "commitment-recently-overdue-2",
    description: "Two days overdue while in progress",
    category: "recently_overdue",
    expected_detected: true,
    input: {
      description: "Publish schema migration plan",
      assigned_to: "gina",
      due_date: "2026-04-20T14:00:00.000Z",
      status: "in_progress",
      created_at: "2026-04-12T10:00:00.000Z",
      current_date: "2026-04-22T14:00:00.000Z",
    },
  },
  {
    id: "commitment-recently-overdue-3",
    description: "Just overdue by one day",
    category: "recently_overdue",
    expected_detected: true,
    input: {
      description: "Clean stale feature flags",
      assigned_to: "harper",
      due_date: "2026-05-01T00:00:00.000Z",
      status: "pending",
      created_at: "2026-04-20T00:00:00.000Z",
      current_date: "2026-05-02T00:00:00.000Z",
    },
  },
  {
    id: "commitment-future-due-1",
    description: "Far-future due date should not trigger",
    category: "future_due",
    expected_detected: false,
    input: {
      description: "Plan Q4 roadmap",
      assigned_to: "iris",
      due_date: "2026-10-01T12:00:00.000Z",
      status: "pending",
      created_at: "2026-06-01T12:00:00.000Z",
      current_date: "2026-06-05T12:00:00.000Z",
    },
  },
  {
    id: "commitment-future-due-2",
    description: "In-progress with due date next month",
    category: "future_due",
    expected_detected: false,
    input: {
      description: "Draft security training notes",
      assigned_to: "jules",
      due_date: "2026-07-30T08:00:00.000Z",
      status: "in_progress",
      created_at: "2026-07-01T08:00:00.000Z",
      current_date: "2026-07-05T08:00:00.000Z",
    },
  },
  {
    id: "commitment-future-due-3",
    description: "Pending commitment due in the future",
    category: "future_due",
    expected_detected: false,
    input: {
      description: "Prepare design system audit",
      assigned_to: "kai",
      due_date: "2026-09-15T16:00:00.000Z",
      status: "pending",
      created_at: "2026-09-01T16:00:00.000Z",
      current_date: "2026-09-05T16:00:00.000Z",
    },
  },
  {
    id: "commitment-no-due-overdue-1",
    description: "Explicit overdue status without due date",
    category: "no_due_date",
    expected_detected: true,
    input: {
      description: "Follow up with vendor",
      assigned_to: "liam",
      status: "overdue",
      created_at: "2026-03-01T08:30:00.000Z",
      current_date: "2026-03-20T08:30:00.000Z",
    },
  },
  {
    id: "commitment-no-due-overdue-2",
    description: "Overdue status with no date metadata",
    category: "no_due_date",
    expected_detected: true,
    input: {
      description: "Escalate unresolved support issue",
      assigned_to: "maya",
      status: "overdue",
      created_at: "2026-01-25T10:00:00.000Z",
      current_date: "2026-02-12T10:00:00.000Z",
    },
  },
  {
    id: "commitment-no-due-pending-1",
    description: "No due date and still pending should not trigger",
    category: "no_due_date",
    expected_detected: false,
    input: {
      description: "Collect team retrospectives",
      assigned_to: "noah",
      status: "pending",
      created_at: "2026-03-05T11:00:00.000Z",
      current_date: "2026-03-07T11:00:00.000Z",
    },
  },
  {
    id: "commitment-completed-1",
    description: "Done commitment with old due date should not trigger",
    category: "completed",
    expected_detected: false,
    input: {
      description: "Close sprint board",
      assigned_to: "olivia",
      due_date: "2026-04-01T17:00:00.000Z",
      status: "done",
      created_at: "2026-03-20T09:00:00.000Z",
      current_date: "2026-04-10T09:00:00.000Z",
    },
  },
  {
    id: "commitment-completed-2",
    description: "Completed after due date but not overdue now",
    category: "completed",
    expected_detected: false,
    input: {
      description: "Rotate API credentials",
      assigned_to: "peter",
      due_date: "2026-06-01T10:00:00.000Z",
      status: "done",
      created_at: "2026-05-15T10:00:00.000Z",
      current_date: "2026-06-10T10:00:00.000Z",
    },
  },
  {
    id: "commitment-cancelled-1",
    description: "Cancelled task with past due date should not trigger",
    category: "cancelled",
    expected_detected: false,
    input: {
      description: "Migrate legacy webhook",
      assigned_to: "quinn",
      due_date: "2026-02-05T13:00:00.000Z",
      status: "cancelled",
      created_at: "2026-01-10T13:00:00.000Z",
      current_date: "2026-02-20T13:00:00.000Z",
    },
  },
  {
    id: "commitment-cancelled-2",
    description: "Cancelled without due date should not trigger",
    category: "cancelled",
    expected_detected: false,
    input: {
      description: "Archive deprecated dashboard",
      assigned_to: "riley",
      status: "cancelled",
      created_at: "2026-03-01T15:00:00.000Z",
      current_date: "2026-03-12T15:00:00.000Z",
    },
  },
  {
    id: "commitment-edge-today-due",
    description: "Due today should be treated as not overdue",
    category: "edge_case",
    expected_detected: false,
    input: {
      description: "Review quarterly OKRs",
      assigned_to: "sasha",
      due_date: "2026-08-10T09:00:00.000Z",
      status: "pending",
      created_at: "2026-08-01T09:00:00.000Z",
      current_date: "2026-08-10T09:00:00.000Z",
    },
  },
  {
    id: "commitment-edge-just-completed",
    description: "Recently completed item remains non-overdue",
    category: "edge_case",
    expected_detected: false,
    input: {
      description: "Ship API telemetry dashboard",
      assigned_to: "taylor",
      due_date: "2026-07-01T09:00:00.000Z",
      status: "done",
      created_at: "2026-06-10T09:00:00.000Z",
      current_date: "2026-07-02T09:00:00.000Z",
    },
  },
  {
    id: "commitment-edge-overdue-future-date",
    description: "Inconsistent overdue status should still be detected",
    category: "edge_case",
    expected_detected: true,
    input: {
      description: "Reconcile backlog labels",
      assigned_to: "uma",
      due_date: "2026-12-01T09:00:00.000Z",
      status: "overdue",
      created_at: "2026-06-01T09:00:00.000Z",
      current_date: "2026-06-02T09:00:00.000Z",
    },
  },
  {
    id: "commitment-edge-invalid-date-overdue",
    description: "Invalid due date format with overdue status",
    category: "edge_case",
    expected_detected: true,
    input: {
      description: "Fix malformed due date in source",
      assigned_to: "victor",
      due_date: "not-a-date",
      status: "overdue",
      created_at: "2026-04-01T10:00:00.000Z",
      current_date: "2026-04-05T10:00:00.000Z",
    },
  },
  {
    id: "commitment-false-positive-candidate-1",
    description: "Pending old task without due date should not trigger",
    category: "false_positive_candidate",
    expected_detected: false,
    input: {
      description: "Investigate optional enhancement",
      assigned_to: "wendy",
      status: "pending",
      created_at: "2025-12-01T09:00:00.000Z",
      current_date: "2026-07-01T09:00:00.000Z",
    },
  },
]

const decisionReversalFixtures: LabeledFixture<DecisionReversalFixtureInput>[] = [
  {
    id: "decision-explicit-reversal-1",
    description: "Single explicit reversed decision",
    category: "explicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-exp-1",
          title: "Adopt Redis cache",
          decision: "Use Redis for session cache",
          status: "reversed",
          timestamp: "2026-02-01T10:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-exp-1"],
    },
  },
  {
    id: "decision-explicit-reversal-2",
    description: "Explicit reversal among active decisions",
    category: "explicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-exp-2a",
          title: "Roll out feature flags",
          decision: "Enable by default",
          status: "implemented",
          timestamp: "2026-03-02T11:00:00.000Z",
        },
        {
          id: "dr-exp-2b",
          title: "Roll out feature flags",
          decision: "Disable rollout pending incident review",
          status: "reversed",
          timestamp: "2026-03-08T11:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-exp-2b"],
    },
  },
  {
    id: "decision-explicit-reversal-3",
    description: "Two explicit reversed records",
    category: "explicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-exp-3a",
          title: "Migrate CI provider",
          decision: "Move to Provider A",
          status: "reversed",
          timestamp: "2026-01-15T09:00:00.000Z",
        },
        {
          id: "dr-exp-3b",
          title: "Revert CI provider migration",
          decision: "Stay on existing provider",
          status: "reversed",
          timestamp: "2026-01-20T09:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-exp-3a", "dr-exp-3b"],
    },
  },
  {
    id: "decision-implicit-reversal-1",
    description: "Same topic with conflicting platform decisions",
    category: "implicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-imp-1a",
          title: "Database strategy",
          decision: "Use PostgreSQL",
          status: "implemented",
          timestamp: "2026-04-01T09:00:00.000Z",
        },
        {
          id: "dr-imp-1b",
          title: "Database strategy",
          decision: "Switch to MySQL",
          status: "decided",
          timestamp: "2026-04-10T09:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-imp-1a", "dr-imp-1b"],
    },
  },
  {
    id: "decision-implicit-reversal-2",
    description: "Conflicting auth approach on same title",
    category: "implicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-imp-2a",
          title: "User authentication flow",
          decision: "Use OAuth only",
          status: "decided",
          timestamp: "2026-05-01T10:00:00.000Z",
        },
        {
          id: "dr-imp-2b",
          title: "User authentication flow",
          decision: "Use passwordless email links",
          status: "implemented",
          timestamp: "2026-05-12T10:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-imp-2a", "dr-imp-2b"],
    },
  },
  {
    id: "decision-implicit-reversal-3",
    description: "Deployment policy changed from manual to automated",
    category: "implicit_reversal",
    expected_detected: true,
    input: {
      decisions: [
        {
          id: "dr-imp-3a",
          title: "Production deployment policy",
          decision: "Manual approval required",
          status: "implemented",
          timestamp: "2026-06-01T08:00:00.000Z",
        },
        {
          id: "dr-imp-3b",
          title: "Production deployment policy",
          decision: "Automated deployment on green tests",
          status: "decided",
          timestamp: "2026-06-18T08:00:00.000Z",
        },
      ],
      expected_reversals: ["dr-imp-3a", "dr-imp-3b"],
    },
  },
  {
    id: "decision-no-reversal-1",
    description: "Different topics with unrelated decisions",
    category: "no_reversal",
    expected_detected: false,
    input: {
      decisions: [
        {
          id: "dr-none-1a",
          title: "Logging format",
          decision: "Use JSON logs",
          status: "implemented",
          timestamp: "2026-02-04T10:00:00.000Z",
        },
        {
          id: "dr-none-1b",
          title: "Incident escalation policy",
          decision: "Escalate after 30 minutes",
          status: "decided",
          timestamp: "2026-02-05T10:00:00.000Z",
        },
      ],
      expected_reversals: [],
    },
  },
  {
    id: "decision-no-reversal-2",
    description: "Single stable decision record",
    category: "no_reversal",
    expected_detected: false,
    input: {
      decisions: [
        {
          id: "dr-none-2a",
          title: "Adopt trunk-based development",
          decision: "Merge to main daily",
          status: "implemented",
          timestamp: "2026-07-02T09:00:00.000Z",
        },
      ],
      expected_reversals: [],
    },
  },
  {
    id: "decision-false-positive-candidate-1",
    description: "Similar title but same decision content",
    category: "false_positive_candidate",
    expected_detected: false,
    input: {
      decisions: [
        {
          id: "dr-fp-1a",
          title: "Caching policy for API",
          decision: "Cache responses for 5 minutes",
          status: "decided",
          timestamp: "2026-08-01T09:00:00.000Z",
        },
        {
          id: "dr-fp-1b",
          title: "Caching policy for API v2",
          decision: "Cache responses for 5 minutes",
          status: "implemented",
          timestamp: "2026-08-10T09:00:00.000Z",
        },
      ],
      expected_reversals: [],
    },
  },
  {
    id: "decision-false-positive-candidate-2",
    description: "Consistent decision progression should not trigger",
    category: "false_positive_candidate",
    expected_detected: false,
    input: {
      decisions: [
        {
          id: "dr-fp-2a",
          title: "Error budget policy",
          decision: "Use 99.9% target",
          status: "proposed",
          timestamp: "2026-09-01T10:00:00.000Z",
        },
        {
          id: "dr-fp-2b",
          title: "Error budget policy",
          decision: "Use 99.9% target",
          status: "decided",
          timestamp: "2026-09-05T10:00:00.000Z",
        },
      ],
      expected_reversals: [],
    },
  },
  {
    id: "decision-false-positive-candidate-3",
    description: "Repeated implementation note with no contradiction",
    category: "false_positive_candidate",
    expected_detected: false,
    input: {
      decisions: [
        {
          id: "dr-fp-3a",
          title: "Monitoring dashboard scope",
          decision: "Track latency and errors",
          status: "decided",
          timestamp: "2026-10-01T12:00:00.000Z",
        },
        {
          id: "dr-fp-3b",
          title: "Monitoring dashboard scope",
          decision: "Track latency and errors",
          status: "implemented",
          timestamp: "2026-10-08T12:00:00.000Z",
        },
      ],
      expected_reversals: [],
    },
  },
]

function cloneCommitmentFixture(
  fixture: LabeledFixture<CommitmentFixtureInput>,
): LabeledFixture<CommitmentFixtureInput> {
  return {
    ...fixture,
    input: {
      ...fixture.input,
    },
  }
}

function cloneDecisionFixture(
  fixture: LabeledFixture<DecisionReversalFixtureInput>,
): LabeledFixture<DecisionReversalFixtureInput> {
  return {
    ...fixture,
    input: {
      decisions: fixture.input.decisions.map(decision => ({ ...decision })),
      expected_reversals: [...fixture.input.expected_reversals],
    },
  }
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }
  return numerator / denominator
}

export function createEvaluationHarness(): EvaluationHarness {
  function calculateMetrics(tp: number, fp: number, tn: number, fn: number): EvaluationResult {
    const precision = safeDivide(tp, tp + fp)
    const recall = safeDivide(tp, tp + fn)
    const f1_score = safeDivide(2 * precision * recall, precision + recall)

    return {
      total: tp + fp + tn + fn,
      true_positives: tp,
      false_positives: fp,
      true_negatives: tn,
      false_negatives: fn,
      precision,
      recall,
      f1_score,
    }
  }

  function evaluateCommitmentDetection(
    detector: (input: CommitmentFixtureInput) => boolean,
  ): EvaluationResult {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    for (const fixture of commitmentFixtures) {
      const detected = detector({ ...fixture.input })
      const expected = fixture.expected_detected
      if (detected && expected) {
        tp += 1
      } else if (detected && !expected) {
        fp += 1
      } else if (!detected && expected) {
        fn += 1
      } else {
        tn += 1
      }
    }

    return calculateMetrics(tp, fp, tn, fn)
  }

  function evaluateDecisionReversalDetection(
    detector: (input: DecisionReversalFixtureInput) => string[],
  ): EvaluationResult {
    let tp = 0
    let fp = 0
    let tn = 0
    let fn = 0

    for (const fixture of decisionReversalFixtures) {
      const input: DecisionReversalFixtureInput = {
        decisions: fixture.input.decisions.map(decision => ({ ...decision })),
        expected_reversals: [...fixture.input.expected_reversals],
      }
      const detectedIds = new Set(detector(input))
      const expectedIds = new Set(fixture.input.expected_reversals)

      for (const decision of fixture.input.decisions) {
        const isExpected = expectedIds.has(decision.id)
        const isDetected = detectedIds.has(decision.id)
        if (isDetected && isExpected) {
          tp += 1
        } else if (isDetected && !isExpected) {
          fp += 1
        } else if (!isDetected && isExpected) {
          fn += 1
        } else {
          tn += 1
        }
      }
    }

    return calculateMetrics(tp, fp, tn, fn)
  }

  return {
    getCommitmentFixtures(): LabeledFixture<CommitmentFixtureInput>[] {
      return commitmentFixtures.map(cloneCommitmentFixture)
    },

    getDecisionReversalFixtures(): LabeledFixture<DecisionReversalFixtureInput>[] {
      return decisionReversalFixtures.map(cloneDecisionFixture)
    },

    evaluateCommitmentDetection,
    evaluateDecisionReversalDetection,
    calculateMetrics,
  }
}
