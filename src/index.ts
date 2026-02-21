import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"
import { createBrainSystem } from "./brain"
import { createBrainDatabase } from "./brain/search/db"
import { createFtsSearcher } from "./brain/search/fts"
import { createMarkdownIndexer } from "./brain/search/indexer"
import { createEmbeddingProvider } from "./brain/search/embedding-provider"
import { createVectorSearcher } from "./brain/search/vector-searcher"
import { createHybridSearcher } from "./brain/search/hybrid-searcher"
import { createEntityIndex } from "./brain/search/entity-index"
import { createAkashicReader } from "./brain/akashic/reader"
import { createThalamusWatcher } from "./brain/thalamus/watcher"
import { createAkashicLogger } from "./brain/akashic/logger"
import { createMicroConsolidator } from "./brain/consolidation/micro-consolidator"
import { createDailyConsolidator } from "./brain/consolidation/daily-consolidator"
import { createArchivalRollup } from "./brain/consolidation/archival-rollup"
import { createSleepConsolidator } from "./brain/consolidation/sleep-consolidator"
import { createBrainTools, createMeetingTools, createDecisionTools, createPeopleTools, createCommitmentTools, createProactiveTools, createDebateTools } from "./tools"
import { createBrainHook } from "./hooks"
import { createHeartbeat } from "./brain/heartbeat"
import { createPersonStore } from "./brain/stores/person-store"
import { createDecisionStore } from "./brain/stores/decision-store"
import { createCommitmentStore } from "./brain/stores/commitment-store"
import { createTriggerEngine } from "./brain/proactive/trigger-engine"
import { createDeliveryManager } from "./brain/proactive/delivery"
import { createReceptivityTracker } from "./brain/proactive/receptivity"
import { createMorningBriefGenerator } from "./brain/proactive/morning-brief"
import { createSpeakConfig, computeScore, shouldSpeak } from "./brain/proactive/scoring"
import type { ProactiveEngine } from "./brain/proactive/types"
import {
  BrainConfigSchema,
  BrainWatchConfigSchema,
  BrainEmbeddingConfigSchema,
  BrainSearchConfigSchema,
  BrainConsolidationConfigSchema,
  BrainProactiveConfigSchema,
} from "./brain/config"
import type { BrainConfig } from "./brain/config"
import { detectVaultPath } from "./brain/vault/paths"
import { log } from "./shared/logger"

