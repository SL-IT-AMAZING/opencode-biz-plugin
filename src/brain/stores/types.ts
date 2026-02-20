import type { PersonRecord, DecisionRecord, Commitment } from "../types"

export interface PersonStore {
  add(person: PersonRecord): Promise<void>
  get(id: string): Promise<PersonRecord | undefined>
  findByName(name: string): Promise<PersonRecord[]>
  update(id: string, updates: Partial<PersonRecord>): Promise<PersonRecord | undefined>
  list(): Promise<PersonRecord[]>
  count(): Promise<number>
}

export interface DecisionStore {
  add(decision: DecisionRecord): Promise<void>
  get(id: string): Promise<DecisionRecord | undefined>
  listByStatus(status: DecisionRecord["status"]): Promise<DecisionRecord[]>
  search(query: string): Promise<DecisionRecord[]>
  update(id: string, updates: Partial<DecisionRecord>): Promise<DecisionRecord | undefined>
  list(): Promise<DecisionRecord[]>
  count(): Promise<number>
}

export interface CommitmentStore {
  add(commitment: Commitment): Promise<void>
  get(id: string): Promise<Commitment | undefined>
  listByStatus(status: Commitment["status"]): Promise<Commitment[]>
  listOverdue(now?: Date): Promise<Commitment[]>
  complete(id: string): Promise<Commitment | undefined>
  cancel(id: string): Promise<Commitment | undefined>
  update(id: string, updates: Partial<Commitment>): Promise<Commitment | undefined>
  list(): Promise<Commitment[]>
  count(): Promise<number>
}
