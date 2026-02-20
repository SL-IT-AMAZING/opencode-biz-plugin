import { z } from "zod"

export const BrainWatchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  patterns: z.array(z.string()).default(["**/*.md"]),
  ignore: z.array(z.string()).default([]),
  debounce_ms: z.number().min(100).max(5000).default(500),
  coalesce_window_ms: z.number().min(500).max(10000).default(2000),
})

export const BrainEmbeddingConfigSchema = z.object({
  provider: z.enum(["local", "openai", "voyage"]).default("local"),
  model: z.string().optional(),
  dimensions: z.number().default(384),
  api_key_env: z.string().optional(),
  batch_size: z.number().min(1).max(256).default(32),
})

export const BrainConsolidationConfigSchema = z.object({
  micro_interval_minutes: z.number().min(5).max(120).default(30),
  sleep_hour: z.number().min(0).max(23).default(3),
  decay_half_life_days: z.number().min(1).max(365).default(30),
  evergreen_tags: z.array(z.string()).default(["evergreen", "permanent", "core"]),
})

export const BrainInjectionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  budget_percent: z.number().min(1).max(25).default(10),
  max_items: z.number().min(1).max(20).default(6),
  min_relevance: z.number().min(0).max(1).default(0.3),
  include_soul: z.boolean().default(true),
  include_working: z.boolean().default(true),
})

export const BrainSearchConfigSchema = z.object({
  fts_weight: z.number().min(0).max(1).default(0.3),
  vec_weight: z.number().min(0).max(1).default(0.7),
  mmr_lambda: z.number().min(0).max(1).default(0.7),
  temporal_decay: z.boolean().default(true),
  max_candidates: z.number().default(50),
})

export const BrainHeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(true),
  interval_turns: z.number().min(1).max(20).default(5),
  max_suggestions: z.number().min(1).max(3).default(1),
})

export const BrainConfigSchema = z.object({
  enabled: z.boolean().default(false),
  vault_path: z.string().optional().describe("Absolute path to Obsidian vault root. Auto-detected if not set."),
  brain_dir: z.string().default("_brain"),
  exclude_paths: z.array(z.string()).default([]).describe("Vault-relative paths to exclude from indexing"),
  watch: BrainWatchConfigSchema.optional(),
  embedding: BrainEmbeddingConfigSchema.optional(),
  consolidation: BrainConsolidationConfigSchema.optional(),
  injection: BrainInjectionConfigSchema.optional(),
  search: BrainSearchConfigSchema.optional(),
  heartbeat: BrainHeartbeatConfigSchema.optional(),
})

export type BrainConfig = z.infer<typeof BrainConfigSchema>
export type BrainWatchConfig = z.infer<typeof BrainWatchConfigSchema>
export type BrainEmbeddingConfig = z.infer<typeof BrainEmbeddingConfigSchema>
export type BrainConsolidationConfig = z.infer<typeof BrainConsolidationConfigSchema>
export type BrainInjectionConfig = z.infer<typeof BrainInjectionConfigSchema>
export type BrainSearchConfig = z.infer<typeof BrainSearchConfigSchema>
export type BrainHeartbeatConfig = z.infer<typeof BrainHeartbeatConfigSchema>
