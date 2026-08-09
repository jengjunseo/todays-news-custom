import type {
  DiscoveryProvider,
  RawEvidenceCandidate,
} from "@/lib/editorial/types";

type FixtureEvent = {
  title: string;
  alternateTitle: string;
  excerpt: string;
  secondExcerpt: string;
  sourceType?: RawEvidenceCandidate["sourceType"];
};

const EVENTS: Record<string, Record<string, FixtureEvent>> = {
  "girls-band-cry": {
    music: {
      title: "걸즈 밴드 크라이, 토게나시 토게아리 새 싱글 발매일 발표",
      alternateTitle: "토게나시 토게아리 새 싱글 발매일 확정",
      excerpt: "토게나시 토게아리가 새 싱글을 다음 달 공개한다고 공식 발표했습니다.",
      secondExcerpt: "공식 채널은 음원 공개일과 수록곡 정보를 함께 안내했습니다.",
      sourceType: "official",
    },
    live: {
      title: "토게나시 토게아리, 걸즈 밴드 크라이 단독 라이브 일정 공개",
      alternateTitle: "토게나시 토게아리 단독 라이브 개최 일정 확정",
      excerpt: "토게나시 토게아리가 두 도시에서 단독 공연을 연다고 발표했습니다.",
      secondExcerpt: "공연 날짜와 장소, 선행 예매 일정이 공개됐습니다.",
    },
    official: {
      title: "걸즈 밴드 크라이 공식 프로젝트, 새 영상 공개 계획 발표",
      alternateTitle: "걸즈 밴드 크라이 공식 프로젝트 새 영상 제작 확정",
      excerpt: "프로젝트 공식 채널이 새 영상의 공개 시기와 참여 스태프를 발표했습니다.",
      secondExcerpt: "발표에는 공개 일정과 제작 범위가 명시됐습니다.",
      sourceType: "official",
    },
    interview: {
      title: "걸즈 밴드 크라이 제작진, 밴드 음악 제작 과정 인터뷰 공개",
      alternateTitle: "걸즈 밴드 크라이 제작진 밴드 음악 제작 인터뷰",
      excerpt: "제작진이 곡 선정과 녹음 과정에서 멤버가 참여한 범위를 설명했습니다.",
      secondExcerpt: "인터뷰는 애니메이션과 밴드 활동의 제작 과정을 구분해 다뤘습니다.",
      sourceType: "interview",
    },
    creators: {
      title: "걸즈 밴드 크라이 주요 스태프, 새 공식 행사 참여 발표",
      alternateTitle: "걸즈 밴드 크라이 주요 제작진 공식 행사 참여 확정",
      excerpt: "주요 제작진과 출연진이 작품 제작 과정을 다루는 공식 무대에 참여합니다.",
      secondExcerpt: "행사 측은 참여자와 프로그램 범위를 함께 공개했습니다.",
    },
  },
  wonju: {
    civic: {
      title: "원주시, 돌봄 지원 예산 확대 시행안 확정",
      alternateTitle: "원주시 돌봄 지원 확대 예산 시행안 의결",
      excerpt: "원주시가 돌봄 서비스 지원 대상을 넓히는 예산과 시행 시기를 확정했습니다.",
      secondExcerpt: "의결안에는 신청 대상과 사업 시작 시점이 명시됐습니다.",
      sourceType: "official",
    },
    transport: {
      title: "원주 도심 버스 노선 개편안 확정, 환승 구간 확대",
      alternateTitle: "원주 도심 버스 노선 개편, 생활권 환승 확대",
      excerpt: "원주시가 도심 버스 노선을 조정하고 두 생활권의 환승 구간을 확대합니다.",
      secondExcerpt: "개편 노선은 다음 달부터 운행하며 기존 이용자 안내 기간을 둡니다.",
    },
    "education-health": {
      title: "원주 응급의료 야간 진료 지원 확대",
      alternateTitle: "원주시 야간 응급의료 진료 기관 지원 확대 확정",
      excerpt: "원주시가 야간 응급 진료를 맡는 의료기관의 운영 지원을 확대합니다.",
      secondExcerpt: "지원 대상 기관과 운영 시간은 시 보건 안내에 공개됩니다.",
    },
    economy: {
      title: "원주 소상공인 공동배송 지원 사업 확대",
      alternateTitle: "원주 소상공인 공동배송 지원 지역 확대",
      excerpt: "원주시가 소상공인의 배송비 부담을 낮추는 공동배송 사업 지역을 확대합니다.",
      secondExcerpt: "참여 조건과 지원 한도는 사업 공고에서 확인할 수 있습니다.",
    },
    living: {
      title: "원주 노후 상수도 정비 구간 확정, 단계별 공사 시작",
      alternateTitle: "원주시 노후 상수도 정비 구간과 일정 발표",
      excerpt: "원주시가 누수 위험이 높은 상수도 구간을 정하고 단계별 정비를 시작합니다.",
      secondExcerpt: "시는 공사 구간별 단수 가능 시간과 우회 안내를 사전에 알릴 계획입니다.",
      sourceType: "official",
    },
  },
};

export class FixtureDiscoveryProvider implements DiscoveryProvider {
  readonly name = "fixture";
  readonly channels = ["news-search", "official-feed"] as const;

  async search(input: Parameters<DiscoveryProvider["search"]>[0]) {
    const event = EVENTS[input.preset.id]?.[input.route.sectionId];
    if (!event) return [];
    const date = input.sourceDate;
    const base = `https://${input.preset.id}.example/${date}/${input.route.sectionId}`;
    const language = input.route.locales[0]?.split("-")[0] ?? "ko";
    const common = {
      publishedAt: new Date(`${date}T12:00:00+09:00`),
      language,
      sourceType: event.sourceType ?? ("news" as const),
    };
    const results: RawEvidenceCandidate[] = [
      {
        ...common,
        title: event.title,
        excerpt: event.excerpt,
        url: `${base}/official?utm_source=fixture`,
        providerUrl: `${base}/official`,
        publisher: "공식 발표 fixture",
      },
      {
        ...common,
        title: event.alternateTitle,
        excerpt: event.secondExcerpt,
        url: `https://independent-${input.preset.id}.example/${date}/${input.route.sectionId}`,
        publisher: "독립 보도 fixture",
        sourceType: "news",
      },
    ];

    if (input.route.id === input.preset.discovery[0]?.id) {
      results.push({
        ...common,
        title: input.preset.id === "wonju" ? "전국 기관장 기념 촬영 행사" : "인기 상품 재고 가격비교 모음",
        excerpt: input.preset.id === "wonju" ? "원주가 참석 지역 목록에 단순 언급됐습니다." : "걸즈 밴드 크라이 이름을 이용한 SEO성 재고 페이지입니다.",
        url: `https://noise.example/${input.preset.id}/${date}`,
        publisher: "noise fixture",
        sourceType: "news",
      });
    }
    return results;
  }
}
