import type { BrainDatabase, EntityIndex } from "./types"

interface EntityListRow {
  id: string
  type: string
  name: string
  aliases: string
  vault_path: string | null
  interaction_count: number
}

function parseAliases(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function createEntityIndex(db: BrainDatabase): EntityIndex {
  return {
    async upsertEntity(entity: { type: string; name: string; aliases?: string[]; vault_path?: string }): Promise<string> {
      const id = crypto.randomUUID()
      const aliases = entity.aliases ?? []
      const serializedAliases = JSON.stringify(aliases)

      db.upsertEntity({
        id,
        type: entity.type,
        name: entity.name,
        aliases: parseAliases(serializedAliases),
        vault_path: entity.vault_path,
      })

      return id
    },

    async findEntity(query: string, limit?: number): Promise<Array<{
      id: string
      type: string
      name: string
      aliases: string[]
      vault_path: string | null
      first_seen: string
      last_seen: string
      interaction_count: number
    }>> {
      const rows = db.findEntities(query, limit ?? 20)

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        aliases: parseAliases(row.aliases),
        vault_path: row.vault_path,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        interaction_count: row.interaction_count,
      }))
    },

    async recordCoOccurrence(entityIds: string[], eventId: string, role?: string): Promise<void> {
      const eventRole = role ?? "mentioned"

      for (const entityId of entityIds) {
        db.insertEntityEvent(entityId, eventId, eventRole)
      }

      for (let i = 0; i < entityIds.length; i += 1) {
        for (let j = i + 1; j < entityIds.length; j += 1) {
          db.upsertRelation(entityIds[i], entityIds[j])
        }
      }
    },

    async getRelated(entityId: string, limit?: number): Promise<Array<{
      entity: { id: string; type: string; name: string; aliases: string[]; vault_path: string | null }
      co_occurrence_count: number
      decayed_weight: number
    }>> {
      const rows = db.getRelated(entityId, limit ?? 10)
      const now = Date.now()

      return rows.map((row) => {
        const daysSinceLastUpdated = (now - new Date(row.last_updated).getTime()) / (1000 * 60 * 60 * 24)
        const decayedWeight = row.co_occurrence_count * Math.pow(0.5, daysSinceLastUpdated / 30)
        const relatedEntity = db.getEntity(row.related_id)

        return {
          entity: {
            id: row.related_id,
            type: row.related_type,
            name: row.related_name,
            aliases: parseAliases(relatedEntity?.aliases),
            vault_path: relatedEntity?.vault_path ?? null,
          },
          co_occurrence_count: row.co_occurrence_count,
          decayed_weight: decayedWeight,
        }
      })
    },

    async getEntity(id: string): Promise<{
      id: string
      type: string
      name: string
      aliases: string[]
      vault_path: string | null
      first_seen: string
      last_seen: string
      interaction_count: number
    } | undefined> {
      const row = db.getEntity(id)
      if (!row) return undefined

      return {
        id: row.id,
        type: row.type,
        name: row.name,
        aliases: parseAliases(row.aliases),
        vault_path: row.vault_path,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        interaction_count: row.interaction_count,
      }
    },

    async listEntities(type?: string): Promise<Array<{
      id: string
      type: string
      name: string
      aliases: string[]
      vault_path: string | null
      interaction_count: number
    }>> {
      const baseQuery = "SELECT id, type, name, aliases, vault_path, interaction_count FROM entities"

      const rows = type
        ? db.raw.prepare<EntityListRow, [string]>(`${baseQuery} WHERE type = ? ORDER BY interaction_count DESC, name ASC`).all(type)
        : db.raw.prepare<EntityListRow, []>(`${baseQuery} ORDER BY interaction_count DESC, name ASC`).all()

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        aliases: parseAliases(row.aliases),
        vault_path: row.vault_path,
        interaction_count: row.interaction_count,
      }))
    },
  }
}
