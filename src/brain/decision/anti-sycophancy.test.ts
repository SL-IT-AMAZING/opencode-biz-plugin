import { describe, expect, it } from "bun:test"
import { buildAntiSycophancyInstructions, detectSycophancy } from "./anti-sycophancy"
import { DEFAULT_ANTI_SYCOPHANCY_CONFIG, type AgentOutput } from "./types"

function makeOutput(role: AgentOutput["role"], content: string, keyPoints: string[]): AgentOutput {
  return {
    role,
    content,
    citations: [],
    key_points: keyPoints,
  }
}

describe("detectSycophancy", () => {
  it("flags high risk when all agents agree", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend we proceed now.", ["Recommend immediate launch"]),
      makeOutput("critic", "I recommend we proceed now as well.", ["I agree with the recommendation"]),
      makeOutput("synthesizer", "We should proceed with this plan.", ["Recommend immediate launch with confidence"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("high")
    expect(report.has_unanimous_agreement).toBe(true)
    expect(report.indicators.some((indicator) => indicator.type === "unanimous_agreement")).toBe(true)
  })

  it("returns low risk when critic provides strong objections", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend we proceed because adoption is high.", ["Recommend rollout this quarter"]),
      makeOutput("critic", "We should reject this timeline because the migration risk is unresolved and uncertain.", ["However, the rollout creates operational risk", "Uncertain integration cost could break budget"]),
      makeOutput("devils_advocate", "This may still fail if onboarding assumptions are wrong.", ["Unknown retention behavior may undercut value"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("low")
    expect(report.missing_counterarguments).toBe(false)
  })

  it("detects echo patterns as medium risk", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend rollout, but we must stage it carefully.", ["Staged rollout with pilot mitigates risk"]),
      makeOutput("critic", "We should avoid full rollout now because migration risk remains uncertain.", ["However, unresolved migration risk could delay launch"]),
      makeOutput("synthesizer", "The balanced path is a staged rollout using a pilot to mitigate risk.", ["Staged rollout with pilot mitigates risk and cost"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("medium")
    expect(report.indicators.some((indicator) => indicator.type === "echo_pattern")).toBe(true)
    expect(report.agreement_patterns.length).toBeGreaterThan(0)
  })

  it("detects weak criticism when critic content is too short", () => {
    const outputs: AgentOutput[] = [
      makeOutput(
        "advocate",
        "I recommend we proceed with a full launch because the trial metrics are strong, the sales team is prepared, the onboarding flow is complete, and support has enough bandwidth for the release window.",
        ["Recommend full launch this month"],
      ),
      makeOutput("critic", "Risk exists.", ["However, deployment risk remains"]),
      makeOutput("researcher", "There might be a delay in one vendor integration.", ["Unknown vendor timing could affect rollout"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("medium")
    expect(report.indicators.some((indicator) => indicator.type === "weak_criticism")).toBe(true)
  })

  it("detects missing uncertainty as medium risk", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend the launch and support this direction.", ["Recommend launch now"]),
      makeOutput("critic", "We should reject this because costs are too high.", ["However, cost downside is material"]),
      makeOutput("synthesizer", "We should continue evaluating tradeoffs with cited evidence.", ["Decision requires balancing cost and speed"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("medium")
    expect(report.indicators.some((indicator) => indicator.type === "no_uncertainty")).toBe(true)
  })

  it("returns high risk for mixed outputs when counterarguments are missing", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend we proceed immediately.", ["Recommend immediate approval"]),
      makeOutput("critic", "I align with that recommendation.", ["I agree with the advocate"]),
      makeOutput("devils_advocate", "There could be unknown demand risk.", ["Unknown demand may break assumptions"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("high")
    expect(report.missing_counterarguments).toBe(true)
    expect(report.indicators.some((indicator) => indicator.type === "missing_counterargument")).toBe(true)
  })

  it("returns low risk for empty outputs", () => {
    const report = detectSycophancy([])
    expect(report.overall_risk).toBe("low")
    expect(report.indicators).toHaveLength(0)
  })

  it("returns low risk for a single output", () => {
    const report = detectSycophancy([makeOutput("advocate", "I recommend proceeding.", ["Recommend proceeding now"])])
    expect(report.overall_risk).toBe("low")
    expect(report.indicators).toHaveLength(0)
  })

  it("returns high risk when critic is missing", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend we proceed.", ["Recommend approval"]),
      makeOutput("synthesizer", "We can proceed with evidence.", ["Proceed with cited evidence"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("high")
    expect(report.missing_counterarguments).toBe(true)
  })

  it("returns low risk for a healthy debate", () => {
    const outputs: AgentOutput[] = [
      makeOutput("advocate", "I recommend proceeding after pilot validation.", ["Recommend pilot-first rollout"]),
      makeOutput("critic", "We should reject immediate launch because uncertainty in data quality is still high.", ["However, unknown data quality risk can invalidate KPIs", "Concern: support team may not absorb peak demand"]),
      makeOutput("synthesizer", "A phased plan could work if evidence confirms pilot conversion assumptions.", ["Risk-adjusted option is a limited release with checkpoints"]),
    ]

    const report = detectSycophancy(outputs)
    expect(report.overall_risk).toBe("low")
    expect(report.indicators).toHaveLength(0)
    expect(report.warnings).toHaveLength(0)
  })
})

describe("buildAntiSycophancyInstructions", () => {
  it("returns a non-empty string with core rules", () => {
    const instructions = buildAntiSycophancyInstructions(DEFAULT_ANTI_SYCOPHANCY_CONFIG)
    expect(instructions.length).toBeGreaterThan(0)
    expect(instructions).toContain("You MUST present genuine counter-arguments")
    expect(instructions).toContain("Only cite existing evidence, do NOT fabricate")
  })

  it("contains forced disagreement instruction", () => {
    const instructions = buildAntiSycophancyInstructions(DEFAULT_ANTI_SYCOPHANCY_CONFIG)
    expect(instructions).toContain("substantial disagreement")
    expect(instructions).toContain("Do NOT agree with other roles")
  })

  it("contains synthesizer citation-only rule", () => {
    const instructions = buildAntiSycophancyInstructions(DEFAULT_ANTI_SYCOPHANCY_CONFIG)
    expect(instructions).toContain("Synthesizer: reconcile viewpoints using cited evidence only")
  })
})
