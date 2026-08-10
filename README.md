# Preset-driven Custom Newspaper

관심 있는 하나의 세계마다 작은 전문 편집국을 두는, 사전 생성형 개인 신문 기반입니다. 사용자가 프롬프트를 입력하는 제품이 아닙니다. 개발자가 `Preset`으로 identity, discovery, relevance, editorial policy, explanation context를 정의하면 같은 pipeline과 reader가 새 신문면을 발행합니다.

현재 대표 면:

- 걸즈 밴드 크라이 — 음악, 라이브, 공식 발표, 인터뷰, 제작진·활동
- 원주 — 시정·정책, 교통·안전, 교육·의료, 지역경제, 생활·환경

## 로컬 실행

Node.js 20 이상과 pnpm이 필요합니다.

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

`.env.local`의 `DEMO_MODE=true`에서는 외부 검색, AI, Supabase secret 없이 두 신문면의 전체 reader flow를 fixture로 실행합니다.

## 핵심 경계

Generation time:

```text
Preset → DiscoveryProvider → canonical EvidenceDocument
→ relevance → deduplicate/cluster/rank → grounded editorial
→ validate → publish
```

Reading time:

```text
(preset_id, source_date) published data read → render
```

읽기와 면 전환 시 discovery나 AI를 호출하지 않습니다. 현재 면 read path는 digest header, items, 선택된 source의 세 bounded query이며 preset registry 조회는 정적 메모리 lookup입니다.

주요 위치:

- `lib/presets/` — Preset contract와 registry
- `lib/editorial/` — provider-independent evidence, relevance, clustering
- `lib/pipeline/run-daily-digest.ts` — 한 면/전체 면 생성 canonical path
- `lib/digest/summarize-story.ts` — grounded AI와 deterministic fallback
- `lib/digest/read-digest.ts` — 발행 데이터 전용 read path
- `supabase/migrations/` — `(preset_id, source_date)` 격리 schema와 scheduler
- `docs/ADDING_A_PRESET.md` — 다음 면을 추가하는 실제 절차

## 환경변수

- `DEMO_MODE=true`: fixture discovery와 deterministic editorial output
- `DISCOVERY_PROVIDER=fixture|live`: `live`는 Preset route channel에 따라 provider를 명시적으로 선택합니다. 기존 `naver` 값도 live 설정으로 호환됩니다.
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`: Wonju의 `news-search` live discovery
- `DISCOVERY_MODEL`: Girls Band Cry의 `web-search`에 사용하는 Gemini 모델. editorial `AI_MODEL`과 독립적입니다.
- `AI_PROVIDER=openrouter|gemini`: editorial provider 선택. 생략하면 기존과 같이 OpenRouter
- `AI_MODEL`: 선택한 provider의 모델 ID
- `OPENROUTER_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`: 선택한 provider의 인증 키
- `DATABASE_URL`: pipeline publish/read용 direct Postgres 연결
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: read/reflection/settings 서버 API
- `APP_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`: 개인 접근과 scheduler 인증
- VAPID 변수: 선택적인 Push

Girls Band Cry의 다국어 `web-search`는 기존 Google Gemini credential을 사용합니다. Google Search grounding URL을 실제로 읽어 제목, 본문 설명, 발행시각을 확인할 수 있는 문서만 canonical evidence로 채택하며 모델 prose 자체는 저장하지 않습니다. Wonju는 기존 Naver `news-search`를 유지합니다.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

fixture certification은 noise 제거, canonical provenance, 중복 사건 grouping, grounded fallback, 동일 날짜 다중 paper 격리, local read/reflection 격리를 포함합니다.

## Supabase / scheduler

새 TARGET Supabase project에 migration을 순서대로 적용합니다. public table은 RLS가 켜져 있고 anon/authenticated policy가 없으며 server-only `service_role` 권한만 명시적으로 부여합니다. 2026년 Supabase의 “새 table 자동 Data API 노출 중단” 변경을 전제로 합니다.

Production cron은 migration을 검토하고 Vault에 `app_url`, `cron_secret`을 설정한 뒤 사용자가 승인한 환경에서만 활성화합니다. 이 저장소는 secret이나 production state를 포함하지 않습니다.
