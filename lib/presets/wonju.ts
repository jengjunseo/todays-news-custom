import { definePreset } from "@/lib/presets/schema";

export const wonjuPreset = definePreset({
  id: "wonju",
  displayName: "원주",
  description: "원주시민의 생활에 직접 닿는 정책·교통·교육·의료·지역경제 전문 면",
  aliases: [
    { value: "원주", language: "ko" },
    { value: "원주시", language: "ko" },
    { value: "Wonju", language: "en" },
    { value: "原州市", language: "ja" },
  ],
  officialDomains: ["wonju.go.kr", "gw.go.kr", "korea.kr"],
  sections: [
    { id: "civic", label: "시정·정책", priority: 10, relevanceTerms: ["조례", "예산", "정책", "시의회", "시정", "지원"] },
    { id: "transport", label: "교통·안전", priority: 9, relevanceTerms: ["교통", "버스", "도로", "철도", "사고", "안전"] },
    { id: "education-health", label: "교육·의료", priority: 9, relevanceTerms: ["학교", "교육", "병원", "의료", "응급", "보건"] },
    { id: "economy", label: "지역경제", priority: 8, relevanceTerms: ["기업", "일자리", "산업", "시장", "소상공인", "투자"] },
    { id: "living", label: "생활·환경", priority: 7, relevanceTerms: ["주거", "환경", "개발", "상수도", "폐기물", "공원"] },
  ],
  discovery: [
    { id: "wonju-civic", channel: "news-search", sectionId: "civic", intent: "원주시 정책·예산·조례 중 시민에게 직접 영향을 주는 결정", queries: ["원주시 정책", "원주시의회 예산 조례"], locales: ["ko-KR"], excludeTerms: ["기관장 동정", "기념 촬영"] },
    { id: "wonju-transport", channel: "news-search", sectionId: "transport", intent: "대중교통·도로·철도·안전의 실질적 변화", queries: ["원주 교통 버스 도로", "원주 안전 철도"], locales: ["ko-KR"], excludeTerms: ["단순 캠페인"] },
    { id: "wonju-education-health", channel: "news-search", sectionId: "education-health", intent: "교육과 의료 서비스의 접근성·운영 변화", queries: ["원주 교육 학교", "원주 의료 병원 보건"], locales: ["ko-KR"], excludeTerms: ["봉사 사진"] },
    { id: "wonju-economy", channel: "news-search", sectionId: "economy", intent: "고용·기업·소상공인·산업에 실제 영향을 주는 변화", queries: ["원주 지역경제 일자리", "원주 기업 소상공인"], locales: ["ko-KR"], excludeTerms: ["홍보대사"] },
    { id: "wonju-living", channel: "news-search", sectionId: "living", intent: "주거·환경·도시개발·생활 기반시설의 변화", queries: ["원주 생활환경 개발", "원주 주거 상수도"], locales: ["ko-KR"], excludeTerms: ["작은 행사"] },
  ],
  editorial: {
    importantSignals: ["시행", "확정", "개통", "중단", "확대", "축소", "예산", "착공", "개선", "지원"],
    noiseSignals: ["기관장 동정", "기념 촬영", "업무협약", "캠페인", "작은 행사", "단순 언급", "홍보성"],
    desiredItemCount: 5,
    allowFiller: false,
    minimumRelevanceScore: 36,
  },
  explanation: {
    readerContext: "원주시민에게 직접 달라지는 대상 지역, 시행 시점, 이용 조건을 먼저 설명하고 강원도·중앙정부 결정은 원주에 미치는 연결고리가 확인될 때만 포함한다.",
    usefulWhy: "이 변화는 시민의 이동 시간, 이용 가능한 공공서비스, 가계·사업 비용, 안전과 생활환경 중 무엇이 달라지는지 판단하는 데 중요합니다.",
    avoidInference: ["개발 발표만으로 집값이나 지역경제 효과를 단정하지 않는다.", "협약·계획을 확정된 시행이나 완공처럼 표현하지 않는다."],
  },
});
