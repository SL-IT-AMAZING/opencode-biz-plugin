import type { BrainDatabase, FtsSearcher, MarkdownIndexer, HybridSearcher, EntityIndex } from "../brain/search/types"
import type { AkashicReader, AkashicLogger } from "../brain/akashic/types"
import type { MicroConsolidator } from "../brain/consolidation/types"
import type { SleepConsolidator } from "../brain/consolidation/sleep-consolidator"
import type { BrainPaths } from "../brain/vault/paths"
import type { PersonStore, DecisionStore, CommitmentStore } from "../brain/stores/types"
import type { ProactiveEngine } from "../brain/proactive/types"
import type { MorningBriefGenerator } from "../brain/proactive/morning-brief"

export interface BrainToolDeps {
  paths: BrainPaths
  db: BrainDatabase
  fts: FtsSearcher
  indexer: MarkdownIndexer
  akashicReader: AkashicReader
  hybridSearcher: HybridSearcher | null
  microConsolidator: MicroConsolidator | null
  sleepConsolidator: SleepConsolidator | null
  personStore: PersonStore | null
  decisionStore: DecisionStore | null
  commitmentStore: CommitmentStore | null
  akashicLogger: AkashicLogger | null
  entityIndex: EntityIndex | null
  proactiveEngine: ProactiveEngine | null
  morningBriefGenerator: MorningBriefGenerator | null
}
