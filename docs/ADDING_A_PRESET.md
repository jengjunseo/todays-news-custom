# 새 신문면 추가

예: `G-DRAGON` 면 추가

1. `lib/presets/`에서 기존 Preset 파일 하나를 참고해 새 Preset을 정의합니다.
2. `lib/presets/index.ts`의 `NEWSPAPER_PRESETS`에 한 줄 등록합니다.
3. `pnpm test -- tests/editorial`로 registry/pipeline 계약을 확인합니다.

보통 수정 범위는 **Preset 파일 + registry 한 줄**입니다. Fixture 이벤트 표를 수정하지 않습니다. 테스트용 근거는 Preset의 identity, section, route, editorial policy에서 자동 합성됩니다.

다음 core는 수정하지 않습니다.

- reader/card/accordion
- publisher/read path/database access
- relevance/cluster/editorial/fallback
- archive/insights/reflection/read-state UI

## Preset 작성 체크

- `id`: URL과 DB에 오래 쓰는 kebab-case stable ID
- `aliases`: 한국어/영어/현지어 이름과 실제 검색에 필요한 별칭
- `sections`: 전문 편집국이 다양하게 보여줄 사건 종류
- `discovery`: provider 문법이 아닌 channel, intent, query, locale, 제외 의미
- `editorial`: 중요한 변화, noise, 적정 item 수, filler 허용 여부
- `explanation`: 독자 배경, 유용한 “왜 중요할까”, 추론 금지선

## Discovery channel

- `news-search`: 한국 뉴스 검색. 현재 `NaverDiscoveryProvider`가 담당합니다.
- `web-search`: 다국어 공개 웹 검색. 현재 Exa Search API의 일반 검색 adapter가 담당합니다.
- `official-feed`: Preset의 `sourceUrls`에 선언한 공식 목록 URL을 직접 관찰합니다. 검색 URL이나 provider 문법을 넣지 않습니다.

공식 발표 페이지가 있다면 route에 다음처럼 URL을 데이터로 선언합니다.

```ts
{
  id: "topic-official-direct",
  channel: "official-feed",
  sectionId: "official",
  intent: "공식 사이트에 직접 게시된 주요 발표",
  queries: ["Topic official news"],
  locales: ["ja-JP"],
  excludeTerms: ["루머"],
  sourceUrls: ["https://example.com/news/"],
}
```

`sourceUrls`는 해당 Preset의 `officialDomains` 안에 있어야 하며, adapter는 날짜가 맞는 실제 detail page만 canonical evidence로 반환합니다. `web-search` route는 `EXA_API_KEY`, `news-search` route는 Naver credential이 필요합니다. Discovery에는 LLM을 사용하지 않습니다.

새로운 source가 정말 필요할 때만 `lib/editorial/providers/`에 `DiscoveryProvider`를 추가하고 canonical `RawEvidenceCandidate`까지만 반환합니다. provider-specific 응답을 normalize/relevance/cluster/editorial/publisher로 새게 하지 않습니다.

의미 있는 사건이 적으면 덜 발행합니다. coverage를 늘리기 위해 relevance나 grounding 기준을 낮추거나 filler를 만들지 않습니다.

`tests/editorial/data-only-preset.test.ts`의 테스트 전용 구마모토 Preset은 새 주제가 core 변경 없이 같은 registry pipeline과 `(preset_id, source_date)` 발행 identity를 쓰는지 증명합니다.
