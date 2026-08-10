import type {
  DiscoveryProvider,
  RawEvidenceCandidate,
} from "@/lib/editorial/types";

/**
 * Deterministic evidence for local/demo certification.
 *
 * It is intentionally derived from the Preset contract instead of a central
 * event table, so adding a Preset never requires editing this provider.
 */
export class FixtureDiscoveryProvider implements DiscoveryProvider {
  readonly name = "fixture";
  readonly channels = ["news-search", "web-search", "official-feed"] as const;

  async search(input: Parameters<DiscoveryProvider["search"]>[0]) {
    const section = input.preset.sections.find((candidate) => candidate.id === input.route.sectionId);
    if (!section) return [];

    const date = input.sourceDate;
    const base = `https://${input.preset.id}.example/${date}/${input.route.sectionId}`;
    const language = input.route.locales[0]?.split("-")[0] ?? "ko";
    const alias = input.preset.aliases[0]?.value ?? input.preset.displayName;
    const relevanceTerm = section.relevanceTerms[0] ?? section.label;
    const importantSignal = input.preset.editorial.importantSignals[0] ?? "변화";
    const title = `${alias}, ${section.label} ${importantSignal} 내용 확인`;
    const alternateTitle = title;
    const common = {
      publishedAt: new Date(`${date}T12:00:00+09:00`),
      language,
    };

    const results: RawEvidenceCandidate[] = [
      {
        ...common,
        title,
        excerpt: `${input.route.intent}와 관련해 ${alias}의 ${relevanceTerm} 적용 범위와 일정이 공식 자료에서 확인됐습니다.`,
        url: `${base}/official?utm_source=fixture`,
        providerUrl: `${base}/official`,
        publisher: "공식 발표 fixture",
        sourceType: "official",
      },
      {
        ...common,
        title: alternateTitle,
        excerpt: `${input.route.intent}에 해당하는 변화의 대상과 시점을 독립 보도가 추가로 확인했습니다.`,
        url: `https://independent-${input.preset.id}.example/${date}/${input.route.sectionId}`,
        publisher: "독립 보도 fixture",
        sourceType: "news",
      },
    ];

    if (input.route.id === input.preset.discovery[0]?.id) {
      results.push({
        ...common,
        title: `${input.preset.displayName} 단순 홍보 행사와 재고 안내`,
        excerpt: `${input.preset.displayName} 이름만 언급한 반복 홍보성 SEO 페이지입니다.`,
        url: `https://noise.example/${input.preset.id}/${date}`,
        publisher: "noise fixture",
        sourceType: "news",
      });
    }

    return results;
  }
}
