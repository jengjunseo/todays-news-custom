import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildExaSearchRequest,
  ExaDiscoveryProvider,
} from "@/lib/editorial/providers/exa";
import { evaluateSubjectIdentity } from "@/lib/editorial/subject-identity";
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
      query: expect.stringContaining(route.intent),
      type: "auto",
      numResults: 8,
      includeText: ["걸즈 밴드 크라이"],
      startPublishedDate: "2026-07-31T15:00:00.000Z",
      endPublishedDate: "2026-08-01T14:59:59.999Z",
      contents: { highlights: { query: expect.stringContaining(route.intent) } },
    });
    const request = JSON.parse(String(options.body));
    expect(request.query).toContain("Girls Band Cry");
    expect(request.query).toContain(route.queries[0]);
    expect(request.query).toContain(route.excludeTerms[0]);
    expect(request.query).toContain("ko-KR");
    expect(request).not.toHaveProperty("category");
    expect(request).not.toHaveProperty("outputSchema");
    expect(request.contents).not.toHaveProperty("summary");
    expect(candidates).toEqual([expect.objectContaining({
      title: "トゲナシトゲアリ、新曲を発表",
      excerpt: "バンドは新曲の発売日と配信開始日を公式に発表しました。",
      url: "https://music.example/articles/new-song?utm_source=exa",
      publisher: "Music Example",
      language: "ja",
      sourceType: "news",
    })]);
  });

  it("enriches every multilingual base query with Preset-owned route semantics", () => {
    const music = girlsBandCryPreset.discovery.find((candidate) => candidate.id === "gbc-music")!;
    const live = girlsBandCryPreset.discovery.find((candidate) => candidate.id === "gbc-live")!;
    const musicKo = buildExaSearchRequest({
      preset: girlsBandCryPreset,
      route: music,
      query: music.queries[0]!,
      sourceDate,
    });
    const musicJa = buildExaSearchRequest({
      preset: girlsBandCryPreset,
      route: music,
      query: music.queries[1]!,
      sourceDate,
    });
    const liveJa = buildExaSearchRequest({
      preset: girlsBandCryPreset,
      route: live,
      query: live.queries[1]!,
      sourceDate,
    });

    expect(musicKo.query).toContain(music.queries[0]);
    expect(musicKo.query).toContain("ko-KR");
    expect(musicJa.query).toContain(music.queries[1]);
    expect(musicJa.query).toContain("ja-JP");
    expect(musicJa.query).toContain("ガールズバンドクライ");
    expect(musicJa.query).toContain("トゲナシトゲアリ");
    expect(musicJa.query).toContain("井芹仁菜");
    expect(musicJa.query).toContain(music.intent);
    expect(musicKo.includeText).toEqual(["걸즈 밴드 크라이"]);
    expect(musicJa.includeText).toEqual(["トゲナシトゲアリ"]);
    expect(liveJa.includeText).toEqual(["トゲナシトゲアリ"]);
    expect(liveJa.query).toContain(live.intent);
    expect(liveJa.query).not.toBe(musicJa.query);
    expect(liveJa.contents.highlights.query).toContain(live.intent);
    expect(liveJa).not.toHaveProperty("category");
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

  it("uses the real article lead, not an Exa highlight, as identity evidence", async () => {
    const articleUrl = "https://entertainment.example/miyeon-run-away";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "https://api.exa.ai/search") {
        return new Response(JSON.stringify({
          results: [{
            title: "i-dle 미연, 일본 첫 싱글 RUN AWAY 발표",
            url: articleUrl,
            publishedDate: "2026-08-01T03:00:00.000Z",
            highlights: ["추천 기사에서는 걸즈 밴드 크라이 신곡과 라이브 소식도 소개했습니다."],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(`<html lang="ko"><head><title>i-dle 미연, RUN AWAY 발표</title></head><body>
        <article><p>미연이 일본 첫 오리지널 디지털 싱글의 발매일과 활동 계획을 공개했습니다.</p></article>
        <aside>추천: ガールズバンドクライ 新曲 ライブ</aside>
      </body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    });
    const provider = new ExaDiscoveryProvider("test-exa-key", fetcher as typeof fetch);

    const [raw] = await provider.search(searchInput());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(raw?.identityLead).toBe("미연이 일본 첫 오리지널 디지털 싱글의 발매일과 활동 계획을 공개했습니다.");
    expect(raw?.identityLead).not.toContain("ガールズバンドクライ");
    expect(raw?.language).toBe("ko");
    expect(evaluateSubjectIdentity({
      candidate: raw!,
      preset: girlsBandCryPreset,
      route,
      provider: provider.name,
    })).toEqual({ accepted: false, proof: "missing-subject" });
  });

  it.each([
    {
      routeId: "gbc-music",
      title: "BIGBANG、20周年を記念した新曲リリースを発表",
      lead: "BIGBANGがデビュー20周年を記念する新曲と活動日程を発表しました。",
    },
    {
      routeId: "gbc-live",
      title: "ILLIT、日本の大型音楽フェス出演決定",
      lead: "ILLITが日本で開催される音楽フェスの出演者として発表されました。",
    },
  ])("keeps broad-entertainment noise outside the identity boundary: $routeId", async ({ routeId, title, lead }) => {
    const targetRoute = girlsBandCryPreset.discovery.find((candidate) => candidate.id === routeId)!;
    const articleUrl = `https://entertainment.example/${routeId}`;
    let searchRequest: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "https://api.exa.ai/search") {
        searchRequest = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          results: [{
            title,
            url: articleUrl,
            publishedDate: "2026-08-01T03:00:00.000Z",
            highlights: [`関連記事にはガールズバンドクライとトゲナシトゲアリの情報もあります。`],
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(`<html lang="ja"><head><title>${title}</title></head><body><article><p>${lead}</p></article></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    const provider = new ExaDiscoveryProvider("test-exa-key", fetcher as typeof fetch);
    const [raw] = await provider.search({
      preset: girlsBandCryPreset,
      route: targetRoute,
      query: targetRoute.queries[1]!,
      sourceDate,
    });

    expect(searchRequest?.query).toContain("ガールズバンドクライ");
    expect(searchRequest?.query).toContain(targetRoute.intent);
    expect(searchRequest?.query).not.toContain("BIGBANG");
    expect(searchRequest?.query).not.toContain("ILLIT");
    expect(evaluateSubjectIdentity({
      candidate: raw!,
      preset: girlsBandCryPreset,
      route: targetRoute,
      provider: provider.name,
    })).toEqual({ accepted: false, proof: "missing-subject" });
  });

  it("preserves positive recall for a direct Togenashi Togeari result", async () => {
    const music = girlsBandCryPreset.discovery.find((candidate) => candidate.id === "gbc-music")!;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        title: "トゲナシトゲアリ、新曲の配信日を発表",
        url: "https://music.example/togenashi-new-song",
        publishedDate: "2026-08-01T03:00:00.000Z",
        highlights: ["トゲナシトゲアリが新曲の配信日と収録内容を発表しました。"],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new ExaDiscoveryProvider("test-exa-key", fetcher);
    const [raw] = await provider.search({
      preset: girlsBandCryPreset,
      route: music,
      query: music.queries[1]!,
      sourceDate,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(evaluateSubjectIdentity({
      candidate: raw!,
      preset: girlsBandCryPreset,
      route: music,
      provider: provider.name,
    })).toEqual({ accepted: true, proof: "primary-title" });
  });
});
