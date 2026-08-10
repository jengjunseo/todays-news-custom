import { definePreset } from "@/lib/presets/schema";

export const girlsBandCryPreset = definePreset({
  id: "girls-band-cry",
  displayName: "걸즈 밴드 크라이",
  description: "작품과 토게나시 토게아리의 중요한 음악·공연·공식 활동을 읽는 전문 면",
  aliases: [
    { value: "걸즈 밴드 크라이", language: "ko" },
    { value: "Girls Band Cry", language: "en" },
    { value: "ガールズバンドクライ", language: "ja" },
    { value: "토게나시 토게아리", language: "ko" },
    { value: "Togenashi Togeari", language: "en" },
    { value: "トゲナシトゲアリ", language: "ja" },
  ],
  officialDomains: ["girls-band-cry.com", "togenashitogeari.com"],
  sections: [
    { id: "music", label: "음악", priority: 10, relevanceTerms: ["신곡", "앨범", "싱글", "음원", "楽曲", "リリース"] },
    { id: "live", label: "라이브", priority: 9, relevanceTerms: ["라이브", "공연", "투어", "페스티벌", "ライブ", "公演"] },
    { id: "official", label: "공식 발표", priority: 8, relevanceTerms: ["공식", "발표", "프로젝트", "애니메이션", "公式", "発表"] },
    { id: "interview", label: "인터뷰", priority: 7, relevanceTerms: ["인터뷰", "대담", "코멘트", "インタビュー", "対談"] },
    { id: "creators", label: "제작진·활동", priority: 6, relevanceTerms: ["제작진", "감독", "성우", "스태프", "キャスト", "スタッフ"] },
  ],
  discovery: [
    { id: "gbc-official-direct", channel: "official-feed", sectionId: "official", intent: "공식 사이트에 직접 게시된 작품과 프로젝트 발표", queries: ["Girls Band Cry official news"], locales: ["ja-JP"], excludeTerms: ["루머", "유출"], sourceUrls: ["https://girls-band-cry.com/news/"] },
    { id: "gbc-music", channel: "web-search", sectionId: "music", intent: "신곡·앨범·음원처럼 실제 음악 활동의 변화", queries: ["걸즈 밴드 크라이 신곡", "トゲナシトゲアリ 新曲"], locales: ["ko-KR", "ja-JP"], excludeTerms: ["재고", "중고", "가사 번역"] },
    { id: "gbc-live", channel: "web-search", sectionId: "live", intent: "확정된 라이브·공연·투어 발표와 주요 결과", queries: ["토게나시 토게아리 라이브", "トゲナシトゲアリ ライブ"], locales: ["ko-KR", "ja-JP"], excludeTerms: ["티켓 양도", "직캠 모음"] },
    { id: "gbc-official", channel: "web-search", sectionId: "official", intent: "작품과 프로젝트의 공식 발표", queries: ["걸즈 밴드 크라이 공식 발표", "ガールズバンドクライ 公式"], locales: ["ko-KR", "ja-JP"], excludeTerms: ["루머", "유출"] },
    { id: "gbc-interview", channel: "web-search", sectionId: "interview", intent: "멤버·성우·제작진의 의미 있는 인터뷰", queries: ["걸즈 밴드 크라이 인터뷰", "ガールズバンドクライ インタビュー"], locales: ["ko-KR", "ja-JP"], excludeTerms: ["자동 번역"] },
    { id: "gbc-creators", channel: "web-search", sectionId: "creators", intent: "제작진과 밴드의 주요 활동", queries: ["걸즈 밴드 크라이 제작진", "ガールズバンドクライ スタッフ"], locales: ["ko-KR", "ja-JP"], excludeTerms: ["굿즈 재고"] },
  ],
  editorial: {
    importantSignals: ["신곡", "앨범", "공연", "투어", "공식", "인터뷰", "발표", "新曲", "ライブ", "公式"],
    noiseSignals: ["재고", "중고", "가격비교", "SEO", "루머", "유출", "단순 언급"],
    desiredItemCount: 5,
    allowFiller: false,
    minimumRelevanceScore: 38,
  },
  explanation: {
    readerContext: "독자는 작품과 토게나시 토게아리의 기본 관계를 알 수 있지만, 발표 주체와 작품·밴드 중 어느 쪽의 변화인지 짧게 구분해 설명한다.",
    usefulWhy: "이 변화는 팬이 실제로 듣거나 볼 수 있는 것과 향후 활동 일정, 확인된 창작 방향의 범위를 판단하는 데 중요합니다.",
    avoidInference: ["흥행이나 인기 상승을 수치 없이 단정하지 않는다.", "공식 발표 전 활동 중단·복귀·후속작을 추론하지 않는다."],
  },
});
