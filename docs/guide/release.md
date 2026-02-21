# Release Guide

이 프로젝트는 로컬 publish 대신 GitHub Actions 수동 워크플로우(`workflow_dispatch`)를 사용합니다.

## 원칙

- 로컬에서 `package.json` 버전을 수동으로 올리지 않습니다.
- 로컬에서 `bun publish`/`npm publish`를 실행하지 않습니다.
- 릴리즈는 `.github/workflows/publish.yml`을 통해서만 진행합니다.

## 사전 조건

- `main` 브랜치 기준 최신 코드 push 완료
- CI 통과 가능 상태 (typecheck/test/build)
- GitHub 저장소에 npm publish 권한과 OIDC 설정이 준비되어 있어야 함

## 릴리즈 실행

```bash
# patch/minor/major 중 하나 선택
gh workflow run publish.yml -R SL-IT-AMAZING/opencode-biz-plugin -f bump=patch

# 버전을 직접 지정할 수도 있음
gh workflow run publish.yml -R SL-IT-AMAZING/opencode-biz-plugin -f version=0.2.0-beta.1
```

## publish.yml 동작

1. typecheck/test/build 검증
2. npm 기준 최신 버전 조회 후 다음 버전 계산(또는 override 버전 사용)
3. 이미 publish된 버전인지 확인 (중복이면 skip)
4. `package.json` 버전 업데이트 후 빌드
5. `npm publish --provenance`
6. `release: vX.Y.Z` 커밋 + `vX.Y.Z` 태그 push
7. GitHub Release 생성
