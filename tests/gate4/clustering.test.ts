import { describe, expect, it } from "vitest";

import { clusterAndRank, sameStory, topCandidatesByCategory } from "@/lib/news/cluster";
import type { NewsCategory, SourceArticle } from "@/lib/news/types";

function article(
  id: string,
  title: string,
  url: string,
  options: { category?: NewsCategory; query?: string; domain?: string } = {},
): SourceArticle {
  return {
    id: id.padEnd(32, "0").slice(0, 32),
    provider: "fixture",
    category: options.category ?? "economy",
    query: options.query ?? "경제 정책",
    title,
    normalizedTitle: title.replace(/[^0-9a-z가-힣\s]/gi, " ").toLowerCase(),
    description: "설명",
    canonicalUrl: url,
    providerUrl: `${url}?provider=fixture`,
    sourceDomain: options.domain ?? new URL(url).hostname,
    publishedAt: "2026-08-01T03:00:00.000Z",
    targetDate: "2026-08-01",
  };
}

describe("story clustering and ranking", () => {
  it("groups three headlines about the same event", () => {
    const items = [
      article("a", "정부 반도체 산업 10조 지원", "https://a.example/1", { domain: "a.example" }),
      article("b", "반도체 기업 정책금융 10조 공급", "https://b.example/1", { domain: "b.example" }),
      article("c", "정부 반도체 지원책 발표", "https://c.example/1", { domain: "c.example" }),
    ];
    expect(clusterAndRank(items)).toHaveLength(1);
    expect(clusterAndRank(items)[0]?.articleCount).toBe(3);
  });

  it("separates unrelated stories that only share a number", () => {
    const semiconductor = article("a", "반도체 기업 10조 투자", "https://a.example/a");
    const airport = article("b", "신공항 건설 10조 투자", "https://b.example/b");
    expect(sameStory(semiconductor, airport)).toBe(false);
  });

  it("separates different decisions on the same topic", () => {
    const freeze = article("a", "한국은행 기준금리 동결", "https://a.example/a");
    const raise = article("b", "한국은행 기준금리 인상", "https://b.example/b");
    expect(sameStory(freeze, raise)).toBe(false);
  });

  it("does not merge two different events through one bridge headline", () => {
    const redevelopment = article("a", "서울 강남 재개발 사업 승인", "https://a.example/a");
    const bridge = article("b", "서울 강남 재개발 교통 대책", "https://b.example/b");
    const subway = article("c", "강남 교통 대책 지하철 연장", "https://c.example/c");

    expect(sameStory(redevelopment, bridge)).toBe(true);
    expect(sameStory(bridge, subway)).toBe(true);
    expect(sameStory(redevelopment, subway)).toBe(false);
    expect(clusterAndRank([redevelopment, bridge, subway])).toHaveLength(2);
  });

  it("deduplicates an identical canonical URL", () => {
    const first = article("a", "금리 동결", "https://a.example/shared");
    const second = article("b", "기준금리 유지", "https://a.example/shared");
    const result = clusterAndRank([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]?.articleCount).toBe(1);
  });

  it("is stable and keeps only the configured top candidates", () => {
    const input = Array.from({ length: 8 }, (_, index) =>
      article(String(index), `서로 다른 경제 결정 ${index}`, `https://example.com/${index}`, {
        query: `검색 ${index}`,
      }),
    );
    expect(clusterAndRank(input)).toEqual(clusterAndRank([...input].reverse()));
    expect(topCandidatesByCategory(clusterAndRank(input)).economy).toHaveLength(6);
  });
});
