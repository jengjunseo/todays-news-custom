# Preset Custom Newspaper 작업 규칙

- 새 신문면은 먼저 `docs/ADDING_A_PRESET.md`와 `lib/presets/schema.ts`를 읽는다.
- 새 면 때문에 reader, publisher, DB read path, card를 수정하지 않는다. 필요한 변경은 Preset + registry + fixture가 기본이다.
- reading request에서 search, provider, AI, clustering을 호출하지 않는다.
- paper identity는 항상 `(preset_id, source_date)`이며 local state도 preset/date를 포함한다.
- provider 응답은 canonical evidence로 정규화된 뒤에만 editorial core로 전달한다.
- 입력에 없는 URL/source ID/cluster ID를 AI가 만들지 못하게 서버에서 검증한다.
- 동일 사건은 한 면에 한 번만 표시하고, noise와 무관 source는 relevance 단계에서 버린다.
- raw partial snippet, 이상한 ellipsis, 근거 없는 인과관계를 reader에 노출하지 않는다.
- 의미 있는 사건이 적으면 filler를 만들지 않는다.
- 외부 장애는 route/preset 단위로 격리하고 마지막 정상 발행물을 보존한다.
- secret이나 production state를 commit하지 않는다. Production cron/promotion은 명시적 승인 없이는 하지 않는다.
- 작은 변경 중에는 관련 테스트만, 최종에 lint/typecheck/test/build/mobile e2e를 한 번 실행한다.
