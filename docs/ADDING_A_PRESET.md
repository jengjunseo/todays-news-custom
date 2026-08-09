# 새 신문면 추가

예: “G-DRAGON 면 추가”

1. `lib/presets/`에 기존 `girls-band-cry.ts`나 `wonju.ts`를 복사해 새 Preset을 정의합니다.
2. `lib/presets/index.ts`의 `NEWSPAPER_PRESETS`에 한 줄 등록합니다.
3. identity aliases, section, discovery route, noise/important signals, explanation guardrail을 실제 주제에 맞게 작성합니다.
4. `FixtureDiscoveryProvider`의 `EVENTS`에 section별 최소 1개 사건과 서로 다른 source 2개를 추가합니다.
5. `tests/editorial/presets.test.ts`와 demo/pipeline certification을 실행합니다. registry 기반 테스트는 새 Preset에도 자동 적용됩니다.

보통 수정 범위는 Preset 파일 + registry 한 줄 + fixture입니다. 다음은 수정하지 않습니다.

- reader/card/accordion
- publisher/read path/database access
- relevance/cluster/editorial core
- archive/reflection/read-state UI

## Preset 작성 체크

- `id`: URL과 DB에 오래 남을 kebab-case stable ID
- `aliases`: 한국어/영어/원어 이름과 실제 검색에 필요한 다른 이름
- `sections`: 이 전문 편집국이 다양하게 보여줄 사건 종류
- `discovery`: provider 문법이 아니라 channel, intent, query 표현, locale, 제외 의미
- `editorial`: 중요한 변화, noise, 적정 item 수, filler 허용 여부
- `explanation`: 독자에게 보충할 배경, 유용한 “왜”, 근거 없이 추론하면 안 될 내용

새 source가 필요하면 `DiscoveryProvider`를 `lib/editorial/providers/`에 구현하고 canonical `RawEvidenceCandidate`까지만 반환합니다. provider-specific 응답 type은 그 파일 밖으로 내보내지 않습니다. 이후 normalize/relevance/cluster/editorial/publish는 재사용합니다.

의미 있는 사건이 적은 날에는 `allowFiller: false`를 유지하고 덜 발행합니다. fixture를 통과시키려고 noise threshold나 grounding validation을 낮추지 않습니다.
