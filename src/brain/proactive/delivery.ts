import type { BudgetState, ProactiveMessage, ProactiveTrigger } from "./types";

export interface DeliveryManager {
  formatMessage(trigger: ProactiveTrigger, messageDraft: string, score: number): ProactiveMessage;
  formatSystemPromptSection(message: ProactiveMessage): string;
  getBudgetState(): BudgetState;
  recordDelivery(): void;
  resetBudget(): void;
  isDayChanged(now?: Date): boolean;
}

const getIsoDate = (now: Date): string => now.toISOString().split("T")[0];

const getWhyNow = (trigger: ProactiveTrigger): string => {
  if (trigger.type === "time") {
    if (trigger.subtype === "morning_brief") {
      return "하루의 첫 상호작용입니다. 어제의 주요 사항을 정리했습니다.";
    }

    return "금요일 오후입니다. 이번 주를 돌아볼 시간입니다.";
  }

  if (trigger.type === "context") {
    if (trigger.subtype === "topic_seen_before") {
      return `이 주제(${trigger.topic})를 이전에 논의한 적이 있습니다.`;
    }

    return `${trigger.person}님과 관련된 정보가 있습니다.`;
  }

  if (trigger.subtype === "commitment_overdue") {
    return `약속 기한이 지났습니다: ${trigger.commitment}`;
  }

  if (trigger.subtype === "decision_reversal") {
    return `이전과 반대되는 의사결정이 감지되었습니다: ${trigger.decision}`;
  }

  return `이 주제(${trigger.topic})를 ${trigger.count}번째 논의 중입니다.`;
};

export const createDeliveryManager = (): DeliveryManager => {
  let budgetState: BudgetState = {
    date: getIsoDate(new Date()),
    messages_sent: 0,
    last_message_at: null,
  };

  const resetBudgetWithDate = (now: Date): void => {
    budgetState = {
      date: getIsoDate(now),
      messages_sent: 0,
      last_message_at: null,
    };
  };

  return {
    formatMessage(trigger, messageDraft, score) {
      return {
        trigger,
        message: messageDraft,
        why_now: getWhyNow(trigger),
        score,
        timestamp: new Date().toISOString(),
      };
    },

    formatSystemPromptSection(message) {
      return `<brain-proactive>\n💡 ${message.message}\n\n왜 지금: ${message.why_now}\n</brain-proactive>`;
    },

    getBudgetState() {
      return budgetState;
    },

    recordDelivery() {
      const now = new Date();

      if (this.isDayChanged(now)) {
        resetBudgetWithDate(now);
      }

      budgetState = {
        ...budgetState,
        messages_sent: budgetState.messages_sent + 1,
        last_message_at: now.toISOString(),
      };
    },

    resetBudget() {
      resetBudgetWithDate(new Date());
    },

    isDayChanged(now = new Date()) {
      return getIsoDate(now) !== budgetState.date;
    },
  };
};
