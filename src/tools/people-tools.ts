import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { BrainToolDeps } from "./types"
import { BRAIN_PEOPLE_LOOKUP_DESCRIPTION, BRAIN_RELATIONSHIP_MAP_DESCRIPTION, RELATIONSHIP_TYPES } from "./constants"

type RelationshipNode = {
  id: string
  type: "person"
  label: string
}

type RelationshipEdge = {
  source: string
  target: string
  weight: number
}

function byLastSeenDesc(a: { last_seen: string }, b: { last_seen: string }): number {
  return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
}

function normalizeDepth(depth: number | undefined): number {
  if (depth === undefined) return 1
  return Math.max(1, Math.min(3, Math.floor(depth)))
}

export function createPeopleTools(deps: BrainToolDeps): Record<string, ToolDefinition> {
  const brain_people_lookup: ToolDefinition = tool({
    description: BRAIN_PEOPLE_LOOKUP_DESCRIPTION,
    args: {
      name: tool.schema.string().optional().describe("Person name to search for"),
      role: tool.schema.string().optional().describe("Filter by role"),
      company: tool.schema.string().optional().describe("Filter by company"),
      relationship: tool.schema.enum(RELATIONSHIP_TYPES).optional().describe("Filter by relationship type"),
      limit: tool.schema.number().optional().describe("Max results (default: 20)"),
    },
    execute: async (args) => {
      if (!deps.personStore) {
        return JSON.stringify({
          results: [],
          total: 0,
          message: "People store not available. Log a meeting first to start building your network.",
        })
      }

      let people = await deps.personStore.list()

      if (args.name) {
        const nameMatches = await deps.personStore.findByName(args.name)
        const matchingIds = new Set(nameMatches.map(person => person.id))
        people = people.filter(person => matchingIds.has(person.id))
      }

      if (args.role) {
        const roleQuery = args.role.toLowerCase()
        people = people.filter(person => person.role?.toLowerCase().includes(roleQuery))
      }

      if (args.company) {
        const companyQuery = args.company.toLowerCase()
        people = people.filter(person => person.company?.toLowerCase().includes(companyQuery))
      }

      if (args.relationship) {
        people = people.filter(person => person.relationship === args.relationship)
      }

      people.sort(byLastSeenDesc)

      const limit = args.limit ?? 20
      const boundedLimit = limit < 0 ? 0 : limit
      const results = people.slice(0, boundedLimit).map(person => ({
        name: person.name,
        role: person.role,
        company: person.company,
        relationship: person.relationship,
        last_seen: person.last_seen,
        interaction_count: person.interaction_count,
        key_topics: person.key_topics,
        vault_path: person.vault_path,
      }))

      return JSON.stringify({ results, total: people.length })
    },
  })

  const brain_relationship_map: ToolDefinition = tool({
    description: BRAIN_RELATIONSHIP_MAP_DESCRIPTION,
    args: {
      person_name: tool.schema.string().min(1).describe("Person name to center the map on"),
      depth: tool.schema.number().optional().describe("Relationship depth 1-3 (default: 1)"),
    },
    execute: async (args) => {
      if (!deps.personStore || !deps.decisionStore) {
        return JSON.stringify({
          error: "Relationship map unavailable. Person and decision stores are required.",
          code: "STORE_UNAVAILABLE",
        })
      }

      const centerMatches = await deps.personStore.findByName(args.person_name)
      if (centerMatches.length === 0) {
        return JSON.stringify({ error: "Person not found", code: "PERSON_NOT_FOUND" })
      }

      const centerPerson = centerMatches[0]
      const allPeople = await deps.personStore.list()
      const allDecisions = await deps.decisionStore.list()
      const maxDepth = normalizeDepth(args.depth)

      const peopleByKnownName = new Map<string, (typeof allPeople)[number]>()
      for (const person of allPeople) {
        peopleByKnownName.set(person.name.toLowerCase(), person)
        for (const alias of person.aliases) {
          peopleByKnownName.set(alias.toLowerCase(), person)
        }
      }

      const nodeMap = new Map<string, RelationshipNode>()
      const edgeMap = new Map<string, RelationshipEdge>()
      nodeMap.set(centerPerson.id, {
        id: centerPerson.id,
        type: "person",
        label: centerPerson.name,
      })

      const visited = new Set<string>([centerPerson.id])
      let frontier: Array<(typeof allPeople)[number]> = [centerPerson]

      for (let level = 0; level < maxDepth; level += 1) {
        const nextById = new Map<string, (typeof allPeople)[number]>()

        for (const currentPerson of frontier) {
          const relatedDecisions = allDecisions.filter(decision =>
            decision.participants.some(participant => participant.toLowerCase() === currentPerson.name.toLowerCase()),
          )

          for (const decision of relatedDecisions) {
            for (const participantName of decision.participants) {
              if (participantName.toLowerCase() === currentPerson.name.toLowerCase()) continue

              const connectedPerson = peopleByKnownName.get(participantName.toLowerCase())
              if (!connectedPerson) continue

              nodeMap.set(connectedPerson.id, {
                id: connectedPerson.id,
                type: "person",
                label: connectedPerson.name,
              })

              const [left, right] = [currentPerson.id, connectedPerson.id].sort()
              const edgeKey = `${left}::${right}`
              const existing = edgeMap.get(edgeKey)
              if (existing) {
                existing.weight += 1
              } else {
                edgeMap.set(edgeKey, {
                  source: left,
                  target: right,
                  weight: 1,
                })
              }

              if (level < maxDepth - 1 && !visited.has(connectedPerson.id)) {
                nextById.set(connectedPerson.id, connectedPerson)
              }
            }
          }
        }

        for (const personId of nextById.keys()) {
          visited.add(personId)
        }
        frontier = Array.from(nextById.values())
      }

      return JSON.stringify({
        person: centerPerson.name,
        nodes: Array.from(nodeMap.values()),
        edges: Array.from(edgeMap.values()),
      })
    },
  })

  return {
    brain_people_lookup,
    brain_relationship_map,
  }
}
