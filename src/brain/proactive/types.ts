/**
 * Type definitions for the Phase 3 proactive system.
 * Covers scoring, triggers, delivery, receptivity, and morning-brief modules.
 */

import type { BrainPaths } from "../vault/paths";
import type { CommitmentStore, DecisionStore, PersonStore } from "../stores/types";
import type { AkashicReader } from "../akashic/types";
import type { EntityIndex } from "../search/types";
import type { DailyConsolidator } from "../consolidation/daily-consolidator";

/**
 * Scoring components for proactive message decisions.
 * Each component ranges from 0-1 representing relevance/urgency.
 * The total is a weighted sum of all components.
 */
export interface SpeakScore {
  urgency: number;
  attention_state: number;
  time_of_day: number;
  recency: number;
  receptivity: number;
  total: number;
}

/**
 * Configuration parameters for the proactive engine.
 * Controls thresholds, budgets, timing, and quiet hours.
 */
export interface SpeakConfig {
  threshold: number;
  daily_budget: number;
  min_interval_minutes: number;
  quiet_hours: {
    start: number;
    end: number;
  };
}

/**
 * Discriminated union type for all proactive triggers.
 * Each trigger represents a reason to speak up proactively.
 */
export type ProactiveTrigger =
  | { type: "time"; subtype: "morning_brief" }
  | { type: "time"; subtype: "weekly_review" }
  | { type: "context"; subtype: "topic_seen_before"; topic: string }
  | { type: "context"; subtype: "person_mentioned"; person: string }
  | { type: "pattern"; subtype: "commitment_overdue"; commitment: string }
  | { type: "pattern"; subtype: "decision_reversal"; decision: string }
  | { type: "pattern"; subtype: "repeated_topic"; topic: string; count: number };

/**
 * Decision outcome from the proactive engine.
 * Indicates whether to speak, the reasoning, and the confidence score.
 */
export interface SpeakDecision {
  speak: boolean;
  reason: string;
  score: number;
}

/**
 * A proactive message ready for delivery.
 * Contains the trigger, message, reasoning, and metadata.
 */
export interface ProactiveMessage {
  trigger: ProactiveTrigger;
  message: string;
  why_now: string;
  score: number;
  timestamp: string;
}

/**
 * Record of user reaction to a proactive message.
 * Used for training receptivity models and understanding effectiveness.
 */
export interface ReceptivityRecord {
  trigger_type: ProactiveTrigger["type"];
  trigger_subtype: string;
  user_reaction: "engaged" | "ignored" | "dismissed";
  timestamp: string;
  session_id: string;
}

/**
 * Current state of the daily message budget.
 * Tracks messages sent today and timing for rate limiting.
 */
export interface BudgetState {
  date: string;
  messages_sent: number;
  last_message_at: string | null;
}

/**
 * Main engine interface for proactive message generation and feedback.
 * Responsible for evaluating triggers and managing receptivity learning.
 */
export interface ProactiveEngine {
  evaluate(sessionId: string, currentHour: number): Promise<ProactiveMessage | null>;
  recordReaction(record: ReceptivityRecord): Promise<void>;
  getBudgetState(): BudgetState;
  resetBudget(): void;
}

/**
 * Dependencies for the ProactiveEngine.
 * Provides access to stores, indices, and consolidation services.
 */
export interface ProactiveEngineDeps {
  paths: BrainPaths;
  commitmentStore: CommitmentStore | null;
  decisionStore: DecisionStore | null;
  personStore: PersonStore | null;
  akashicReader: AkashicReader | null;
  entityIndex: EntityIndex | null;
  dailyConsolidator: DailyConsolidator;
}
