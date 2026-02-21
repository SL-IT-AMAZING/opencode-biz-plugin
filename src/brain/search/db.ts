import { Database } from "bun:sqlite"
import type { ChunkRecord } from "../types"
import type { BrainPaths } from "../vault"
import type { BrainDatabase, ChunkInsert, FileIndexState, DatabaseStats } from "./types"

interface ChunkRow {
  id: number
  path: string
  chunk_index: number
  content: string
  content_hash: string
  created_at: string
  updated_at: string
  is_evergreen: number
  embedding: Uint8Array | null
  embedding_model: string | null
}

interface EmbeddingRow {
  id: number
  path: string
  embedding: Uint8Array
  created_at: string
  updated_at: string
  is_evergreen: number
}

interface EmbeddingMetaRow {
  id: number
  embedding: Uint8Array
  embedding_model: string
}

interface ChunkIdContentRow {
  id: number
  content: string
}

interface FileStateRow {
  path: string
  hash: string
  mtime: number
  chunk_count: number
  last_indexed: string
}

interface EntityRow {
  id: string
  type: string
  name: string
  aliases: string
  vault_path: string | null
  first_seen: string
  last_seen: string
  interaction_count: number
}

interface EntityRelationRow {
  entity_a_id: string
  entity_b_id: string
  relation_type: string
  co_occurrence_count: number
  last_updated: string
}

interface EntityEventRow {
  entity_id: string
  event_id: string
  role: string
  created_at: string
}

interface RelatedEntityRow extends EntityRelationRow {
  id: string
  type: string
  name: string
  aliases: string
  vault_path: string | null
  first_seen: string
  last_seen: string
  interaction_count: number
}

interface CountRow {
  count: number
}

interface FileCountRow {
  file_count: number
}

