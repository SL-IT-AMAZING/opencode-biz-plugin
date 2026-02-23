# opencode-plugin-brain 설치 가이드

이 문서는 `oh-my-opencode`의 설치 UX를 참고해서, 사람/에이전트 모두 동일하게 따라갈 수 있도록 작성된 설치 가이드입니다.

## For Humans

아래 프롬프트를 Claude/OpenCode/Cursor 같은 에이전트에 그대로 붙여 넣으세요:

```text
다음 설치 가이드를 읽고 내 환경에 맞게 opencode-plugin-brain 설치/설정까지 끝내줘.
https://raw.githubusercontent.com/SL-IT-AMAZING/opencode-biz-plugin/refs/heads/main/docs/guide/installation.md
```

## For LLM Agents

설치 가이드 본문을 먼저 가져온 뒤 그대로 실행하세요:

```bash
curl -s https://raw.githubusercontent.com/SL-IT-AMAZING/opencode-biz-plugin/refs/heads/main/docs/guide/installation.md
```

## 수동 설치

### 1) 사전 준비

- Bun 설치
- OpenCode 설치
- (권장) Obsidian 설치

### 2) 플러그인 설치

프로젝트 루트에서:

```bash
bun add opencode-plugin-brain
```

### 3) OpenCode 설정

`opencode.json` 또는 `~/.config/opencode/opencode.json`에는 플러그인 이름만 등록합니다.

```json
{
  "plugin": ["opencode-plugin-brain"]
}
```

브레인 플러그인 전용 설정은 별도 파일에 둡니다.

- 프로젝트 설정: `.opencode/opencode-plugin-brain.json`
- 글로벌 설정: `~/.config/opencode/opencode-plugin-brain.json`

예시 (`.opencode/opencode-plugin-brain.json`):

```json
{
  "enabled": true,
  "ceo": { "enabled": true },
  "proactive": { "enabled": true, "threshold": 0.6 }
}
```

### 3-1) `oh-my-opencode`와 공존 설정

두 플러그인을 함께 쓸 때는 `plugin` 배열에 둘 다 넣으면 됩니다.

```json
{
  "plugin": ["oh-my-opencode", "opencode-plugin-brain"]
}
```

권장 사항:
- 초기엔 `proactive.enabled`를 `false`로 시작하고, 안정화 후 `true`로 전환
- 두 플러그인 모두 훅을 순차 실행하므로(override 아님), 설정만 정확하면 공존 가능

Obsidian 볼트를 자동 감지하지 못하면 경로를 명시하세요:

```json
{
  "enabled": true,
  "vault_path": "/absolute/path/to/your/vault"
}
```

### 4) 실행 및 검증

```bash
opencode
```

실행 후 `_brain/` 디렉토리가 생성되고, 다음 요청이 동작하면 설치 성공입니다:

- "어제 뭐 했는지 요약해줘"
- "밀린 약속 있는지 확인해줘"
- "이번 주 요약 정리해줘"

## 문제 해결

- vault 자동 감지가 실패하면 `vault_path`를 명시
- 프로액티브 알림이 너무 많으면 `proactive.threshold`를 높이거나 `brain_proactive_feedback` 사용
- 설치 직후에는 히스토리가 적어서 검색/요약 품질이 낮을 수 있음 (1~2일 사용 후 안정화)
