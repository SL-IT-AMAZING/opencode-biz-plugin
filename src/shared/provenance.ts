import type { Provenance } from "../brain/types"

export interface CreateProvenanceOptions {
  source_type: Provenance["source_type"]
  source_id: string
  confidence?: number
  created_by?: Provenance["created_by"]
  citation?: string
}

export function createProvenance(options: CreateProvenanceOptions): Provenance {
  return {
    source_type: options.source_type,
    source_id: options.source_id,
    confidence: Math.max(0, Math.min(1, options.confidence ?? 1)),
    created_by: options.created_by ?? "system",
    citation: options.citation,
  }
}
