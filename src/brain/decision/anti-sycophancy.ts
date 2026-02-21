import {
  DEFAULT_ANTI_SYCOPHANCY_CONFIG,
  type AgentOutput,
  type AntiSycophancyConfig,
  type SycophancyIndicator,
  type SycophancyReport,
} from "./types"

const AGREEMENT_PREFIXES = [
  "i agree",
  "agree with",
  "aligned with",
  "same as",
  "echoing",
  "supporting the same",
]

const COUNTERARGUMENT_MARKERS = [
  "however",
  "but",
  "risk",
  "concern",
  "counter",
  "oppose",
  "disagree",
  "tradeoff",
  "downside",
  "fails",
  "weakness",
  "uncertain",
]

const UNCERTAINTY_MARKERS = [
  "uncertain",
  "unknown",
  "unclear",
  "risk",
  "might",
  "may",
  "could",
  "possibly",
  "assumption",
  "confidence",
]

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

function toWordSet(input: string): Set<string> {
  const normalized = normalizeText(input)
  if (!normalized) {
    return new Set()
  }
  return new Set(normalized.split(" ").filter((word) => word.length > 2))
}

function overlapRatio(left: string, right: string): number {
  const leftWords = toWordSet(left)
  const rightWords = toWordSet(right)
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0
  }

  let shared = 0
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      shared += 1
    }
  }

  return shared / Math.max(leftWords.size, rightWords.size)
}

function includesAnyMarker(text: string, markers: string[]): boolean {
  const normalized = normalizeText(text)
  return markers.some((marker) => normalized.includes(marker))
}

