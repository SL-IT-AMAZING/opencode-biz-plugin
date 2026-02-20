import type { Database } from "bun:sqlite"
import type { SearchCandidate } from "../types"
import type { FtsSearcher } from "./types"

interface FtsRow {
  id: number
  path: string
  chunk_index: number
  content: string
  content_hash: string
  created_at: string
  updated_at: string
  is_evergreen: number
  fts_score: number
}

interface HighlightRow extends FtsRow {
  highlighted: string
}

function escapeFtsQuery(query: string): string {
  return query
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => `"${term}"`)
    .join(" ")
}

function toSearchCandidate(row: FtsRow): SearchCandidate {
  return {
    id: String(row.id),
    path: row.path,
    chunk_index: row.chunk_index,
    content: row.content,
    fts_score: -row.fts_score,
    vec_score: 0,
    temporal_score: 0,
    combined_score: -row.fts_score,
  }
}

export function createFtsSearcher(db: Database): FtsSearcher {
  const stmtSearch = db.prepare<FtsRow, [string, number]>(`
    SELECT mc.id, mc.path, mc.chunk_index, mc.content, mc.content_hash,
           mc.created_at, mc.updated_at, mc.is_evergreen,
           bm25(chunks_fts) as fts_score
    FROM chunks_fts
    JOIN markdown_chunks mc ON mc.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ?
    ORDER BY bm25(chunks_fts)
    LIMIT ?
  `)

  const stmtSearchByPath = db.prepare<FtsRow, [string, string, number]>(`
    SELECT mc.id, mc.path, mc.chunk_index, mc.content, mc.content_hash,
           mc.created_at, mc.updated_at, mc.is_evergreen,
           bm25(chunks_fts) as fts_score
    FROM chunks_fts
    JOIN markdown_chunks mc ON mc.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ? AND mc.path = ?
    ORDER BY bm25(chunks_fts)
    LIMIT ?
  `)

  const stmtHighlight = db.prepare<HighlightRow, [string, number]>(`
    SELECT mc.id, mc.path, mc.chunk_index, mc.content, mc.content_hash,
           mc.created_at, mc.updated_at, mc.is_evergreen,
           bm25(chunks_fts) as fts_score,
           highlight(chunks_fts, 0, '<mark>', '</mark>') as highlighted
    FROM chunks_fts
    JOIN markdown_chunks mc ON mc.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ?
    ORDER BY bm25(chunks_fts)
    LIMIT ?
  `)

  return {
    search(query: string, limit = 20): SearchCandidate[] {
      const escaped = escapeFtsQuery(query)
      if (escaped.length === 0) return []
      try {
        return stmtSearch.all(escaped, limit).map(toSearchCandidate)
      } catch {
        return []
      }
    },

    searchByPath(query: string, path: string, limit = 20): SearchCandidate[] {
      const escaped = escapeFtsQuery(query)
      if (escaped.length === 0) return []
      try {
        return stmtSearchByPath.all(escaped, path, limit).map(toSearchCandidate)
      } catch {
        return []
      }
    },

    highlight(query: string, limit = 20): Array<SearchCandidate & { highlighted: string }> {
      const escaped = escapeFtsQuery(query)
      if (escaped.length === 0) return []
      try {
        return stmtHighlight.all(escaped, limit).map(row => ({
          ...toSearchCandidate(row),
          highlighted: row.highlighted,
        }))
      } catch {
        return []
      }
    },
  }
}
