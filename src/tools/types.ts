import type { BrainDatabase, FtsSearcher, MarkdownIndexer, HybridSearcher } from "../brain/search/types"
import type { AkashicReader } from "../brain/akashic/types"
import type { MicroConsolidator } from "../brain/consolidation/types"
import type { SleepConsolidator } from "../brain/consolidation/sleep-consolidator"
import type { BrainPaths } from "../brain/vault/paths"

export interface BrainToolDeps {
  paths: BrainPaths
  db: BrainDatabase
  fts: FtsSearcher
  indexer: MarkdownIndexer
  akashicReader: AkashicReader
  hybridSearcher: HybridSearcher | null
  microConsolidator: MicroConsolidator | null
  sleepConsolidator: SleepConsolidator | null
}
