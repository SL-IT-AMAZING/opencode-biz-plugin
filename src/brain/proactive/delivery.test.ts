import { describe, expect, test } from "bun:test";
import { createDeliveryManager } from "./delivery";
import type { ProactiveMessage, ProactiveTrigger } from "./types";

describe("delivery manager", () => {
  test("#given morning_brief trigger #when formatMessage #then why_now contains Korean morning text", () => {
    const manager = createDeliveryManager();
    const trigger: ProactiveTrigger = { type: "time", subtype: "morning_brief" };

    const message = manager.formatMessage(trigger, "아침 브리핑입니다.", 0.9);

    expect(message.why_now).toContain("하루의 첫 상호작용입니다");
  });

  test("#given commitment_overdue trigger #when formatMessage #then why_now includes commitment description", () => {
    const manager = createDeliveryManager();
    const trigger: ProactiveTrigger = {
      type: "pattern",
      subtype: "commitment_overdue",
      commitment: "투자자 업데이트 메일 발송",
    };

    const message = manager.formatMessage(trigger, "리마인드가 필요합니다.", 0.88);

    expect(message.why_now).toContain("투자자 업데이트 메일 발송");
  });

  test("#given topic_seen_before trigger #when formatMessage #then why_now includes topic name", () => {
    const manager = createDeliveryManager();
    const trigger: ProactiveTrigger = {
      type: "context",
      subtype: "topic_seen_before",
      topic: "채용 전략",
    };

    const message = manager.formatMessage(trigger, "관련 맥락이 있습니다.", 0.72);

    expect(message.why_now).toContain("채용 전략");
  });

  test("#given a ProactiveMessage #when formatSystemPromptSection #then returns XML-tagged string with brain-proactive tags", () => {
    const manager = createDeliveryManager();
    const proactiveMessage: ProactiveMessage = {
      trigger: { type: "time", subtype: "weekly_review" },
      message: "주간 회고를 시작하세요.",
      why_now: "금요일 오후입니다. 이번 주를 돌아볼 시간입니다.",
      score: 0.95,
      timestamp: new Date().toISOString(),
    };

    const section = manager.formatSystemPromptSection(proactiveMessage);

    expect(section).toContain("<brain-proactive>");
    expect(section).toContain("</brain-proactive>");
    expect(section).toContain("왜 지금:");
  });

  test("#given fresh delivery manager #when getBudgetState #then messages_sent is 0", () => {
    const manager = createDeliveryManager();

    const budget = manager.getBudgetState();

    expect(budget.messages_sent).toBe(0);
    expect(budget.last_message_at).toBeNull();
  });

  test("#given delivery manager #when recordDelivery called twice #then messages_sent is 2", () => {
    const manager = createDeliveryManager();

    manager.recordDelivery();
    manager.recordDelivery();

    const budget = manager.getBudgetState();
    expect(budget.messages_sent).toBe(2);
    expect(budget.last_message_at).not.toBeNull();
  });

  test("#given delivery manager with deliveries #when resetBudget #then messages_sent resets to 0", () => {
    const manager = createDeliveryManager();
    manager.recordDelivery();
    manager.recordDelivery();

    manager.resetBudget();

    const budget = manager.getBudgetState();
    expect(budget.messages_sent).toBe(0);
    expect(budget.last_message_at).toBeNull();
  });

  test("#given delivery on yesterday #when recordDelivery today #then auto-resets budget first", () => {
    const manager = createDeliveryManager();
    manager.recordDelivery();

    const budget = manager.getBudgetState();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    budget.date = yesterday;
    budget.messages_sent = 5;
    budget.last_message_at = new Date(Date.now() - 1000).toISOString();

    manager.recordDelivery();

    const updatedBudget = manager.getBudgetState();
    expect(updatedBudget.messages_sent).toBe(1);
  });

  test("#given repeated_topic trigger with count=3 #when formatMessage #then why_now includes count", () => {
    const manager = createDeliveryManager();
    const trigger: ProactiveTrigger = {
      type: "pattern",
      subtype: "repeated_topic",
      topic: "제품 가격 정책",
      count: 3,
    };

    const message = manager.formatMessage(trigger, "반복 주제입니다.", 0.67);

    expect(message.why_now).toContain("3번째");
  });

  test("#given person_mentioned trigger #when formatMessage #then why_now includes person name", () => {
    const manager = createDeliveryManager();
    const trigger: ProactiveTrigger = {
      type: "context",
      subtype: "person_mentioned",
      person: "민지",
    };

    const message = manager.formatMessage(trigger, "인물 관련 업데이트입니다.", 0.75);

    expect(message.why_now).toContain("민지");
  });
});