function startsWithAgreement(point: string): boolean {
  const normalized = normalizeText(point)
  return AGREEMENT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function matchesWord(text: string, word: string): boolean {
  const pattern = new RegExp(`\\b${word}\\b`)
  return pattern.test(text)
}

function inferDirection(output: AgentOutput): "positive" | "negative" | "neutral" {
  const text = normalizeText(`${output.content} ${output.key_points.join(" ")}`)

  const positiveMarkers = ["recommend", "support", "proceed", "approve", "yes", "adopt"]
  const negativeMarkers = ["reject", "avoid", "block",  "do not", "against", "stop", "oppose"]

  const positive = positiveMarkers.some((marker) => matchesWord(text, marker))
  const negative = negativeMarkers.some((marker) => matchesWord(text, marker))

  if (positive && !negative) {
    return "positive"
  }

  if (negative && !positive) {
    return "negative"
  }

  return "neutral"
}

function pushIndicator(
  indicators: SycophancyIndicator[],
  warnings: string[],
  indicator: SycophancyIndicator,
  warning: string,
): void {
  indicators.push(indicator)
  warnings.push(warning)
}

export function detectSycophancy(outputs: AgentOutput[]): SycophancyReport {
  const indicators: SycophancyIndicator[] = []
  const warnings: string[] = []
  const agreementPatterns = new Set<string>()

  if (outputs.length < 2) {
    return {
      has_unanimous_agreement: false,
      missing_counterarguments: false,
      agreement_patterns: [],
      indicators,
      warnings,
      overall_risk: "low",
    }
  }

  const advocateOutputs = outputs.filter((output) => output.role === "advocate")
  const criticOutputs = outputs.filter((output) => output.role === "critic")

  const opinionDirections = outputs
    .filter((output) => output.role === "advocate" || output.role === "critic")
    .map(inferDirection)
    .filter((direction) => direction !== "neutral")

  const hasUnanimousAgreement = opinionDirections.length > 1 && new Set(opinionDirections).size === 1

  const missingCounterarguments =
    criticOutputs.length === 0 ||
    criticOutputs.every((critic) => {
      if (critic.key_points.length === 0) {
        return true
      }

      const allAgreeing = critic.key_points.every((point) => startsWithAgreement(point))
      const hasObjection = critic.key_points.some((point) => includesAnyMarker(point, COUNTERARGUMENT_MARKERS))
      return allAgreeing || !hasObjection
    })

  const allDirections = outputs.map(inferDirection).filter((direction) => direction !== "neutral")
  const unanimousAcrossOutputs = allDirections.length > 1 && new Set(allDirections).size === 1

  if (hasUnanimousAgreement || unanimousAcrossOutputs) {
    pushIndicator(
      indicators,
      warnings,
      {
        type: "unanimous_agreement",
        description: "All opinionated agents converged on the same direction.",
        severity: "high",
      },
      "High sycophancy risk: outputs show unanimous agreement without meaningful divergence.",
    )
  }

  if (missingCounterarguments) {
    pushIndicator(
      indicators,
      warnings,
      {
        type: "missing_counterargument",
        description: "Critic output lacks genuine objections or is missing.",
        severity: "high",
      },
      "High sycophancy risk: critic role did not provide substantive counterarguments.",
    )
  }

  for (let leftIndex = 0; leftIndex < outputs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < outputs.length; rightIndex += 1) {
      if (outputs[leftIndex].role === outputs[rightIndex].role) {
        continue
      }

      for (const leftPoint of outputs[leftIndex].key_points) {
        for (const rightPoint of outputs[rightIndex].key_points) {
          const ratio = overlapRatio(leftPoint, rightPoint)
          if (ratio > 0.6) {
            agreementPatterns.add(leftPoint.length <= rightPoint.length ? leftPoint : rightPoint)
          }
        }
      }
    }
  }

  if (agreementPatterns.size > 0) {
    pushIndicator(
      indicators,
      warnings,
      {
        type: "echo_pattern",
        description: "Multiple agents repeated highly overlapping key points.",
        severity: "medium",
      },
      "Medium sycophancy risk: key points contain high-overlap echo patterns across roles.",
    )
  }

  const advocateLength = advocateOutputs.reduce((sum, output) => sum + normalizeText(output.content).length, 0)
  const criticLength = criticOutputs.reduce((sum, output) => sum + normalizeText(output.content).length, 0)
  if (advocateLength > 0 && criticOutputs.length > 0 && criticLength / advocateLength < 0.2) {
    pushIndicator(
      indicators,
      warnings,
      {
        type: "weak_criticism",
        description: "Critic response is disproportionately short relative to advocate response.",
        severity: "medium",
      },
      "Medium sycophancy risk: critic analysis is much shorter than advocate analysis.",
    )
  }

  const anyUncertainty = outputs.some((output) => includesAnyMarker(`${output.content} ${output.key_points.join(" ")}`, UNCERTAINTY_MARKERS))
  if (!anyUncertainty) {
    pushIndicator(
      indicators,
      warnings,
      {
        type: "no_uncertainty",
        description: "No agent acknowledged uncertainty, risk, or unknowns.",
        severity: "medium",
      },
      "Medium sycophancy risk: outputs do not acknowledge uncertainty or unknowns.",
    )
  }

  const overallRisk: SycophancyReport["overall_risk"] = indicators.some((indicator) => indicator.severity === "high")
    ? "high"
    : indicators.some((indicator) => indicator.severity === "medium")
      ? "medium"
      : "low"

  return {
    has_unanimous_agreement: hasUnanimousAgreement,
    missing_counterarguments: missingCounterarguments,
    agreement_patterns: Array.from(agreementPatterns),
    indicators,
    warnings,
    overall_risk: overallRisk,
  }
}

export function buildAntiSycophancyInstructions(config: AntiSycophancyConfig = DEFAULT_ANTI_SYCOPHANCY_CONFIG): string {
  const rules: string[] = [
    "You MUST present genuine counter-arguments against the most likely recommendation.",
    "Do NOT agree with other roles by default. Start from an independent position and justify it.",
    "Only cite existing evidence, do NOT fabricate facts, citations, quotes, or sources.",
  ]

  if (config.independent_drafts === "best_effort") {
    rules.push("Draft your analysis independently before reading or reacting to any other role outputs.")
  }

  if (config.forced_disagreement) {
    rules.push("You MUST identify at least one substantial disagreement with another role's reasoning.")
  }

  if (config.steelman_requirement) {
    rules.push("Steelman the strongest opposing argument before providing your own final conclusion.")
  }

  if (config.minority_amplification) {
    rules.push("Elevate minority or dissenting views when they are evidence-backed, even if unpopular.")
  }

  if (config.synthesizer_citation_only) {
    rules.push("Synthesizer: reconcile viewpoints using cited evidence only and explicitly note unresolved conflicts.")
  }

  return ["Anti-Sycophancy Protocol:", ...rules.map((rule, index) => `${index + 1}. ${rule}`)].join("\n")
}
