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

`.env.local`의 `DEMO_MODE=true`에서는 외부 검색, AI, database 연결 없이 두 신문면의 전체 reader flow를 fixture로 실행합니다.

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
- `db/migrations/` — provider-neutral PostgreSQL schema
- `docs/ADDING_A_PRESET.md` — 다음 면을 추가하는 실제 절차

## 환경변수

- `DEMO_MODE=true`: fixture discovery와 deterministic editorial output
- `DISCOVERY_PROVIDER=fixture|live`: `live`는 Preset route channel에 따라 provider를 명시적으로 선택합니다. 기존 `naver` 값도 live 설정으로 호환됩니다.
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`: Wonju의 `news-search` live discovery
- `EXA_API_KEY`: Girls Band Cry의 일반 `web-search` live discovery
- `AI_PROVIDER=openrouter|gemini`: editorial provider 선택. 생략하면 기존과 같이 OpenRouter
- `AI_MODEL`: 선택한 provider의 모델 ID
- `OPENROUTER_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`: 선택한 provider의 인증 키
- `DATABASE_URL`: 모든 publish/read/reflection/settings/push persistence의 PostgreSQL 연결
- `APP_PASSWORD`, `AUTH_SECRET`, `CRON_SECRET`: 개인 접근과 scheduler 인증
- VAPID 변수: 선택적인 Push

Girls Band Cry는 Exa Search API의 일반 검색 결과와 Preset에 선언된 `https://girls-band-cry.com/news/`를 직접 관찰합니다. Exa의 합성 summary는 evidence로 사용하지 않으며, title·URL·발행시각·원문 highlight/text가 있는 결과만 canonical evidence로 채택합니다. Wonju는 기존 Naver `news-search`를 유지합니다. Gemini credential은 `AI_PROVIDER=gemini`인 경우 발행 전 editorial 단계에서만 사용됩니다.

## 검증

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

fixture certification은 noise 제거, canonical provenance, 중복 사건 grouping, grounded fallback, 동일 날짜 다중 paper 격리, local read/reflection 격리를 포함합니다.

## PostgreSQL / scheduler

PostgreSQL 13 이상의 빈 database에 `db/migrations/202608020001_initial_schema.sql`을 적용하고 `DATABASE_URL`만 설정합니다. Neon을 포함한 일반 PostgreSQL connection string을 사용하며 provider SDK, Data API, privileged service role을 요구하지 않습니다. 자세한 절차는 `db/README.md`에 있습니다.

Scheduler는 database 밖의 책임입니다. 외부 scheduler가 `Authorization: Bearer <CRON_SECRET>`으로 `/api/jobs/generate-daily`와 `/api/jobs/send-due`를 호출합니다. 이 작업에서는 Production scheduler나 database를 구성하지 않습니다.
