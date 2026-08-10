import { afterEach, describe, expect, it, vi } from "vitest";

import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import { definePreset } from "@/lib/presets/schema";
import { MemoryDigestPublisher, paperIdentity } from "@/lib/pipeline/digest-publisher";
import { runPresetRegistry } from "@/lib/pipeline/run-daily-digest";

const kumamotoPreset = definePreset({
  id: "kumamoto-certification",
  displayName: "구마모토 인증면",
  description: "등록만으로 실행되는 임의의 제3 Preset을 검증하는 테스트 전용 신문면",
  aliases: [
    { value: "구마모토", language: "ko" },
    { value: "熊本", language: "ja" },
    { value: "Kumamoto", language: "en" },
  ],
  officialDomains: ["pref.kumamoto.jp", "city.kumamoto.jp"],
  sections: [
    { id: "civic", label: "지역 정책", priority: 10, relevanceTerms: ["정책", "予算"] },
    { id: "transport", label: "교통과 생활", priority: 9, relevanceTerms: ["교통", "交通"] },
  ],
  discovery: [
    { id: "kumamoto-civic", channel: "web-search", sectionId: "civic", intent: "구마모토 주민에게 직접 영향을 주는 정책 변화", queries: ["熊本 政策"], locales: ["ja-JP"], excludeTerms: ["관광 광고"] },
    { id: "kumamoto-transport", channel: "web-search", sectionId: "transport", intent: "구마모토 교통과 생활 기반시설 변화", queries: ["熊本 交通"], locales: ["ja-JP"], excludeTerms: ["여행 후기"] },
  ],
  editorial: {
    importantSignals: ["확정", "발표", "시행"],
    noiseSignals: ["광고", "후기", "재고", "SEO"],
    desiredItemCount: 2,
    allowFiller: false,
    minimumRelevanceScore: 35,
  },
  explanation: {
    readerContext: "구마모토 주민의 생활에 직접 연결되는 적용 대상과 시점을 짧게 보충합니다.",
    usefulWhy: "교통과 공공서비스 이용 조건이 실제로 어떻게 달라지는지 설명합니다.",
    avoidInference: ["계획을 완료된 결과처럼 표현하지 않습니다."],
  },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("data-only Preset certification", () => {
  it("runs an arbitrary third Preset through the registry pipeline without core fixtures", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const publisher = new MemoryDigestPublisher();

    const [result] = await runPresetRegistry([kumamotoPreset], {
      sourceDate: "2026-08-01",
      providers: [new FixtureDiscoveryProvider()],
      publisher,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "published",
      presetId: kumamotoPreset.id,
    }));
    const paper = publisher.published.get(paperIdentity(kumamotoPreset.id, "2026-08-01"))!;
    expect(paper.preset.id).toBe(kumamotoPreset.id);
    expect(paper.items).toHaveLength(2);
    expect(new Set(paper.items.map((item) => item.category))).toEqual(new Set(["civic", "transport"]));
    expect(paper.articles.every((article) => article.presetId === kumamotoPreset.id)).toBe(true);
    expect(paper.articles.every((article) => article.provider === "fixture")).toBe(true);
  });
});
