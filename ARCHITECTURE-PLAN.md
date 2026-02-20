# JARVIS CEO Assistant — Architecture Plan
# 자비스 CEO 어시스턴트 — 아키텍처 플랜

> **Version**: 2.0 | **Date**: 2026-02-20
> **Status**: v2.0 — Oracle + Momus 리뷰 통합 완료
> **Author**: Sisyphus Orchestrator (8개 리서치 에이전트 + OpenClaw 분석 종합)
> **Review**: Oracle 아키텍처 리뷰 + Momus 완성도/검증 리뷰 통합 (2026-02-20)

---

## 목차 (Table of Contents)

1. [비전 & 원칙](#1-비전--원칙-vision--principles)
2. [현재 상태 분석](#2-현재-상태-분석-current-state)
3. [타겟 아키텍처](#3-타겟-아키텍처-target-architecture)
4. [뇌 과학 → 코드 매핑](#4-뇌-과학--코드-매핑-neuroscience-mapping)
5. [Phase 1: CEO 이벤트 스키마 & 기억 구조 리팩토링](#5-phase-1-ceo-이벤트-스키마--기억-구조-리팩토링-month-1)
6. [Phase 2: 엔티티 & 의사결정 검색 + 출처 추적](#6-phase-2-엔티티--의사결정-검색--출처-추적-month-2)
7. [Phase 3: 프로액티브 AI 업그레이드](#7-phase-3-프로액티브-ai-업그레이드-month-3)
8. [Phase 4: 멀티에이전트 의사결정 지원](#8-phase-4-멀티에이전트-의사결정-지원-month-4)
9. [Phase 5: 감사 가능한 롤업 & 패턴 트리거](#9-phase-5-감사-가능한-롤업--패턴-트리거-month-5)
10. [Phase 6: 에이전트 빌더 & 확장 시스템](#10-phase-6-에이전트-빌더--확장-시스템-month-6)
11. [옵시디언 볼트 구조 & 템플릿](#11-옵시디언-볼트-구조--템플릿)
12. [의존성 & 기술 스택](#12-의존성--기술-스택)
13. [테스트 전략](#13-테스트-전략)
14. [위험 요소 & 완화 방안](#14-위험-요소--완화-방안)
15. [부록: OpenClaw에서 가져온 패턴](#15-부록-openclaw에서-가져온-패턴)

---

## 1. 비전 & 원칙 (Vision & Principles)

### 비전

스타트업 CEO가 매일 사용하는 JARVIS — **생각을 정리**하고, **의사결정을 지원**하며, **먼저 말하는** AI 어시스턴트.

인간의 뇌 구조를 과학적으로 본뜬 기억 시스템 위에, 멀티에이전트 토론 엔진과 프로액티브 행동 엔진을 결합한 독립 OpenCode 플러그인.

### 핵심 원칙

| # | 원칙 | 이유 |
|---|------|------|
| 1 | **80/20 가치 우선** | CEO 이벤트 스키마 + 출처 추적 의사결정 저널 + 저방해 프로액티브 루프 = 가치의 80% (Oracle 결론) |
| 2 | **신뢰가 핵심 문제** | 자신감 있지만 틀린 합성, 기억 오염, 출처 불명 = 가장 어려운 문제. 모든 출력에 인용 필수 |
| 3 | **기존 테스트 보호** | 297개 테스트, 1,071 assertion은 반드시 통과. 리팩토링하되 재작성 금지 |
| 4 | **점진적 가치 전달** | 각 Phase 완료 시 CEO가 즉시 사용 가능한 가치 있는 기능 전달 |
| 5 | **뇌 은유는 UI** | 뇌 과학은 시스템 사고의 도구로 사용하되, 강제로 뇌 구조를 소프트웨어에 맞추지 않음 |
| 6 | **TDD 필수** | 모든 새 기능과 버그 수정에 테스트 우선 개발 적용 |
| 7 | **옵시디언 = 진실의 원천** | 모든 데이터는 인간이 읽을 수 있는 마크다운 + 기계가 파싱 가능한 YAML frontmatter |

### 제약 조건

- **런타임**: Bun (bun run, bun build, bunx — npm/yarn 금지)
- **타입**: bun-types (not @types/node)
- **패턴**: 팩토리 패턴 (createXXX), kebab-case 디렉토리
- **SDK**: `@opencode-ai/plugin` — `tool()`, `tool.schema`, Plugin type
- **금지**: `as any`, `@ts-ignore`, `@ts-expect-error`, 빈 catch 블록

---

## 2. 현재 상태 분석 (Current State)

### 작동하는 것 (유지)

| 컴포넌트 | 상태 | 뇌 매핑 | 유지/수정 |
|----------|------|---------|-----------|
| Akashic Logger (JSONL, ULID) | ✅ 작동 | 해마 (Hippocampus) — 일시적 사건 기록 | **유지** — 이벤트 타입만 확장 |
| Thalamus Watcher (chokidar) | ✅ 작동 | 시상 (Thalamus) — 감각 필터링 | **수정** — 파일 감시 외에 대화 감지 추가 |
| Change Scorer (0-100) | ✅ 작동 | 편도체 (Amygdala) — 중요도 평가 | **확장** — CEO 비즈니스 중요도 기준 추가 |
| SQLite FTS5 + Hybrid Search | ✅ 작동 | 대뇌피질 (Cortex) — 장기 기억 검색 | **유지** — 쿼리 패턴만 비즈니스 최적화 |
| Temporal Decay + MMR | ✅ 작동 | 시냅스 가지치기 (Pruning) | **유지** |
| Micro/Sleep Consolidation | ✅ 작동 | 수면 통합 (Sleep Consolidation) | **수정** — CEO 도메인 요약으로 전환 |
| Heartbeat | ✅ 작동 | 기저핵 (Basal Ganglia) — 습관적 행동 | **대폭 확장** → 프로액티브 엔진으로 |
| 5 Brain Tools | ✅ 작동 | — | **확장** — CEO 도메인 도구 추가 |

### 변경 필요한 것

| 현재 (Dev-centric) | 목표 (CEO-centric) | 변경 범위 |
|--------------------|--------------------|-----------|
| `file.created/modified/deleted` | `conversation.logged`, `meeting.recorded`, `decision.made` | 타입 확장 |
| `active_files: string[]` | `active_topics: string[]`, `people_involved: string[]` | WorkingMemory 확장 |
| `files_changed: Array<{path, summary}>` | `interactions: Array<{type, participants, summary}>` | DailyMemory 확장 |
| 파일 변경 스코어링 | 비즈니스 중요도 스코어링 (투자, 인사, 제품 등) | 스코어러 확장 |
| 5 tools (search/get/write/recall/consolidate) | +7 tools (log_meeting, log_decision, people_lookup 등) | 도구 추가 |

---

## 3. 타겟 아키텍처 (Target Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode Plugin Host                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              opencode-plugin-brain (JARVIS)           │   │
│  │                                                       │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │  Thalamus    │  │   Cortex     │  │  Prefrontal│  │   │
│  │  │  (감지/필터) │  │  (검색/기억) │  │  (의사결정)│  │   │
│  │  │             │  │              │  │            │  │   │
│  │  │ • 대화 감지  │  │ • 하이브리드 │  │ • 멀티     │  │   │
│  │  │ • 파일 감시  │  │   검색       │  │   에이전트 │  │   │
│  │  │ • 중요도     │  │ • 엔티티     │  │ • 토론     │  │   │
│  │  │   스코어링   │  │   인덱싱     │  │ • 액션메모 │  │   │
│  │  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │   │
│  │         │                │                 │         │   │
│  │  ┌──────▼────────────────▼─────────────────▼──────┐  │   │
│  │  │              Hippocampus (Akashic Record)       │  │   │
│  │  │     JSONL 이벤트 로그 + ULID + 출처 추적        │  │   │
│  │  └──────────────────┬─────────────────────────────┘  │   │
│  │                     │                                 │   │
│  │  ┌──────────────────▼─────────────────────────────┐  │   │
│  │  │           Consolidation Engine                  │  │   │
│  │  │  마이크로 → 일일 → 주간 → 월간 롤업             │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                                                       │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │          Proactive Engine (DMN)                 │  │   │
│  │  │  트리거 → 스코어링 → 전달 → 학습                │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                                                       │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │              Tools (12+)                        │  │   │
│  │  │  search, get, write, recall, consolidate,       │  │   │
│  │  │  log_meeting, log_decision, people_lookup,      │  │   │
│  │  │  commitment_track, morning_brief, debate,       │  │   │
│  │  │  create_agent                                   │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                    ┌─────────▼─────────┐                    │
│                    │  Obsidian Vault    │                    │
│                    │  (진실의 원천)      │                    │
│                    └───────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 모듈 구조 (확장 후)

```
src/
├── index.ts                    # Plugin entry (수정 — 새 모듈 와이어링)
├── shared/
│   ├── logger.ts               # (유지)
│   └── provenance.ts           # NEW — 출처 추적 유틸리티
├── brain/
│   ├── types.ts                # (확장 — CEO 이벤트 타입 추가)
│   ├── config.ts               # (확장 — 새 설정 스키마)
│   ├── vault/                  # (수정 — CEO 볼트 템플릿)
│   │   ├── paths.ts
│   │   ├── templates.ts        # (확장 — 회의록, 의사결정 로그 등)
│   │   ├── lock.ts
│   │   └── scaffold.ts         # (수정 — CEO 디렉토리 구조)
│   ├── thalamus/               # (확장)
│   │   ├── watcher.ts          # (유지 — 파일 감시)
│   │   ├── scorer.ts           # (확장 — 비즈니스 스코어러)
│   │   └── conversation-detector.ts  # NEW — 대화 패턴 감지
│   ├── akashic/                # (확장 — CEO 이벤트 지원)
│   │   ├── logger.ts
│   │   └── reader.ts
│   ├── search/                 # (유지 — 쿼리 패턴만 최적화)
│   │   ├── db.ts, fts.ts, chunker.ts, indexer.ts
│   │   ├── hybrid-searcher.ts
│   │   ├── entity-index.ts     # NEW — 사람/회사/프로젝트 인덱스
│   │   └── ...existing files
│   ├── consolidation/          # (수정 — CEO 도메인 요약)
│   │   ├── micro-consolidator.ts
│   │   ├── daily-consolidator.ts    # (수정 — CEO 일일 요약)
│   │   ├── archival-rollup.ts
│   │   └── sleep-consolidator.ts
│   ├── heartbeat/              # → proactive/ 로 진화
│   │   └── heartbeat.ts        # (유지 — Phase 3에서 확장)
│   ├── proactive/              # NEW (Phase 3)
│   │   ├── trigger-engine.ts   # 트리거 타입 관리
│   │   ├── scoring.ts          # Should-I-Speak 스코어링
│   │   ├── delivery.ts         # 전달 메커니즘
│   │   ├── receptivity.ts      # 사용자 수용성 학습
│   │   └── morning-brief.ts    # 아침 브리핑 생성
│   └── decision/               # NEW (Phase 4)
│       ├── orchestrator.ts     # 멀티에이전트 오케스트레이터
│       ├── agents/
│       │   ├── researcher.ts   # 정보 수집 에이전트
│       │   ├── advocate.ts     # 찬성 에이전트
│       │   ├── critic.ts       # 반대 에이전트
│       │   ├── synthesizer.ts  # 종합 에이전트
│       │   └── devils-advocate.ts  # 최종 검증
│       ├── anti-sycophancy.ts  # 아첨 방지 메커니즘
│       ├── action-memo.ts      # 액션 메모 생성
│       └── agent-builder.ts    # NEW (Phase 6) — 동적 에이전트 생성
├── tools/                      # (확장)
│   ├── constants.ts            # (수정 — 새 도구 설명)
│   ├── index.ts                # (수정 — 새 도구 등록)
│   ├── tools.ts                # (수정 — 기존 5개 도구 CEO 최적화)
│   ├── types.ts                # (확장 — 새 deps)
│   ├── meeting-tools.ts        # NEW — log_meeting, meeting_summary
│   ├── decision-tools.ts       # NEW — log_decision, decision_review
│   ├── people-tools.ts         # NEW — people_lookup, relationship_map
│   ├── commitment-tools.ts     # NEW — track_commitment, check_commitments
│   ├── proactive-tools.ts      # NEW — morning_brief, configure_proactive
│   ├── debate-tools.ts         # NEW — start_debate, review_decision
│   └── agent-builder-tools.ts  # NEW (Phase 6)
└── hooks/                      # (확장)
    ├── index.ts                # (수정)
    └── event-hooks.ts          # (확장 — CEO 이벤트 처리)
```

---

## 4. 뇌 과학 → 코드 매핑 (Neuroscience Mapping)

| 뇌 구조 | 기능 | 코드 구현 | Phase |
|---------|------|-----------|-------|
| **해마 (Hippocampus)** | 일시적 사건 기록 → 장기 기억 전환 | `akashic/logger.ts` — JSONL + ULID + provenance | 기존 + P1 |
| **시상 (Thalamus)** | 감각 입력 필터링 & 라우팅 | `thalamus/watcher.ts` + `scorer.ts` — 중요도 필터 | 기존 + P1 |
| **편도체 (Amygdala)** | 감정적 중요도 태깅 | `scorer.ts`의 비즈니스 중요도 가중치 | P1 |
| **대뇌피질 (Cortex)** | 장기 기억 저장 & 검색 | `search/` — FTS5 + Vector + RRF | 기존 |
| **CA3 (Pattern Completion)** | 불완전 쿼리에서 전체 기억 복원 | `search/hybrid-searcher.ts` — 유사도 기반 완성 | 기존 |
| **전전두엽 (Prefrontal)** | 의사결정, 계획, 실행 제어 | `decision/orchestrator.ts` — 멀티에이전트 | P4 |
| **DMN (Default Mode Network)** | 유휴 시 통찰 생성 | `proactive/trigger-engine.ts` — 패턴 기반 트리거 | P3 |
| **수면 통합 (Sleep Consolidation)** | 기억 강화 & 가지치기 | `consolidation/` — 일일→주간→월간 | 기존 + P5 |
| **전향 기억 (Prospective Memory)** | 의도 + 트리거 큐 → 실행 | `commitment-tools.ts` + `proactive/trigger-engine.ts` | P2 + P3 |
| **STDP (학습)** | 인과 관계 기반 연결 강화 | `entity-index.ts` — 공동 출현 빈도 기반 관계 가중치 | P2 |
| **시냅스 가지치기 (Pruning)** | 미사용 연결 약화 | `temporal-decay.ts` — 기존 구현 | 기존 |
| **기억 재통합 (Reconsolidation)** | 회상 시 현재 맥락으로 갱신 | `brain_recall` 도구에서 접근 로그 기록 + 관련성 점수 갱신 | P2 |
| **확산 활성화 (Spreading Activation)** | 연관 기억 활성화 전파 | `entity-index.ts` — 엔티티 그래프 BFS 탐색 | P2 |

### 통합 점수 공식 (Consolidation Score)

```typescript
// 뇌과학 기반 — 어떤 기억이 장기 저장소에 들어가는가?
interface ConsolidationFactors {
  novelty: number       // 0-1: 이전에 본 적 없는 정보인가?
  arousal: number       // 0-1: 비즈니스 임팩트 (투자, 인사, 위기 등)
  reward: number        // 0-1: 의사결정 결과와의 연결성
  retrieval_count: number  // 검색된 횟수 (많을수록 중요)
}

function consolidationScore(f: ConsolidationFactors): number {
  const weights = { novelty: 0.3, arousal: 0.35, reward: 0.2, retrieval: 0.15 }
  return (
    f.novelty * weights.novelty +
    f.arousal * weights.arousal +
    f.reward * weights.reward +
    Math.min(f.retrieval_count / 10, 1) * weights.retrieval
  )
}
// threshold > 0.4 → 장기 기억 후보
```

### 4.5 Phase 0: SDK 실현 가능성 스파이크 (Week 0)

### 목표
Phase 1-4 착수 전에 SDK 핵심 capability 4개를 검증해 설계 전제를 확정한다.

### 스파이크 항목

1. `experimental.chat.system.transform` 훅이 시스템 프롬프트 주입을 안정적으로 수행하는가?
2. 새 chat/session 시작 시점을 플러그인이 감지할 수 있는가? (morning brief 트리거 전제)
3. 훅에서 사용자 메시지를 읽을 수 있는가? (conversation detection 전제)
4. 플러그인 SDK가 도구 내부 LLM call capability를 노출하는가? (Phase 4 멀티에이전트 전제)

### 성공 기준

- capability별로 정확한 hook 이름 + 실제 동작을 문서화
- 누락 capability는 workaround를 명시하거나 해당 Phase 재설계 flag 처리

### 타임라인

- Phase 1 시작 전 2-3일
- 산출물: `docs/sdk-spike-report.md`

---

## 5. Phase 1: CEO 이벤트 스키마 & 기억 구조 리팩토링 (Month 1)

### 목표
CEO가 JARVIS와 대화하면 그 내용이 자동으로 기록되고, 회의록/의사결정/약속이 구조화되어 저장된다.

### 성공 기준 (수락 테스트)

1. **회의록 생성 & 검색**
   - Given: CEO가 brain_log_meeting을 호출 (title="투자자 미팅", participants=["김대표", "이투자자"])
   - When: brain_search(query="투자자 미팅")
   - Then: 결과에 vault_path, provenance.source_type="meeting", 원문 인용 포함

2. **의사결정 기록 & 이력**
   - Given: brain_log_decision(title="시리즈A 진행", decision="Q3에 시작")
   - When: brain_decision_history(topic="시리즈A")
   - Then: 의사결정 레코드에 reasoning, alternatives, confidence 포함

3. **약속 추적**
   - Given: brain_track_commitment(description="IR 자료 준비", assigned_to="김대표", due_date="2026-03-01")
   - When: brain_check_commitments(overdue_only=true) (2026-03-02에 호출)
   - Then: 해당 약속이 overdue 상태로 반환

4. **빈 볼트 (cold start)**
   - Given: 볼트에 데이터 없음
   - When: brain_search(query="anything"), brain_check_commitments(), brain_people_lookup()
   - Then: 각 도구가 graceful empty response 반환 (에러가 아닌 빈 배열 + 안내 메시지)

5. **기존 테스트 회귀**
   - Then: 297개 기존 테스트 전부 통과

6. **신규 테스트**
   - Then: 50+ 신규 테스트 추가 (카운트는 게이트 아닌 목표)

### 5.1 타입 확장

**파일**: `src/brain/types.ts`

```typescript
// === 기존 유지 (하위 호환) ===
// file.created, file.modified 등은 그대로 유지

// === CEO 비즈니스 이벤트 추가 ===
export type CeoEventType =
  | "conversation.logged"      // AI와의 대화 기록
  | "meeting.recorded"         // 회의 기록
  | "decision.made"            // 의사결정 기록
  | "commitment.created"       // 약속/할일 생성
  | "commitment.completed"     // 약속 이행
  | "commitment.missed"        // 약속 미이행 (프로액티브 트리거)
  | "person.mentioned"         // 사람 언급
  | "topic.discussed"          // 주제 토론
  | "insight.generated"        // AI 인사이트 생성
  | "followup.needed"          // 후속 조치 필요

// AkashicEventType을 확장 (기존 + 신규)
export type AkashicEventType =
  | "file.created" | "file.modified" | "file.deleted" | "file.renamed"
  | "session.started" | "session.ended"
  | "decision.detected" | "task.completed"
  | "memory.consolidated" | "search.performed"
  | "user.prompt" | "agent.response"
  | CeoEventType  // 신규 CEO 타입 추가

// === 출처 추적 (Provenance) ===
export interface Provenance {
  source_type: "conversation" | "meeting" | "document" | "manual" | "ai_generated"
  source_id: string           // 원본 이벤트/파일 ID
  confidence: number          // 0-1: AI 생성 신뢰도
  created_by: "user" | "ai" | "system"
  citation?: string           // 원문 인용
}

// === AkashicEvent 확장 (Discriminated Union) ===
// NOTE: AkashicSource는 types.ts 내부에서만 확장한다 (single source of truth).
//       "AkashicSource | 'user' | ..." 형태의 임시 확장 유니온은 사용하지 않는다.
interface AkashicEventBase {
  id: string
  timestamp: string
  source: AkashicSource
  priority: number
  session_id?: string
  content_hash?: string
  provenance?: Provenance
}

export type AkashicEvent =
  // 기존 파일 이벤트
  | (AkashicEventBase & {
      type: "file.created" | "file.modified" | "file.deleted" | "file.renamed"
      data: {
        path: string
        diff_summary?: string
        content_snippet?: string
        tags?: string[]
        metadata?: Record<string, unknown>
      }
    })
  // CEO 이벤트
  | (AkashicEventBase & {
      type: "meeting.recorded"
      data: { participants: string[]; title: string; vault_path: string; topic?: string; entities?: EntityRef[] }
    })
  | (AkashicEventBase & {
      type: "decision.made"
      data: { decision: string; reasoning: string; confidence: "high" | "medium" | "low"; entities?: EntityRef[] }
    })
  | (AkashicEventBase & {
      type: "commitment.created"
      data: { description: string; assigned_to: string; due_date?: string; entities?: EntityRef[] }
    })
  | (AkashicEventBase & {
      type: "conversation.logged"
      data: { topic: string; participants?: string[]; content_snippet?: string; entities?: EntityRef[] }
    })
  // 기타 기존 이벤트 (session.started, search.performed 등)
  | (AkashicEventBase & {
      type: Exclude<
        AkashicEventType,
        "file.created" | "file.modified" | "file.deleted" | "file.renamed" |
        "meeting.recorded" | "decision.made" | "commitment.created" | "conversation.logged"
      >
      data: { metadata?: Record<string, unknown>; tags?: string[]; content_snippet?: string }
    })

// === 엔티티 참조 ===
export interface EntityRef {
  type: "person" | "company" | "project" | "topic"
  name: string
  vault_path?: string        // 옵시디언 파일 경로
}

// === CEO WorkingMemory (확장) ===
export interface WorkingMemory {
  session_id: string
  started_at: string
  updated_at: string
  context_summary: string
  // 기존 (하위 호환)
  active_files: string[]
  decisions: Array<{
    timestamp: string
    decision: string
    reasoning: string
    confidence: "high" | "medium" | "low"
  }>
  scratch: string
  retrieval_log: Array<{
    query: string
    results_count: number
    timestamp: string
  }>
  // CEO 확장
  active_topics: string[]           // 현재 세션 주제들
  people_involved: string[]         // 언급된 사람들
  open_commitments: Array<{         // 미이행 약속
    commitment: string
    due_date?: string
    assigned_to?: string
    status: "pending" | "in_progress" | "done" | "overdue"
  }>
  conversation_type?: "brainstorm" | "decision" | "review" | "planning" | "casual"
}

// === CEO DailyMemory (확장) ===
export interface DailyMemory {
  date: string
  summary: string
  // 기존 (하위 호환)
  key_decisions: Array<{ decision: string; context: string }>
  files_changed: Array<{ path: string; summary: string }>
  topics: string[]
  open_questions: string[]
  continuation_notes: string
  // CEO 확장
  meetings: Array<{
    title: string
    participants: string[]
    summary: string
    decisions: string[]
    action_items: string[]
    vault_path: string          // 옵시디언 회의록 경로
  }>
  interactions: Array<{
    type: "conversation" | "meeting" | "email" | "document"
    participants: string[]
    topic: string
    summary: string
  }>
  commitments_status: {
    created: number
    completed: number
    overdue: number
    carried_over: string[]
  }
  mood_signal?: "productive" | "stressed" | "reflective" | "urgent"
}

// === 사람 (CRM) ===
export interface PersonRecord {
  name: string
  aliases: string[]
  role?: string
  company?: string
  relationship: "team" | "investor" | "advisor" | "partner" | "customer" | "other"
  first_seen: string
  last_seen: string
  interaction_count: number
  key_topics: string[]
  notes: string
  vault_path: string
}

// === 의사결정 레코드 ===
export interface DecisionRecord {
  id: string
  timestamp: string
  title: string
  context: string
  decision: string
  reasoning: string
  alternatives_considered: string[]
  participants: string[]
  confidence: "high" | "medium" | "low"
  status: "proposed" | "decided" | "implemented" | "reversed"
  outcomes?: Array<{
    date: string
    description: string
    assessment: "positive" | "neutral" | "negative"
  }>
  provenance: Provenance
  vault_path: string
}

// === 약속/커밋먼트 ===
export interface Commitment {
  id: string
  created_at: string
  description: string
  assigned_to: string
  due_date?: string
  source_event_id: string     // 어디서 나온 약속인가
  status: "pending" | "in_progress" | "done" | "overdue" | "cancelled"
  completed_at?: string
  vault_path?: string
}
```

### 5.2 비즈니스 스코어러 확장

**파일**: `src/brain/thalamus/scorer.ts` (확장)

```typescript
// 기존 파일 변경 스코어러 유지
// 비즈니스 이벤트 스코어러 추가

export interface BusinessScoreFactors {
  event_type: CeoEventType
  has_decision: boolean
  has_commitment: boolean
  participant_count: number
  topic_novelty: number         // 0-1: 처음 등장하는 주제인가
  business_domain: "investment" | "hiring" | "product" | "operations" | "strategy" | "other"
}

export function scoreBusinessEvent(factors: BusinessScoreFactors): number {
  let score = 30  // 기본 점수

  // 이벤트 타입별 가중치
  const typeWeights: Record<string, number> = {
    "decision.made": 40,
    "commitment.created": 30,
    "meeting.recorded": 25,
    "commitment.missed": 35,     // 놓친 약속은 중요
    "insight.generated": 20,
    "conversation.logged": 10,
    "person.mentioned": 5,
    "topic.discussed": 10,
  }
  score += typeWeights[factors.event_type] ?? 0

  // 의사결정 포함 시 +15
  if (factors.has_decision) score += 15

  // 약속 포함 시 +10
  if (factors.has_commitment) score += 10

  // 참여자가 많을수록 +5씩 (최대 +15)
  score += Math.min(factors.participant_count * 5, 15)

  // 비즈니스 도메인 가중치
  const domainWeights: Record<string, number> = {
    investment: 15,
    hiring: 12,
    strategy: 10,
    product: 8,
    operations: 5,
    other: 0,
  }
  score += domainWeights[factors.business_domain] ?? 0

  return Math.min(score, 100)
}
```

### 5.3 새 도구 — 회의록 & 의사결정

**파일**: `src/tools/meeting-tools.ts` (NEW)

```typescript
// Tool: brain_log_meeting
// Zod Schema:
const BrainLogMeetingArgs = z.object({
  title: z.string().min(1),
  participants: z.array(z.string()).min(1),
  notes: z.string(),
  decisions: z.array(z.string()).optional(),
  action_items: z
    .array(
      z.object({ task: z.string(), assignee: z.string(), due_date: z.string().optional() })
    )
    .optional(),
})
// Return JSON:
// { success: true, vault_path: string, event_id: string, summary: string }
// Error codes:
// VAULT_NOT_FOUND | TEMPLATE_MISSING | LOCK_TIMEOUT | INVALID_INPUT
// Idempotency:
// same title+date+participants 이벤트가 있으면 update (중복 생성 금지)

// Tool: brain_log_decision
const BrainLogDecisionArgs = z.object({
  title: z.string().min(1),
  context: z.string().default(""),
  decision: z.string().min(1),
  reasoning: z.string().min(1),
  alternatives: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
})
// Return JSON:
// { success: true, decision_id: string, vault_path: string, event_id: string }
// Error codes:
// VAULT_NOT_FOUND | TEMPLATE_MISSING | LOCK_TIMEOUT | INVALID_INPUT
// Idempotency:
// same title+decision+date면 기존 레코드 갱신

// Tool: brain_decision_history
const BrainDecisionHistoryArgs = z.object({
  query: z.string().optional(),
  topic: z.string().optional(),
  person: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
})
// Return JSON:
// { results: Array<{ decision_id: string, title: string, decision: string, reasoning: string, confidence: string, citations: string[] }>, total: number }
// Error codes:
// VAULT_NOT_FOUND | INDEX_UNAVAILABLE | INVALID_INPUT
// Idempotency: read-only, deterministic sort

// Tool: brain_people_lookup
const BrainPeopleLookupArgs = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  company: z.string().optional(),
  relationship: z.enum(["team", "investor", "advisor", "partner", "customer", "other"]).optional(),
  limit: z.number().int().positive().max(100).default(20),
})
// Return JSON:
// { results: Array<{ name: string, role?: string, company?: string, relationship: string, last_seen: string, vault_path: string }>, total: number }
// Error codes:
// VAULT_NOT_FOUND | INDEX_UNAVAILABLE | INVALID_INPUT
// Idempotency: read-only

// Tool: brain_relationship_map
const BrainRelationshipMapArgs = z.object({
  person_name: z.string().min(1),
  depth: z.number().int().min(1).max(3).default(1),
})
// Return JSON:
// { person: string, nodes: Array<{ id: string, type: string, label: string }>, edges: Array<{ from: string, to: string, relation: string, weight: number }> }
// Error codes:
// PERSON_NOT_FOUND | INDEX_UNAVAILABLE | INVALID_INPUT
// Idempotency: read-only

// Tool: brain_track_commitment
const BrainTrackCommitmentArgs = z.object({
  description: z.string().min(1),
  assigned_to: z.string().min(1),
  due_date: z.string().optional(),
  source_event_id: z.string().optional(),
})
// Return JSON:
// { success: true, commitment_id: string, status: "pending", vault_path?: string }
// Error codes:
// VAULT_NOT_FOUND | LOCK_TIMEOUT | INVALID_INPUT
// Idempotency:
// same description+assigned_to+due_date면 기존 commitment 반환/갱신

// Tool: brain_check_commitments
const BrainCheckCommitmentsArgs = z.object({
  status: z.enum(["pending", "in_progress", "done", "overdue", "cancelled"]).optional(),
  person: z.string().optional(),
  overdue_only: z.boolean().default(false),
  limit: z.number().int().positive().max(200).default(50),
})
// Return JSON:
// { results: Array<{ id: string, description: string, assigned_to: string, due_date?: string, status: string }>, summary: { pending: number, overdue: number, done: number } }
// Error codes:
// INDEX_UNAVAILABLE | INVALID_INPUT
// Idempotency: read-only
```

### 5.4 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain/types.ts` | **수정** | CeoEventType, Provenance, 확장된 WorkingMemory/DailyMemory, PersonRecord, DecisionRecord, Commitment 추가 |
| `src/brain/config.ts` | **수정** | CEO 관련 설정 스키마 추가 (meeting_template, decision_template 등) |
| `src/brain/thalamus/scorer.ts` | **수정** | businessScoreEvent 함수 추가 (기존 함수 유지) |
| `src/brain/vault/templates.ts` | **수정** | 회의록, 의사결정 로그, 사람/CRM 마크다운 템플릿 추가 |
| `src/brain/vault/scaffold.ts` | **수정** | CEO 볼트 디렉토리 구조 생성 (`1-PROJECTS/`, `2-AREAS/` 등) |
| `src/brain/akashic/logger.ts` | **수정** | provenance 필드 지원 추가 |
| `src/brain/consolidation/daily-consolidator.ts` | **수정** | CEO 확장 필드 (meetings, interactions, commitments_status) 통합 |
| `src/tools/meeting-tools.ts` | **신규** | brain_log_meeting 도구 |
| `src/tools/decision-tools.ts` | **신규** | brain_log_decision, brain_decision_history 도구 |
| `src/tools/people-tools.ts` | **신규** | brain_people_lookup, brain_relationship_map 도구 |
| `src/tools/commitment-tools.ts` | **신규** | brain_track_commitment, brain_check_commitments 도구 |
| `src/tools/index.ts` | **수정** | 새 도구 등록 |
| `src/tools/types.ts` | **수정** | 새 deps 추가 |
| `src/tools/constants.ts` | **수정** | 새 도구 설명 추가 |
| `src/shared/provenance.ts` | **신규** | createProvenance() 유틸리티 |
| `src/index.ts` | **수정** | 새 모듈 와이어링 |

### 5.5 테스트 계획

| 테스트 파일 | 테스트 수 | 내용 |
|------------|----------|------|
| `src/brain/types.test.ts` | 10+ | Zod 스키마 검증, 하위 호환성 |
| `src/brain/thalamus/scorer.test.ts` | 15+ | 비즈니스 스코어링 정확도 |
| `src/tools/meeting-tools.test.ts` | 10+ | 회의록 생성, 이벤트 로깅, 엔티티 태깅 |
| `src/tools/decision-tools.test.ts` | 10+ | 의사결정 기록, 이력 조회 |
| `src/tools/people-tools.test.ts` | 8+ | 사람 조회, 관계도 |
| `src/tools/commitment-tools.test.ts` | 8+ | 약속 추적, 상태 관리 |
| `src/shared/provenance.test.ts` | 5+ | 출처 추적 유틸리티 |
| 기존 테스트 회귀 | 297 | 모든 기존 테스트 통과 확인 |

### 5.6 스토리지 & 마이그레이션 계약

- **현재 레이아웃**: `_brain/` 디렉토리(`working/`, `daily/`, `archival/`, `akashic/`) 사용 (`src/brain/vault/paths.ts` 기준)
- **목표 레이아웃**: `5-AI-MEMORY/` PARA 스타일 구조 (Section 11)
- **마이그레이션 전략**: Phase 1은 `_brain/`을 유지하고 CEO 아티팩트를 신규 경로에 병행 저장. 전체 PARA 이관은 Phase 2+로 연기
- **스키마 버전 관리**: `WorkingMemory`, `DailyMemory`, 모든 persisted artifact에 `schema_version: number` 필드 추가
- **백필 규칙**: 새 optional 필드는 기본값 채움 (`active_topics: []`, `people_involved: []`, `open_commitments: []` 등)
- **기존 JSONL 호환성**: forward-compatible read 유지 (`provenance` 누락 시 `null` 처리)
- **마이그레이션 명령**: `brain_migrate` 도구는 Phase 1 stretch goal로 검토

### 5.7 엣지 케이스 처리

- **Empty vault**: 모든 조회 도구는 에러 대신 `{ results: [], message: "아직 데이터가 없습니다. 첫 회의를 기록해보세요." }` 반환
- **2-week dormancy**: `last_session > 7 days`인 첫 상호작용에서는 morning brief 대신 catch-up brief(변경 파일 + pending commitments 요약) 실행
- **No meetings**: morning brief는 `"오늘 예정된 회의가 없습니다"`를 정상 반환
- **Re-entry flow**: `last_session > 7 days`이면 누락 기간에 대한 daily consolidation 자동 실행

---

## 6. Phase 2: 엔티티 & 의사결정 검색 + 출처 추적 (Month 2)

### 목표
"지난번 투자자 미팅에서 뭐라고 했더라?" 같은 질문에 **인용과 함께** 정확한 답을 제공한다.

### 성공 기준
- [ ] 엔티티(사람, 회사, 프로젝트) 기반 검색이 작동한다
- [ ] 모든 검색 결과에 출처(파일, 날짜, 원문 인용)가 포함된다
- [ ] "what did we decide about X?" 패턴 쿼리가 정확한 결과를 반환한다
- [ ] 기억 재통합: 검색 시 접근 빈도와 최신 맥락이 갱신된다

### 6.1 엔티티 인덱스

**파일**: `src/brain/search/entity-index.ts` (NEW)

```typescript
// SQLite 테이블:
// entities(id, type, name, aliases JSON, vault_path, first_seen, last_seen, interaction_count)
// entity_relations(entity_a_id, entity_b_id, relation_type, co_occurrence_count, last_updated)
// entity_events(entity_id, event_id, role TEXT)  // "participant", "subject", "mentioned"

export interface EntityIndex {
  // CRUD
  upsertEntity(entity: EntityRef): Promise<string>
  findEntity(query: string): Promise<EntityRef[]>

  // 관계 (co-occurrence + 시간 감쇠)
  recordCoOccurrence(entityIds: string[], eventId: string): Promise<void>
  getRelated(entityId: string, limit?: number): Promise<Array<{ entity: EntityRef; co_occurrence_count: number; decayed_weight: number }>>
}

// NOTE: STDP 기반 가중치 및 확산 활성화는 Phase 5+로 연기.
//       v1은 엔티티↔이벤트 매핑 + co-occurrence count + 시간 감쇠만 구현.
//       aliases와 stable IDs는 유지 (CEO 별칭/닉네임 사용성 보장).
```

### 6.2 검색 결과 + 인용 (Citation)

**파일**: `src/brain/search/hybrid-searcher.ts` (수정)

```typescript
// 기존 SearchResult에 provenance 추가
export interface CitedSearchResult {
  // 기존 필드
  path: string
  content: string
  combined_score: number
  // 신규 — 인용
  provenance: {
    source_file: string
    source_date: string
    original_quote: string      // 원문 일부 (max 200자)
    event_id?: string
  }
}
```

### 6.3 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain/search/entity-index.ts` | **신규** | 엔티티 인덱스 (SQLite) + co-occurrence + 시간 감쇠 |
| `src/brain/search/hybrid-searcher.ts` | **수정** | CitedSearchResult 반환, 출처 추적 통합 |
| `src/brain/search/db.ts` | **수정** | entities, entity_relations, entity_events 테이블 추가 |
| `src/tools/tools.ts` | **수정** | brain_search 결과에 인용 포함 |
| `src/tools/tools.ts` | **수정** | brain_recall에 접근 로그 기록 (재통합) |

### 6.4 테스트 계획

| 테스트 파일 | 테스트 수 | 내용 |
|------------|----------|------|
| `src/brain/search/entity-index.test.ts` | 20+ | 엔티티 CRUD, co-occurrence, 시간 감쇠 |
| `src/brain/search/hybrid-searcher.test.ts` | 10+ | 인용 포함 검색 결과 |

---

## 7. Phase 3: 프로액티브 AI 업그레이드 (Month 3)

### 목표
JARVIS가 CEO에게 **먼저 말한다** — 적절한 시점에, 적절한 내용을, 방해 없이.

⚠️ SDK 제약: 플러그인은 비동기 메시지 푸시 불가. 프로액티브 전달은 "인밴드 넛지" 모델로 구현 — 다음 사용자 상호작용 시 시스템 프롬프트에 삽입.

### 성공 기준

#### Phase 3a — deterministic rules
- [ ] 하루 첫 상호작용(session-start check)에서 morning brief 조건을 평가한다
- [ ] 일일 예산(2회/일), quiet hours, 최소 간격(min interval) 규칙이 강제된다
- [ ] 모든 프로액티브 메시지에 "왜 지금?" 설명이 포함된다

#### Phase 3b — receptivity learning
- [ ] "이 주제 전에 논의한 적 있어요" 맥락 알림이 작동한다
- [ ] 사용자 반응(참여/무시/거부) 학습이 작동한다

### 7.1 프로액티브 엔진 아키텍처

```
사용자 입력
    │
    ▼
┌─────────────────┐
│ Trigger Engine   │──── session-start check (하루 첫 상호작용)
│                 │──── 맥락 트리거 (엔티티/주제 감지)
│                 │──── 패턴 트리거 (놓친 약속, 반복 의사결정 번복)
└────────┬────────┘
         │ 후보 메시지
         ▼
┌─────────────────┐
│ Should-I-Speak   │
│ Scoring Engine   │
│                 │
│ score = urgency  │
│   × attention    │
│   × time_of_day  │
│   × recency      │
│   × receptivity  │
└────────┬────────┘
         │ score > threshold?
         ▼
┌─────────────────┐     ┌──────────────┐
│ Budget Check     │────▶│ Delivery     │
│ (N/day limit)   │     │ + "Why Now"  │
└─────────────────┘     └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ brain_proactive_check
                         │ (turn당 max 1회)
                         │ => { should_deliver,
                         │      message,
                         │      why_now,
                         │      budget_remaining }
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                        │ Receptivity   │
                        │ Learning     │
                        │ (반응 추적)   │
                        └──────────────┘
```

### 7.2 Should-I-Speak 스코어링

**파일**: `src/brain/proactive/scoring.ts` (NEW)

```typescript
export interface SpeakScore {
  urgency: number         // 0-1: 시간 압박 (약속 기한, 미팅 전)
  attention_state: number // 0-1: 세션 길이 + 메시지 빈도 + 마지막 메시지 시간 휴리스틱
  time_of_day: number     // 0-1: 시간대별 수용성 (아침 높음, 심야 낮음)
  recency: number         // 0-1: 마지막 프로액티브 메시지 이후 경과 시간
  receptivity: number     // 0-1: 사용자별 학습된 수용성
  total: number           // 가중 합
}

export interface SpeakConfig {
  threshold: number           // 기본 0.6
  daily_budget: number        // 기본 2
  min_interval_minutes: number // 기본 30 (최소 30분 간격)
  quiet_hours: { start: number; end: number } // 기본 22:00-08:00
}

export function shouldSpeak(factors: SpeakScore, config: SpeakConfig): {
  speak: boolean
  reason: string
  score: number
}

// NOTE: 완전한 attention model은 Phase 5+로 연기
```

### 7.3 루프 방지 규칙

- 프로액티브 이벤트(`insight.generated`)로 인한 재트리거 방지
- `provenance.created_by === 'system'`인 이벤트는 트리거 평가에서 제외

### 7.4 트리거 타입

```typescript
export type ProactiveTrigger =
  | { type: "time"; subtype: "morning_brief" }                          // 하루 첫 상호작용에서 체크
  | { type: "time"; subtype: "weekly_review" }                          // 매주 금요일
  | { type: "context"; subtype: "topic_seen_before"; topic: string }    // "이전에 논의한 적 있어요"
  | { type: "context"; subtype: "person_mentioned"; person: string }    // "이 분과 관련 정보가 있어요"
  | { type: "pattern"; subtype: "commitment_overdue"; commitment: string } // "약속 기한이 지났어요"
  | { type: "pattern"; subtype: "decision_reversal"; decision: string }    // "이전과 반대 의사결정"
  | { type: "pattern"; subtype: "repeated_topic"; topic: string; count: number } // "이 주제를 N번째 논의 중"
```

### 7.5 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain/proactive/trigger-engine.ts` | **신규** | 트리거 타입 관리, 트리거 평가 |
| `src/brain/proactive/scoring.ts` | **신규** | Should-I-Speak 스코어링 |
| `src/brain/proactive/delivery.ts` | **신규** | 메시지 전달 + "왜 지금" 생성 |
| `src/brain/proactive/receptivity.ts` | **신규** | 사용자 반응 추적 & 학습 |
| `src/brain/proactive/morning-brief.ts` | **신규** | 아침 브리핑 생성기 |
| `src/tools/proactive-tools.ts` | **신규** | morning_brief, configure_proactive, brain_proactive_check 도구 |
| `src/brain/heartbeat/heartbeat.ts` | **수정** | 프로액티브 엔진 통합 |
| `src/hooks/index.ts` | **수정** | 프로액티브 시스템 프롬프트 인젝션 확장 |

### 7.6 테스트 계획

| 테스트 파일 | 테스트 수 |
|------------|----------|
| `src/brain/proactive/trigger-engine.test.ts` | 15+ |
| `src/brain/proactive/scoring.test.ts` | 12+ |
| `src/brain/proactive/delivery.test.ts` | 8+ |
| `src/brain/proactive/receptivity.test.ts` | 10+ |
| `src/brain/proactive/morning-brief.test.ts` | 8+ |

---

## 8. Phase 4: 멀티에이전트 의사결정 지원 (Month 4)

### 목표
CEO가 중요한 의사결정을 할 때, 여러 에이전트가 **독립적으로** 분석하고 **강제로 반대 의견**을 제시하며, 최종 **액션 메모**를 생성한다.

### 성공 기준
- [ ] debate 도구 호출 시 3개 이상의 독립적 관점이 생성된다
- [ ] 아첨 방지: 최소 1개 반대 의견이 항상 포함된다
- [ ] 액션 메모에 모든 출처(인용)가 포함된다
- [ ] 합성 에이전트는 새로운 사실을 만들지 않는다 (인용만)
- [ ] Devil's Advocate가 최종 검증을 수행한다

### 8.1 멀티에이전트 플로우

```
CEO: "시리즈 A 라운드를 지금 시작해야 할까?"
                    │
                    ▼
┌──────────────────────────────────────┐
│         Orchestrator                  │
│  (독립 초안 요청 — 서로 참조 금지)    │
└───┬──────────┬──────────┬────────────┘
    │          │          │
    ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│Research│ │Advocate│ │ Critic │
│  (정보) │ │  (찬성) │ │  (반대) │
│        │ │        │ │        │
│ 시장데이│ │ "지금이│ │ "런웨이│
│ 터, 비교│ │  적기" │ │  부족" │
│ 사례    │ │  논거  │ │  논거  │
└───┬────┘ └───┬────┘ └───┬────┘
    │          │          │
    ▼          ▼          ▼
┌──────────────────────────────────────┐
│      Cross-Examination               │
│  (각 에이전트가 다른 에이전트 논거     │
│   에 대해 반박/보완 — 1라운드만)      │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│         Synthesizer                   │
│  (새 사실 생성 금지 — 인용만)         │
│  합의점, 불일치점, 핵심 불확실성 정리  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       Devil's Advocate               │
│  (합성 결과의 약점, 빠진 관점,        │
│   과도한 낙관/비관 체크)              │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          Action Memo                  │
│                                      │
│  결정: ___                           │
│  핵심 논거 (찬/반): ___              │
│  주요 위험: ___                      │
│  추천 행동: ___                      │
│  다음 체크포인트: ___                │
│  출처: [1] ... [2] ... [3] ...       │
└──────────────────────────────────────┘
```

### 8.2 아첨 방지 메커니즘 (Anti-Sycophancy)

**파일**: `src/brain/decision/anti-sycophancy.ts` (NEW)

```typescript
export interface AntiSycophancyConfig {
  // 1. 독립 초안 (약화 허용): 동일 completion 내 역할 분리로 최대한 독립성 확보
  independent_drafts: "best_effort"

  // 2. 강제 반대: Critic은 반드시 반대 논거를 제시해야 함
  forced_disagreement: true

  // 3. 스틸맨 요구: 각 에이전트는 반대 입장의 최강 버전을 먼저 제시
  steelman_requirement: true

  // 4. 소수 의견 증폭: 다수와 다른 의견은 추가 공간 확보
  minority_amplification: true

  // 5. 합성 제약: Synthesizer는 새 사실 생성 불가, 인용만
  synthesizer_citation_only: true
}

// 프롬프트 검증: 에이전트 출력에서 아첨 패턴 감지
export function detectSycophancy(outputs: AgentOutput[]): SycophancyReport {
  // "I agree with..." 패턴 감지
  // 모든 에이전트가 같은 결론 → 경고
  // 구체적 반대 논거 부재 → 경고
}
```

별도 LLM 인스턴스가 없는 환경에서는 "independent drafts"가 약화된다. 대신 구조화된 프롬프트(역할별 명시 지시 + 강제 반대 + 인용 제약)로 보완한다.

### 8.3 액션 메모 형식

**파일**: `src/brain/decision/action-memo.ts` (NEW)

```typescript
export interface ActionMemo {
  id: string
  created_at: string
  question: string                    // 원래 질문
  recommendation: string              // 최종 추천
  confidence: "high" | "medium" | "low"
  key_arguments: {
    for: Array<{ point: string; source: string }>
    against: Array<{ point: string; source: string }>
  }
  risks: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation?: string }>
  action_items: Array<{ action: string; deadline?: string; owner?: string }>
  next_checkpoint: { date: string; criteria: string }
  sources: Array<{ id: string; type: string; quote: string }>
  devils_advocate_notes: string       // 최종 검증 메모
  vault_path: string                  // 옵시디언 저장 경로
}
```

### 8.4 구현 참고: OpenCode 플러그인 제약

⚠️ 핵심 제약: 플러그인 도구는 LLM을 자체 호출할 수 없음. "순차 프롬프트 체인"을 도구 내부에서 직접 실행할 수 없다.

**구현 방법 A (권장): Evidence Pack + 단일 Completion 멀티 역할**
- `brain_debate` 도구가 관련 데이터(의사결정 이력, 엔티티 정보, 시장 데이터 등)를 검색해 evidence pack을 구성
- 도구는 evidence pack + 구조화된 프롬프트를 반환
- 호스트 LLM이 단일 completion에서 Researcher/Advocate/Critic/Synthesizer/DevilsAdvocate 섹션을 순차 생성
- 장점: 구현 단순, 테스트 가능 (evidence pack 조립은 결정적)
- 단점: 진정한 독립 초안 불가 (동일 모델 컨텍스트 공유)

**구현 방법 B: Step Protocol (더 강한 제어)**
- `brain_debate_start(question)` → `debate_id` + 첫 역할 지시 반환
- `brain_debate_step(debate_id, role_output)` → 다음 역할 지시 또는 최종 합성 반환
- 각 step에서 SQLite에 중간 상태 저장
- 장점: 워크플로우 제어 가능, 각 단계 테스트 가능
- 단점: 여러 tool call 필요, 호스트 LLM이 프로토콜 준수 필요

**방법 C (Phase 6+): 외부 LLM API 직접 호출**
- API 키 관리, 비용 제어, 보안 레이어 필요
- Phase 4에서는 사용하지 않음

**결정**: Phase 4에서는 방법 A로 시작. evidence pack 조립 로직은 결정적으로 테스트하고, 프롬프트 품질은 golden test로 검증한다.

### 8.5 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain/decision/orchestrator.ts` | **신규** | 멀티에이전트 오케스트레이션 |
| `src/brain/decision/agents/researcher.ts` | **신규** | 정보 수집 프롬프트 |
| `src/brain/decision/agents/advocate.ts` | **신규** | 찬성 논거 프롬프트 |
| `src/brain/decision/agents/critic.ts` | **신규** | 반대 논거 프롬프트 |
| `src/brain/decision/agents/synthesizer.ts` | **신규** | 종합 프롬프트 (인용만) |
| `src/brain/decision/agents/devils-advocate.ts` | **신규** | 최종 검증 프롬프트 |
| `src/brain/decision/anti-sycophancy.ts` | **신규** | 아첨 방지 |
| `src/brain/decision/action-memo.ts` | **신규** | 액션 메모 생성 |
| `src/tools/debate-tools.ts` | **신규** | brain_debate, brain_review_decision 도구 |

### 8.6 테스트 계획

| 테스트 파일 | 테스트 수 |
|------------|----------|
| `src/brain/decision/orchestrator.test.ts` | 15+ |
| `src/brain/decision/anti-sycophancy.test.ts` | 10+ |
| `src/brain/decision/action-memo.test.ts` | 8+ |
| `src/tools/debate-tools.test.ts` | 10+ |

---

## 9. Phase 5: 감사 가능한 롤업 & 패턴 트리거 (Month 5)

### 목표
장기 기억이 감사 가능하게 관리되고, 고정밀 패턴 트리거(놓친 약속, 반복 번복)가 작동한다.

### 성공 기준
- [ ] 주간/월간 롤업에 출처 추적이 포함된다
- [ ] 롤업 과정에서 정보 손실 감사가 가능하다
- [ ] 놓친 약속 트리거가 labeled fixture set 기준 precision ≥ 95%, recall ≥ 80%를 만족한다
- [ ] 의사결정 번복 트리거가 고정밀로 작동한다 (거짓 양성 < 5%)

### 9.1 감사 가능한 롤업

```typescript
// 기존 consolidation 확장
export interface AuditableRollup {
  period: string
  summary: string
  // 감사 필드
  source_event_ids: string[]      // 원본 이벤트 ID 목록
  source_daily_paths: string[]    // 원본 일일 요약 경로
  information_loss_notes: string  // "다음 정보는 요약 과정에서 생략됨: ..."
  confidence: number              // 요약 신뢰도
  reviewed_by?: "user" | "ai"    // 사용자 검토 여부
}
```

### 9.2 패턴 트리거

| 트리거 | 감지 방법 | 정밀도 요구사항 |
|--------|-----------|----------------|
| 놓친 약속 | Commitment.due_date < now && status !== "done" | 95%+ (거짓 양성 거의 없어야 함) |
| 의사결정 번복 | 같은 topic에 대한 반대 decision 감지 | 높은 정밀도만 (낮으면 차라리 안 알림) |
| 반복 주제 | topic 등장 횟수 > threshold | 중간 (참고 정보) |

### 9.3 평가 하네스

- "놓친 약속" 평가: 20+ labeled fixtures (`commitment + due_date + current_date -> expected status`)
- "의사결정 번복" 평가: 10+ labeled fixtures (`decision pairs -> expected detection`)
- CI에서 자동 실행, precision/recall 메트릭 출력
- "95% 정확도" 기준 명확화: labeled fixture set 기준 `precision >= 95%`, `recall >= 80%`

### 9.4 파일 변경 목록

| 파일 | 변경 유형 |
|------|-----------|
| `src/brain/consolidation/archival-rollup.ts` | **수정** — 감사 필드 추가 |
| `src/brain/consolidation/sleep-consolidator.ts` | **수정** — 감사 가능한 롤업 |
| `src/brain/proactive/trigger-engine.ts` | **수정** — 패턴 트리거 추가 |

---

## 10. Phase 6: 에이전트 빌더 & 확장 시스템 (Month 6)

### 목표
CEO가 "투자자 미팅 준비 에이전트 만들어줘" 같은 요청으로 새 에이전트를 동적으로 만들 수 있다.

⚠️ 연기 강력 권장 — Phase 1-5 안정화 이후 진행. 에이전트 빌더, 권한 관리, 감사 로그는 각각 독립 제품 수준의 복잡도.

### 성공 기준
- [ ] 템플릿 기반 에이전트 생성이 작동한다
- [ ] 생성된 에이전트가 기존 도구/기억 시스템에 접근할 수 있다
- [ ] 권한 제어: 에이전트가 할 수 있는 것/없는 것 명확
- [ ] 감사 로그: 에이전트가 한 모든 행동이 기록된다

### 10.1 에이전트 정의 (OpenClaw 스킬 패턴 참조)

```typescript
// OpenClaw의 SKILL.md 패턴을 차용
export interface AgentDefinition {
  id: string
  name: string
  description: string                    // 트리거 조건 포함
  system_prompt: string                  // 에이전트 역할 정의
  allowed_tools: string[]                // 사용 가능한 도구 목록
  temperature: number                    // LLM 온도 (기본 0.3)
  max_turns: number                      // 최대 대화 턴
  created_at: string
  created_by: "user" | "system"
  vault_path: string                     // 옵시디언에 저장
}

// 에이전트 템플릿 (프리셋)
export const AGENT_TEMPLATES = {
  "investor-prep": { /* 투자자 미팅 준비 */ },
  "hiring-review": { /* 채용 검토 */ },
  "competitor-analysis": { /* 경쟁사 분석 */ },
  "weekly-reflection": { /* 주간 회고 */ },
} as const
```

### 10.2 파일 변경 목록

| 파일 | 변경 유형 |
|------|-----------|
| `src/brain/decision/agent-builder.ts` | **신규** — 에이전트 정의 CRUD |
| `src/tools/agent-builder-tools.ts` | **신규** — brain_create_agent, brain_list_agents |

---

## 11. 옵시디언 볼트 구조 & 템플릿

### 디렉토리 구조

```
Vault/
├── 0-INBOX/                    # 미분류 입력
├── 1-PROJECTS/                 # 활성 프로젝트
│   ├── series-a-funding/
│   └── product-launch-q2/
├── 2-AREAS/                    # 지속적 관심 영역
│   ├── finance/
│   ├── hiring/
│   ├── product/
│   └── operations/
├── 3-RESOURCES/                # 참고 자료
│   ├── market-research/
│   └── frameworks/
├── 4-ARCHIVE/                  # 완료/비활성
├── 5-AI-MEMORY/                # JARVIS 전용
│   ├── soul.md                 # 아이덴티티, 원칙, 어휘
│   ├── working/                # 세션별 작업 기억
│   ├── daily/                  # 일일 요약
│   ├── weekly/                 # 주간 롤업
│   ├── monthly/                # 월간 롤업
│   ├── akashic/                # JSONL 이벤트 로그
│   ├── decisions/              # 의사결정 로그
│   ├── people/                 # 사람/CRM
│   ├── commitments/            # 약속 추적
│   ├── agents/                 # 생성된 에이전트 정의
│   ├── debates/                # 토론 액션 메모
│   └── _AI-Context.md          # AI 작업 기억 파일
├── 6-DAILY/                    # 데일리 노트
│   └── 2026-02-20.md
├── 7-MAPS/                     # MOC (Map of Content)
│   ├── _Investment-MOC.md
│   ├── _Product-MOC.md
│   └── _People-MOC.md
└── Templates/                  # 마크다운 템플릿
    ├── Meeting-Note.md
    ├── Decision-Log.md
    ├── Person-CRM.md
    ├── Project.md
    ├── Daily-Note.md
    ├── Weekly-Review.md
    └── Action-Memo.md
```

### 회의록 템플릿 (Meeting-Note.md)

```markdown
---
type: meeting
date: {{date}}
participants: []
tags: []
status: draft
ai_summary: ""
related: []
decisions: []
action_items: []
---

# {{title}}

## 참석자
-

## 안건
1.

## 논의 내용

## 의사결정
- [ ] 결정사항:
  - 근거:
  - 담당:

## 액션 아이템
- [ ] 할 일 | 담당: | 기한:

## AI 메모
> AI가 자동으로 채우는 영역
```

### 의사결정 로그 템플릿 (Decision-Log.md)

```markdown
---
type: decision
date: {{date}}
status: decided
confidence: medium
participants: []
tags: []
related_decisions: []
---

# {{title}}

## 맥락
왜 이 결정이 필요했는가?

## 결정
무엇을 결정했는가?

## 근거
왜 이렇게 결정했는가?

## 고려한 대안
1. 대안 A: ...
2. 대안 B: ...

## 위험 & 완화
- 위험:
- 완화:

## 다음 체크포인트
- 날짜:
- 기준:

## 결과 추적
| 날짜 | 결과 | 평가 |
|------|------|------|
```

### 사람/CRM 템플릿 (Person-CRM.md)

```markdown
---
type: person
name: ""
role: ""
company: ""
relationship: other
first_contact: {{date}}
tags: []
---

# {{name}}

## 기본 정보
- 역할:
- 회사:
- 관계:

## 상호작용 이력
| 날짜 | 유형 | 요약 |
|------|------|------|

## 핵심 주제
-

## 메모
```

### 11.5 Phase 간 의존성 그래프

```
Phase 0 (SDK Spike)
  ↓ (블로킹 — P3/P4 설계의 전제조건)
Phase 1 (이벤트 스키마)
  ↓ (데이터 기반)
Phase 2 (엔티티 & 검색) ← Phase 1 이벤트 스키마 필요
  ↓
Phase 3 (프로액티브) ← Phase 2 엔티티 인덱스 필요 (topic_seen_before, person_mentioned 트리거)
  ↓
Phase 4 (멀티에이전트) ← Phase 2 검색/인용 필요 (evidence pack 조립)
  ↓
Phase 5 (롤업 & 패턴) ← Phase 1 commitments + Phase 3 트리거 인프라
  ↓
Phase 6 (에이전트 빌더) ← 전체. 연기 강력 권장.
```

---

## 12. 의존성 & 기술 스택

### 현재 의존성 (유지)
- `chokidar` ^5.0.0 — 파일 감시
- `ulid` ^3.0.2 — 시간 정렬 가능 ID
- `zod` ^4.1.8 — 스키마 검증
- `@opencode-ai/plugin` >=1.0.0 (peer)

### 추가 의존성 (최소화 원칙)
- **없음** — 현재 의존성으로 모든 기능 구현 가능
  - SQLite: Bun 내장 (`bun:sqlite`)
  - JSON 파싱: 내장
  - 마크다운 처리: 자체 chunker 이미 존재
  - HTTP: 필요 시 `fetch` (Bun 내장)

### 개발 의존성 (유지)
- `bun-types` latest
- `typescript` ^5.7.3

---

## 13. 테스트 전략

### TDD 워크플로우 (모든 Phase 적용)

1. **SPEC**: 성공 기준 정의 (각 Phase에 명시됨)
2. **RED**: 실패하는 테스트 작성
3. **GREEN**: 최소 코드로 테스트 통과
4. **REFACTOR**: 정리 → 테스트 통과 유지
5. **REGRESSION**: 기존 297개 테스트 전부 통과 확인

### 테스트 수량 목표

| Phase | 신규 테스트 | 누적 |
|-------|-----------|------|
| 기존 | — | 297 |
| Phase 1 | 66+ | 363+ |
| Phase 2 | 30+ | 393+ |
| Phase 3 | 53+ | 446+ |
| Phase 4 | 43+ | 489+ |
| Phase 5 | 15+ | 504+ |
| Phase 6 | 12+ | 516+ |
| **최종** | **219+** | **516+** |

### 테스트 명명 규칙

```typescript
describe("createBusinessScorer", () => {
  it("should return 85+ for investment decision with 3 participants", () => { ... })
  it("should return 30 for casual conversation log", () => { ... })
  it("should preserve backward compatibility with file events", () => { ... })
})
```

### CI 체크 (매 Phase 완료 시)

```bash
~/.bun/bin/bun test           # 모든 테스트 통과
~/.bun/bin/bun run typecheck  # 타입 에러 없음
~/.bun/bin/bun run build      # 빌드 성공
```

---

## 14. 위험 요소 & 완화 방안

| # | 위험 | 심각도 | 확률 | 완화 |
|---|------|--------|------|------|
| 1 | **자신감 있지만 틀린 AI 합성** | 높음 | 높음 | 모든 출력에 provenance/citation 필수, 신뢰도 점수 표시 |
| 2 | **기억 오염** — 잘못된 정보가 장기 기억에 고착 | 높음 | 중간 | 감사 가능한 롤업, 원본 이벤트 ID 보존, 수동 교정 도구 |
| 3 | **프로액티브 피로** — CEO가 알림에 지침 | 중간 | 높음 | 인터럽션 예산 (2/일), 수용성 학습, quiet hours |
| 4 | **멀티에이전트 아첨** — 모든 에이전트가 동의 | 중간 | 높음 | 독립 초안, 강제 반대, 스틸맨, 소수 의견 증폭 |
| 5 | **기존 테스트 파손** | 높음 | 낮음 | 타입 확장(추가만), 기존 함수 시그니처 유지, 매 수정 후 전체 테스트 |
| 6 | **옵시디언 볼트 데이터 유실** | 높음 | 낮음 | write lock (이미 구현), 원자적 파일 쓰기, 백업 경로 |
| 7 | **LLM API 비용 폭증** (멀티에이전트) | 중간 | 중간 | Phase 4에서 프롬프트 체인 방식 우선, API 직접 호출은 Phase 6 |
| 8 | **플러그인 SDK 제약** | 중간 | 낮음 | 31 hooks + 7 events로 대부분 커버 가능. 부족 시 fork 고려 |

---

## 15. 부록: OpenClaw에서 가져온 패턴

### 적용할 패턴

| OpenClaw 패턴 | JARVIS 적용 | Phase |
|--------------|------------|-------|
| **SKILL.md (Progressive Disclosure)** | 에이전트 정의: frontmatter(항상 로드) → 본문(트리거 시) → 리소스(필요 시) | P6 |
| **Memory 특별 슬롯** (`kind: "memory"`) | brain 플러그인이 메모리 슬롯을 차지하는 모델 확인 | 전체 |
| **`skill-creator` 스킬** | Agent Builder: 에이전트를 만드는 도구 | P6 |
| **`llm-task` 익스텐션** | 워크플로우 내 LLM 호출 — 멀티에이전트 빌딩블록 | P4 |
| **서브에이전트 깊이 제한** | 멀티에이전트 토론 최대 깊이 3 | P4 |
| **도구 정책 파이프라인** | 에이전트별 도구 접근 권한 관리 | P6 |
| **`.pi/` 인텔리전스 레이어** | CEO 전용 프롬프트/확장 디렉토리 구조 | P3+ |
| **`openclaw.plugin.json` 매니페스트** | 플러그인 메타데이터 구조 참조 | 전체 |

### 적용하지 않을 패턴

| OpenClaw 패턴 | 이유 |
|--------------|------|
| 37개 채널 익스텐션 | Phase 1-6 범위 밖. 미래 목표로 유지 |
| pnpm 기반 빌드 | Bun 전용 (oh-my-opencode 규칙) |
| Docker 샌드박스 | 독립 플러그인에는 불필요 |
| 모바일 앱 | Phase 1-6 범위 밖 |

---

## 실행 순서 요약

```
Phase 1 (Month 1): CEO 이벤트 스키마 + 회의/의사결정/약속 캡처 + 출처 추적
    ↓ CEO가 기록 시작 가능
Phase 2 (Month 2): 엔티티 인덱싱 + 인용 포함 검색 + 기억 재통합
    ↓ "뭐라고 했더라?" 질문에 답변 가능
Phase 3 (Month 3): 프로액티브 엔진 (아침 브리핑 + 인터럽션 예산 + 수용성 학습)
    ↓ JARVIS가 먼저 말하기 시작
Phase 4 (Month 4): 멀티에이전트 의사결정 (독립 초안 + 강제 반대 + 액션 메모)
    ↓ 중요 의사결정에 구조화된 지원
Phase 5 (Month 5): 감사 가능한 롤업 + 고정밀 패턴 트리거
    ↓ 장기 기억 신뢰성 + 약속 미이행 감지
Phase 6 (Month 6): 에이전트 빌더 + 권한 + 감사
    ↓ CEO가 새 에이전트를 직접 생성
```

---

> **다음 단계**: Phase 0 SDK 스파이크 실행 → Phase 1 구현 시작
