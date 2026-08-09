import { describe, expect, it } from "vitest";

import { canonicalizeUrl, cleanNewsText, normalizeRawArticle } from "@/lib/news/normalize";

describe("news normalization", () => {
  it("removes provider HTML, entities and editorial labels", () => {
    expect(cleanNewsText("<b>[단독]</b> 정부&nbsp;정책 &amp; 국회")).toBe("정부 정책 & 국회");
  });

  it("canonicalizes host, tracking query and fragment", () => {
    expect(
      canonicalizeUrl("https://WWW.Example.com/news/1/?b=2&utm_source=x&a=1#section"),
    ).toBe("https://example.com/news/1?a=1&b=2");
  });

  it("uses canonical URL for a stable article id", () => {
    const base = {
      title: "기사 제목",
      description: "설명",
      providerLink: "https://n.news.naver.com/1",
      publishedAt: new Date("2026-08-01T02:00:00Z"),
    };
    const first = normalizeRawArticle({
      raw: { ...base, originalLink: "https://example.com/a?utm_source=x" },
      provider: "test",
      category: "politics",
      query: "정책",
      sourceDate: "2026-08-01",
    });
    const second = normalizeRawArticle({
      raw: { ...base, originalLink: "https://example.com/a" },
      provider: "test",
      category: "politics",
      query: "정책",
      sourceDate: "2026-08-01",
    });
    expect(first.id).toBe(second.id);
  });
});
