import type { NewsCategory, NewsProvider, RawNewsArticle } from "@/lib/news/types";

const EVENTS: Record<NewsCategory, readonly [string, string, string][]> = {
  politics: [
    ["정부, 지방재정 지원 기준 개편", "지방정부 재정 지원 기준을 인구와 생활 서비스 수요에 맞게 조정했습니다.", "policy"],
    ["국회, 재난 대응 기본법 개정안 처리", "재난 발생 때 기관 사이 정보 공유 절차를 명확히 했습니다.", "safety-law"],
    ["한일 외교당국, 공급망 협력 회의", "핵심 소재 공급망의 공동 대응 방안을 논의했습니다.", "diplomacy"],
  ],
  society: [
    ["교육부, 고교 디지털 교과서 기준 보완", "학교 현장의 접근성과 개인정보 보호 기준을 보완했습니다.", "education"],
    ["보건당국, 지역 응급의료 지원 확대", "야간 응급 진료가 부족한 지역의 지원을 늘리기로 했습니다.", "health"],
    ["산업안전 점검 대상에 소규모 현장 확대", "사고 위험이 큰 소규모 사업장도 집중 점검 대상에 포함됐습니다.", "labor"],
  ],
  science: [
    ["국내 연구진, 차세대 배터리 수명 개선 원리 확인", "실험 단계에서 전극 손상을 줄이는 원리를 확인했습니다.", "battery"],
    ["기상청, 한반도 집중호우 예측 자료 공개", "고해상도 관측 자료를 연구기관에 공개했습니다.", "climate"],
    ["우주 관측 위성, 첫 과학 데이터 전송", "국산 관측 위성이 초기 과학 데이터를 지상으로 보냈습니다.", "space"],
  ],
  technology: [
    ["정부, 공공 AI 시스템 안전 기준 발표", "공공기관 AI가 따라야 할 기록과 검증 기준이 제시됐습니다.", "ai-safety"],
    ["국내 반도체 공장, 저전력 공정 투자 확정", "전력 사용을 줄이는 새 생산 설비 투자가 확정됐습니다.", "chip"],
    ["주요 통신사, 스미싱 공동 차단 체계 도입", "의심 메시지 정보를 사업자끼리 빠르게 공유합니다.", "security"],
  ],
  economy: [
    ["한국은행, 기준금리 동결", "물가와 가계부채 위험을 함께 고려해 금리를 유지했습니다.", "rate"],
    ["정부, 중소 수출기업 보증 확대", "환율 변동 위험이 큰 중소기업의 보증 한도를 늘렸습니다.", "exports"],
    ["전력망 투자 계획 확정", "산업단지와 재생에너지 지역을 연결할 전력망 투자가 확정됐습니다.", "grid"],
  ],
};

function atKst(sourceDate: string, hour: number) {
  return new Date(`${sourceDate}T${String(hour).padStart(2, "0")}:20:00+09:00`);
}

export class FixtureNewsProvider implements NewsProvider {
  readonly name = "fixture";

  async search(input: Parameters<NewsProvider["search"]>[0]): Promise<RawNewsArticle[]> {
    const source = EVENTS[input.category];
    return source.flatMap(([title, description, slug], index) => [
      {
        title: index === 0 ? `<b>[종합]</b> ${title}` : title,
        description,
        originalLink: `https://news-a.example/${input.category}/${slug}?utm_source=fixture`,
        providerLink: `https://n.news.naver.com/article/001/${input.category}-${slug}`,
        publishedAt: atKst(input.sourceDate, 9 + index),
      },
      {
        title: `${title}… 관련 세부 내용 공개`,
        description: `${description} 관계 기관이 세부 내용을 추가로 공개했습니다.`,
        originalLink: `https://news-b.example/${input.category}/${slug}`,
        providerLink: `https://n.news.naver.com/article/002/${input.category}-${slug}`,
        publishedAt: atKst(input.sourceDate, 10 + index),
      },
    ]);
  }
}
