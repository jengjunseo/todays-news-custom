import { afterEach, describe, expect, it, vi } from "vitest";

import { ExaDiscoveryProvider } from "@/lib/editorial/providers/exa";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";

const sourceDate = "2026-08-01";
const route = girlsBandCryPreset.discovery.find((candidate) => candidate.channel === "web-search")!;

function searchInput() {
  return {
    preset: girlsBandCryPreset,
    route,
    query: route.queries[0]!,
    sourceDate,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Exa web-search evidence adapter", () => {
  it("calls ordinary Exa Search with bounded results and maps source content", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        id: "exa-result-id",
        title: "トゲナシトゲアリ、新曲を発表",
        url: "https://music.example/articles/new-song?utm_source=exa",
        publishedDate: "2026-08-01T03:00:00.000Z",
        author: "Music Example",
        highlights: ["バンドは新曲の発売日と配信開始日を公式に発表しました。"],
        summary: "This synthetic summary must never become evidence.",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new ExaDiscoveryProvider("test-exa-key", fetcher);

    const candidates = await provider.search(searchInput());

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.exa.ai/search");
    expect(options).toEqual(expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-api-key": "test-exa-key" }),
    }));
    expect(JSON.parse(String(options.body))).toEqual({
      query: route.queries[0],
      type: "auto",
      numResults: 8,
      startPublishedDate: "2026-07-31T15:00:00.000Z",
      endPublishedDate: "2026-08-01T14:59:59.999Z",
      contents: { highlights: true },
    });
    expect(candidates).toEqual([expect.objectContaining({
      title: "トゲナシトゲアリ、新曲を発表",
      excerpt: "バンドは新曲の発売日と配信開始日を公式に発表しました。",
      url: "https://music.example/articles/new-song?utm_source=exa",
      publisher: "Music Example",
      language: "ko",
      sourceType: "news",
    })]);
  });

  it("rejects malformed dates and never substitutes an Exa summary", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        {
          title: "날짜가 잘못된 기사",
          url: "https://example.com/bad-date",
          publishedDate: "not-a-date",
          highlights: ["실제 검색 문서에서 가져온 충분히 긴 하이라이트입니다."],
        },
        {
          title: "요약만 존재하는 기사",
          url: "https://example.com/summary-only",
          publishedDate: "2026-08-01T03:00:00.000Z",
          summary: "아주 길지만 Exa가 합성한 요약이므로 evidence로 쓰면 안 됩니다.",
        },
      ],
    }), { status: 200 }));

    await expect(new ExaDiscoveryProvider("test-exa-key", fetcher).search(searchInput()))
      .resolves.toEqual([]);
  });
});