export function createBrainDatabase(paths: BrainPaths): BrainDatabase {
  const dbPath = paths.dbFile

  const db = new Database(dbPath, { create: true })

  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA foreign_keys = ON")

  db.exec(`
    CREATE TABLE IF NOT EXISTS markdown_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_evergreen INTEGER NOT NULL DEFAULT 0,
      UNIQUE(path, chunk_index)
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON markdown_chunks(path)`)

  try {
    db.exec(`ALTER TABLE markdown_chunks ADD COLUMN embedding BLOB`)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name: embedding")) {
      throw error
    }
  }

  try {
    db.exec(`ALTER TABLE markdown_chunks ADD COLUMN embedding_model TEXT`)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name: embedding_model")) {
      throw error
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS file_state (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      mtime REAL NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      last_indexed TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content='markdown_chunks',
      content_rowid='id',
      tokenize='porter unicode61'
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      vault_path TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      interaction_count INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name COLLATE NOCASE)`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_relations (
      entity_a_id TEXT NOT NULL,
      entity_b_id TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'co_occurrence',
      co_occurrence_count INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_a_id, entity_b_id),
      FOREIGN KEY (entity_a_id) REFERENCES entities(id),
      FOREIGN KEY (entity_b_id) REFERENCES entities(id)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_events (
      entity_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'mentioned',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (entity_id, event_id),
      FOREIGN KEY (entity_id) REFERENCES entities(id)
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_entity_events_event ON entity_events(event_id)`)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON markdown_chunks BEGIN
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON markdown_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
    END
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON markdown_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
    END
  `)

  const stmtGetChunks = db.prepare<ChunkRow, [string]>(
    `SELECT * FROM markdown_chunks WHERE path = ? ORDER BY chunk_index`,
  )

  const stmtDeleteChunks = db.prepare<void, [string]>(
    `DELETE FROM markdown_chunks WHERE path = ?`,
  )

  const stmtInsertChunk = db.prepare<void, [string, number, string, string, number]>(
    `INSERT INTO markdown_chunks (path, chunk_index, content, content_hash, is_evergreen)
     VALUES (?, ?, ?, ?, ?)`,
  )

  const stmtGetFileState = db.prepare<FileStateRow, [string]>(
    `SELECT * FROM file_state WHERE path = ?`,
  )

  const stmtSetEmbedding = db.prepare<void, [Uint8Array, string, number]>(
    `UPDATE markdown_chunks SET embedding = ?, embedding_model = ? WHERE id = ?`,
  )

  const stmtGetEmbedding = db.prepare<EmbeddingMetaRow, [number]>(
    `SELECT id, embedding, embedding_model FROM markdown_chunks WHERE id = ? AND embedding IS NOT NULL`,
  )

  const stmtAllEmbeddings = db.prepare<EmbeddingRow, []>(
    `SELECT id, path, embedding, created_at, updated_at, is_evergreen FROM markdown_chunks WHERE embedding IS NOT NULL`,
  )

  const stmtChunksNeedingEmbedding = db.prepare<ChunkIdContentRow, [string]>(
    `SELECT id, content FROM markdown_chunks WHERE embedding IS NULL OR embedding_model != ?`,
  )

  const stmtClearEmbeddings = db.prepare<void, []>(
    `UPDATE markdown_chunks SET embedding = NULL, embedding_model = NULL`,
  )

  const stmtUpsertFileState = db.prepare<void, [string, string, number, number, string]>(
    `INSERT INTO file_state (path, hash, mtime, chunk_count, last_indexed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET hash=excluded.hash, mtime=excluded.mtime,
       chunk_count=excluded.chunk_count, last_indexed=excluded.last_indexed`,
  )

  const stmtDeleteFileState = db.prepare<void, [string]>(
    `DELETE FROM file_state WHERE path = ?`,
  )

  const stmtAllFileStates = db.prepare<FileStateRow, []>(
    `SELECT * FROM file_state`,
  )

  const stmtCountChunks = db.prepare<CountRow, []>(
    `SELECT COUNT(*) as count FROM markdown_chunks`,
  )

  const stmtCountFiles = db.prepare<FileCountRow, []>(
    `SELECT COUNT(DISTINCT path) as file_count FROM markdown_chunks`,
  )

  const stmtUpsertEntity = db.prepare<void, [string, string, string, string, string | null]>(
    `INSERT OR REPLACE INTO entities (id, type, name, aliases, vault_path)
     VALUES (?, ?, ?, ?, ?)`,
  )

  const stmtFindEntity = db.prepare<EntityRow, [string, string, number]>(
    `SELECT * FROM entities
     WHERE name LIKE '%' || ? || '%' COLLATE NOCASE OR aliases LIKE '%' || ? || '%'
     ORDER BY interaction_count DESC, last_seen DESC
     LIMIT ?`,
  )

  const stmtGetEntity = db.prepare<EntityRow, [string]>(
    `SELECT * FROM entities WHERE id = ?`,
  )

  const stmtUpdateEntitySeen = db.prepare<void, [string, string]>(
    `UPDATE entities SET last_seen = ?, interaction_count = interaction_count + 1 WHERE id = ?`,
  )

  const stmtUpsertRelation = db.prepare<void, [string, string, string, string]>(
    `INSERT INTO entity_relations (entity_a_id, entity_b_id, relation_type, co_occurrence_count, last_updated)
     VALUES (?, ?, 'co_occurrence', 1, ?)
     ON CONFLICT(entity_a_id, entity_b_id) DO UPDATE SET
       co_occurrence_count = co_occurrence_count + 1,
       last_updated = ?`,
  )

  const stmtGetRelated = db.prepare<RelatedEntityRow, [string, string, string, number]>(
    `SELECT er.*, e.*
     FROM entity_relations er
     JOIN entities e ON e.id = CASE
       WHEN er.entity_a_id = ? THEN er.entity_b_id
       ELSE er.entity_a_id
     END
     WHERE er.entity_a_id = ? OR er.entity_b_id = ?
     ORDER BY er.co_occurrence_count DESC
     LIMIT ?`,
  )

  const stmtInsertEntityEvent = db.prepare<void, [string, string, string]>(
    `INSERT OR IGNORE INTO entity_events (entity_id, event_id, role) VALUES (?, ?, ?)`,
  )

  const stmtGetEntityEvents = db.prepare<EntityEventRow, [string]>(
    `SELECT * FROM entity_events WHERE entity_id = ?`,
  )

  const stmtGetEventEntities = db.prepare<EntityEventRow, [string]>(
    `SELECT * FROM entity_events WHERE event_id = ?`,
  )

  function toChunkRecord(row: ChunkRow): ChunkRecord {
    return {
      id: String(row.id),
      path: row.path,
      chunk_index: row.chunk_index,
      content: row.content,
      content_hash: row.content_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_evergreen: row.is_evergreen === 1,
    }
  }

  const upsertTransaction = db.transaction((path: string, chunks: ChunkInsert[]) => {
    stmtDeleteChunks.run(path)
    for (const chunk of chunks) {
      stmtInsertChunk.run(path, chunk.chunk_index, chunk.content, chunk.content_hash, chunk.is_evergreen ? 1 : 0)
    }
  })

  const removeTransaction = db.transaction((path: string) => {
    stmtDeleteChunks.run(path)
    stmtDeleteFileState.run(path)
  })

  return {
    get raw() {
      return db
    },

    close() {
      db.close()
    },

    getChunks(path: string): ChunkRecord[] {
      return stmtGetChunks.all(path).map(toChunkRecord)
    },

    upsertChunks(path: string, chunks: ChunkInsert[]) {
      upsertTransaction(path, chunks)
    },

    setEmbedding(chunkId: number, embedding: Buffer, model: string) {
      stmtSetEmbedding.run(embedding, model, chunkId)
    },

    getEmbedding(chunkId: number): { embedding: Buffer; model: string } | undefined {
      const row = stmtGetEmbedding.get(chunkId)
      if (!row) return undefined
      return {
        embedding: Buffer.from(row.embedding),
        model: row.embedding_model,
      }
    },

    getAllEmbeddingsForSearch(): Array<{ id: number; path: string; embedding: Buffer; created_at: string; updated_at: string; is_evergreen: number }> {
      return stmtAllEmbeddings.all().map((row) => ({
        id: row.id,
        path: row.path,
        embedding: Buffer.from(row.embedding),
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_evergreen: row.is_evergreen,
      }))
    },

    getChunksNeedingEmbedding(model: string): Array<{ id: number; content: string }> {
      return stmtChunksNeedingEmbedding.all(model)
    },

    clearEmbeddings() {
      stmtClearEmbeddings.run()
    },

    removeFile(path: string) {
      removeTransaction(path)
    },

    getFileState(path: string): FileIndexState | undefined {
      const row = stmtGetFileState.get(path)
      if (!row) return undefined
      return {
        hash: row.hash,
        mtime: row.mtime,
        chunk_count: row.chunk_count,
        last_indexed: row.last_indexed,
      }
    },

    setFileState(path: string, state: FileIndexState) {
      stmtUpsertFileState.run(path, state.hash, state.mtime, state.chunk_count, state.last_indexed)
    },

    getAllFileStates(): Record<string, FileIndexState> {
      const rows = stmtAllFileStates.all()
      const result: Record<string, FileIndexState> = {}
      for (const row of rows) {
        result[row.path] = {
          hash: row.hash,
          mtime: row.mtime,
          chunk_count: row.chunk_count,
          last_indexed: row.last_indexed,
        }
      }
      return result
    },

    upsertEntity(entity: { id: string; type: string; name: string; aliases: string[]; vault_path?: string }) {
      stmtUpsertEntity.run(
        entity.id,
        entity.type,
        entity.name,
        JSON.stringify(entity.aliases),
        entity.vault_path ?? null,
      )
    },

    findEntities(query: string, limit: number = 20): Array<{ id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number }> {
      return stmtFindEntity.all(query, query, limit).map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        aliases: JSON.parse(row.aliases) as string[],
        vault_path: row.vault_path,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        interaction_count: row.interaction_count,
      }))
    },

    getEntity(id: string): { id: string; type: string; name: string; aliases: string[]; vault_path: string | null; first_seen: string; last_seen: string; interaction_count: number } | undefined {
      const row = stmtGetEntity.get(id)
      if (!row) return undefined
      return {
        id: row.id,
        type: row.type,
        name: row.name,
        aliases: JSON.parse(row.aliases) as string[],
        vault_path: row.vault_path,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        interaction_count: row.interaction_count,
      }
    },

    updateEntitySeen(id: string) {
      stmtUpdateEntitySeen.run(new Date().toISOString(), id)
    },

    upsertRelation(entityAId: string, entityBId: string) {
      const [entity_a_id, entity_b_id] = entityAId < entityBId ? [entityAId, entityBId] : [entityBId, entityAId]
      const now = new Date().toISOString()
      stmtUpsertRelation.run(entity_a_id, entity_b_id, now, now)
    },

    getRelated(entityId: string, limit: number = 20): Array<{ entity_a_id: string; entity_b_id: string; co_occurrence_count: number; last_updated: string; related_id: string; related_name: string; related_type: string }> {
      return stmtGetRelated.all(entityId, entityId, entityId, limit).map((row) => ({
        entity_a_id: row.entity_a_id,
        entity_b_id: row.entity_b_id,
        co_occurrence_count: row.co_occurrence_count,
        last_updated: row.last_updated,
        related_id: row.id,
        related_name: row.name,
        related_type: row.type,
      }))
    },

    insertEntityEvent(entityId: string, eventId: string, role: string) {
      stmtInsertEntityEvent.run(entityId, eventId, role)
    },

    getEntityEvents(entityId: string): Array<{ event_id: string; role: string; created_at: string }> {
      return stmtGetEntityEvents.all(entityId).map((row) => ({
        event_id: row.event_id,
        role: row.role,
        created_at: row.created_at,
      }))
    },

    getEventEntities(eventId: string): Array<{ entity_id: string; role: string; created_at: string }> {
      return stmtGetEventEntities.all(eventId).map((row) => ({
        entity_id: row.entity_id,
        role: row.role,
        created_at: row.created_at,
      }))
    },

    getStats(): DatabaseStats {
      const chunkCount = stmtCountChunks.get()
      const fileCount = stmtCountFiles.get()
      let dbSize = 0
      try {
        const file = Bun.file(dbPath)
        dbSize = file.size
      } catch {
        dbSize = 0
      }
      return {
        totalChunks: chunkCount?.count ?? 0,
        totalFiles: fileCount?.file_count ?? 0,
        dbSizeBytes: dbSize,
      }
    },

    optimize() {
      db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES('optimize')`)
    },
  }
}
