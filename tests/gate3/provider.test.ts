import { afterEach, describe, expect, it, vi } from "vitest";

import { collectNewsCandidates } from "@/lib/news/collect";
import { NEWS_CONFIG } from "@/lib/news/news-config";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NaverNewsProvider } from "@/lib/news/providers/naver";
import type { NewsProvider } from "@/lib/news/types";
import { isOnKstDate, previousKstDate } from "@/lib/time/kst";

afterEach(() => vi.restoreAllMocks());

describe("news providers", () => {
  it("calculates the previous day explicitly in Asia/Seoul", () => {
    expect(previousKstDate(new Date("2026-08-02T22:00:00Z"))).toBe("2026-08-02");
    expect(isOnKstDate(new Date("2026-08-01T15:00:00Z"), "2026-08-02")).toBe(true);
  });

  it("fixture covers all five categories and removes repeated URLs across queries", async () => {
    const articles = await collectNewsCandidates("2026-08-01", new FixtureNewsProvider());
    expect(new Set(articles.map((article) => article.category)).size).toBe(5);
    expect(new Set(articles.map((article) => article.canonicalUrl)).size).toBe(articles.length);
    for (const category of ["politics", "society", "science", "technology", "economy"]) {
      expect(articles.filter((article) => article.category === category).length).toBeGreaterThanOrEqual(6);
    }
  });

  it("bounds concurrent searches at four while preserving deterministic dedupe order", async () => {
    let active = 0;
    let maxActive = 0;
    const provider: NewsProvider = {
      name: "concurrency-fixture",
      async search() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return [{
          title: "shared article",
          description: "description",
          originalLink: "https://example.com/shared",
          providerLink: "https://example.com/shared/provider",
          publishedAt: new Date("2026-08-01T03:00:00.000Z"),
        }];
      },
    };

    const result = await collectNewsCandidates("2026-08-01", provider);

    expect(maxActive).toBe(4);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "politics", query: NEWS_CONFIG.politics[0] });
  });

  it("validates NAVER responses and keeps only the target KST date", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
          total: 2,
          start: 1,
          display: 2,
          items: [
            {
              title: "대상 날짜",
              originallink: "https://example.com/target",
              link: "https://n.news.naver.com/target",
              description: "설명",
              pubDate: "Sat, 01 Aug 2026 23:30:00 +0900",
            },
            {
              title: "이전 날짜",
              originallink: "https://example.com/old",
              link: "https://n.news.naver.com/old",
              description: "설명",
              pubDate: "Fri, 31 Jul 2026 23:30:00 +0900",
            },
          ],
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new NaverNewsProvider("id", "secret").search({
      query: "정책",
      category: "politics",
      sourceDate: "2026-08-01",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("대상 날짜");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [requestUrl, requestInit] = fetchMock.mock.calls[0]!;
    const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl.toString());
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://naverapihub.apigw.ntruss.com/search/v1/news",
    );
    expect(url.searchParams.get("query")).toBe("정책");
    expect(url.searchParams.get("display")).toBe("100");
    expect(url.searchParams.get("start")).toBe("1");
    expect(url.searchParams.get("sort")).toBe("date");
    expect(requestInit).toEqual({
      method: "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": "id",
        "X-NCP-APIGW-API-KEY": "secret",
      },
      cache: "no-store",
    });
  });

  it("rejects a malformed provider response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: "invalid" })));
    await expect(
      new NaverNewsProvider("id", "secret").search({
        query: "정책",
        category: "politics",
        sourceDate: "2026-08-01",
      }),
    ).rejects.toThrow();
  });

  it("isolates a malformed original URL without rejecting the NAVER search", async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      title: `article ${index}`,
      originallink: index === 75 ? "not-a-url" : `https://example.com/${index}`,
      link: `https://n.news.naver.com/${index}`,
      description: "description",
      pubDate: "Sat, 01 Aug 2026 12:00:00 +0900",
    }));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof URL ? input : new URL(input.toString());
      const pageItems = url.searchParams.get("start") === "1" ? items : [];
      return Response.json({ total: 100, start: Number(url.searchParams.get("start")), display: pageItems.length, items: pageItems });
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const result = await new NaverNewsProvider("id", "secret").search({
      query: "test",
      category: "politics",
      sourceDate: "2026-08-01",
    });

    expect(result).toHaveLength(100);
    expect(result[75]?.originalLink).toBe("https://n.news.naver.com/75");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"count":1'));
  });
});