const BrainPlugin: Plugin = async (ctx) => {
  const rawConfig = (ctx as unknown as Record<string, unknown>).brain ?? {}
  const config: BrainConfig = BrainConfigSchema.parse(rawConfig)

  const vaultPath = config.vault_path ?? (await detectVaultPath(ctx.directory))
  if (!vaultPath) {
    log("No Obsidian vault detected. Brain plugin disabled.", { directory: ctx.directory })
    return {}
  }

  const fullConfig: BrainConfig = { ...config, vault_path: vaultPath }
  const system = createBrainSystem(fullConfig)
  const initResult = await system.init()

  if (initResult.errors.length > 0) {
    log("Brain system init errors", { errors: initResult.errors })
    return {}
  }

  log("Brain system initialized", { vault: vaultPath })

  const db = createBrainDatabase(system.paths)
  const fts = createFtsSearcher(db.raw)
  const embeddingConfig = BrainEmbeddingConfigSchema.parse(fullConfig.embedding ?? {})
  const searchConfig = BrainSearchConfigSchema.parse(fullConfig.search ?? {})
  const consolidationConfig = BrainConsolidationConfigSchema.parse(fullConfig.consolidation ?? {})

  let embeddingProvider: import("./brain/search/types").EmbeddingProvider | null = null
  try {
    const provider = await createEmbeddingProvider(embeddingConfig)
    if (provider.modelId !== "null") {
      embeddingProvider = provider
    }
  } catch {}

  const indexer = createMarkdownIndexer(db, system.paths, embeddingProvider)
  const akashicLogger = createAkashicLogger(system.paths)
  const akashicReader = createAkashicReader(system.paths)

  const watchConfig = BrainWatchConfigSchema.parse(fullConfig.watch ?? {})

  await indexer.fullScan(system.paths.vault, watchConfig.patterns)

  let vectorSearcher: import("./brain/search/types").VectorSearcher | null = null
  let hybridSearcher: import("./brain/search/types").HybridSearcher | null = null

  if (embeddingProvider) {
    vectorSearcher = createVectorSearcher(db, embeddingConfig.dimensions)
    hybridSearcher = createHybridSearcher({
      fts,
      vectorSearcher,
      embeddingProvider,
      db,
      searchConfig,
      decayHalfLifeDays: consolidationConfig.decay_half_life_days,
      embeddingDimensions: embeddingConfig.dimensions,
    })
    log("Hybrid search enabled", { provider: embeddingProvider.modelId, dimensions: embeddingConfig.dimensions })
  } else {
    log("Hybrid search disabled — using FTS-only", { reason: "no embedding provider" })
  }

  const watcher = createThalamusWatcher(system.paths, watchConfig, fullConfig.exclude_paths)

  watcher.onEvent(async (event) => {
    await akashicLogger.log({
      type: event.type,
      source: event.source,
      priority: event.priority,
      data: event.data,
    })

    if (event.type === "file.modified" || event.type === "file.created") {
      const data = event.data as { path: string } | undefined
      if (data?.path) {
        const absPath = join(system.paths.vault, data.path)
        await indexer.indexFile(absPath)
        if (vectorSearcher) {
          vectorSearcher.invalidateCache()
        }
      }
    }

    if (event.type === "file.deleted") {
      const data = event.data as { path: string } | undefined
      if (data?.path) {
        const absPath = join(system.paths.vault, data.path)
        indexer.removeFile(absPath)
      }
    }
  })

  await watcher.start()

  const microConsolidator = createMicroConsolidator({
    paths: system.paths,
    akashicReader,
    akashicLogger: akashicLogger,
    config: consolidationConfig,
  })

  const dailyConsolidator = createDailyConsolidator({
    paths: system.paths,
    akashicReader,
  })

  const archivalRollup = createArchivalRollup(system.paths)

  const sleepConsolidator = createSleepConsolidator({
    dailyConsolidator,
    archivalRollup,
    paths: system.paths,
  })

  const personStore = createPersonStore(system.paths.peopleStore)
  const decisionStore = createDecisionStore(system.paths.decisionsStore)
  const commitmentStore = createCommitmentStore(system.paths.commitmentsStore)
  const entityIndex = createEntityIndex(db)

  // Phase 3: Proactive engine
  const proactiveConfig = BrainProactiveConfigSchema.parse(fullConfig.proactive ?? {})
  let proactiveEngine: ProactiveEngine | null = null
  let morningBriefGenerator: ReturnType<typeof createMorningBriefGenerator> | null = null
  let proactiveDeliveryManager: ReturnType<typeof createDeliveryManager> | null = null

  if (proactiveConfig.enabled) {
    const speakConfig = createSpeakConfig({
      threshold: proactiveConfig.threshold,
      daily_budget: proactiveConfig.daily_budget,
      min_interval_minutes: proactiveConfig.min_interval_minutes,
      quiet_hours: { start: proactiveConfig.quiet_hours_start, end: proactiveConfig.quiet_hours_end },
    })

    const triggerEngine = createTriggerEngine({
      commitmentStore,
      decisionStore,
      personStore,
      akashicReader,
      dailyConsolidator,
    })

    proactiveDeliveryManager = createDeliveryManager()
    const receptivityTracker = createReceptivityTracker(join(system.paths.brain, "receptivity.jsonl"))

    morningBriefGenerator = createMorningBriefGenerator({
      dailyConsolidator,
      commitmentStore,
      decisionStore,
    })

    proactiveEngine = {
      async evaluate(sessionId, currentHour) {
        const triggers = await triggerEngine.evaluateTriggers(sessionId, currentHour)
        if (triggers.length === 0) return null

        const bestTrigger = triggers[0]
        const receptivityScore = await receptivityTracker.getReceptivityScore(
          bestTrigger.trigger.type,
          bestTrigger.trigger.subtype,
        )

        const score = computeScore({
          urgency: bestTrigger.urgency,
          attention_state: 0.5,
          time_of_day: currentHour >= 8 && currentHour <= 18 ? 0.8 : 0.3,
          recency: 1.0,
          receptivity: receptivityScore,
        })

        const decision = shouldSpeak(score, speakConfig, proactiveDeliveryManager!.getBudgetState(), currentHour)
        if (!decision.speak) return null

        const message = proactiveDeliveryManager!.formatMessage(bestTrigger.trigger, bestTrigger.message_draft, decision.score)
        proactiveDeliveryManager!.recordDelivery()
        return message
      },
      async recordReaction(record) {
        await receptivityTracker.recordReaction(record)
      },
      getBudgetState() {
        return proactiveDeliveryManager!.getBudgetState()
      },
      resetBudget() {
        proactiveDeliveryManager!.resetBudget()
      },
    }

    log("Proactive engine enabled", { threshold: speakConfig.threshold, budget: speakConfig.daily_budget })
  }

  const toolDeps = {
    paths: system.paths,
    db,
    fts,
    indexer,
    akashicReader,
    hybridSearcher,
    microConsolidator,
    sleepConsolidator,
    personStore,
    decisionStore,
    commitmentStore,
    akashicLogger,
    entityIndex,
    proactiveEngine,
    morningBriefGenerator,
  }

  const tools = {
    ...createBrainTools(toolDeps),
    ...createMeetingTools(toolDeps),
    ...createDecisionTools(toolDeps),
    ...createPeopleTools(toolDeps),
    ...createCommitmentTools(toolDeps),
    ...createProactiveTools({ proactiveEngine, morningBriefGenerator }),
    ...createDebateTools(toolDeps),
  }

  const heartbeat = createHeartbeat({
    paths: system.paths,
    dailyConsolidator,
    fts,
    hybridSearcher,
  })

  const hook = createBrainHook(ctx, { microConsolidator, heartbeat, proactiveEngine, deliveryManager: proactiveDeliveryManager })

  return {
    tool: tools,
    "experimental.chat.system.transform": hook["experimental.chat.system.transform"],
    "experimental.session.compacting": hook["experimental.session.compacting"],
    event: async (input: { event: { type: string; properties?: unknown } }) => {
      await hook.event(input)
    },
  }
}

export default BrainPlugin
