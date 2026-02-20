import type { Plugin } from "@opencode-ai/plugin"
import { join } from "node:path"
import { createBrainSystem } from "./brain"
import { createBrainDatabase } from "./brain/search/db"
import { createFtsSearcher } from "./brain/search/fts"
import { createMarkdownIndexer } from "./brain/search/indexer"
import { createEmbeddingProvider } from "./brain/search/embedding-provider"
import { createVectorSearcher } from "./brain/search/vector-searcher"
import { createHybridSearcher } from "./brain/search/hybrid-searcher"
import { createAkashicReader } from "./brain/akashic/reader"
import { createThalamusWatcher } from "./brain/thalamus/watcher"
import { createAkashicLogger } from "./brain/akashic/logger"
import { createMicroConsolidator } from "./brain/consolidation/micro-consolidator"
import { createDailyConsolidator } from "./brain/consolidation/daily-consolidator"
import { createArchivalRollup } from "./brain/consolidation/archival-rollup"
import { createSleepConsolidator } from "./brain/consolidation/sleep-consolidator"
import { createBrainTools } from "./tools"
import { createBrainHook } from "./hooks"
import { createHeartbeat } from "./brain/heartbeat"
import {
  BrainConfigSchema,
  BrainWatchConfigSchema,
  BrainEmbeddingConfigSchema,
  BrainSearchConfigSchema,
  BrainConsolidationConfigSchema,
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

  const tools = createBrainTools({
    paths: system.paths,
    db,
    fts,
    indexer,
    akashicReader,
    hybridSearcher,
    microConsolidator,
    sleepConsolidator,
  })

  const heartbeat = createHeartbeat({
    paths: system.paths,
    dailyConsolidator,
    fts,
    hybridSearcher,
  })

  const hook = createBrainHook(ctx, { microConsolidator, heartbeat })

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
