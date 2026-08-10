import { describe, expect, it, vi } from "vitest";

import {
  extractOfficialListing,
  OfficialSourceDiscoveryProvider,
} from "@/lib/editorial/providers/official-source";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";

const sourceDate = "2026-08-01";
const route = girlsBandCryPreset.discovery.find((candidate) => candidate.channel === "official-feed")!;

function listingHtml() {
  return `<ul class="news-List">
    <li class="item"><a href="/news/post-488.html">
      <div class="ttl">ガールズバンドクライ、新企画を発表</div>
      <time class="time barlow-700">2026.08.01</time>
    </a></li>
    <li class="item"><a href="/news/post-old.html">
      <div class="ttl">前日のニュース</div><time>2026.07.31</time>
    </a></li>
    <li class="item"><a href="https://untrusted.example/post.html">
      <div class="ttl">외부 링크</div><time>2026.08.01</time>
    </a></li>
  </ul>`;
}

function detailHtml() {
  return `<html lang="ja-JP"><head>
    <link rel="canonical" href="https://girls-band-cry.com/news/post-488.html" />
    <meta property="og:title" content="ガールズバンドクライ、新企画を発表" />
    <meta property="og:description" content="公式サイトは新しい企画の開催日程と参加方法を発表しました。" />
    <meta property="og:site_name" content="Girls Band Cry Official" />
  </head></html>`;
}

describe("direct official-source evidence adapter", () => {
  it("extracts only same-domain dated links from the configured listing", () => {
    expect(extractOfficialListing({
      html: listingHtml(),
      baseUrl: "https://girls-band-cry.com/news/",
      officialDomains: girlsBandCryPreset.officialDomains,
    })).toEqual([
      expect.objectContaining({
        url: "https://girls-band-cry.com/news/post-488.html",
        title: "ガールズバンドクライ、新企画を発表",
      }),
      expect.objectContaining({
        url: "https://girls-band-cry.com/news/post-old.html",
        title: "前日のニュース",
      }),
    ]);
  });

  it("observes the Preset URL directly and fetches only matching-date detail pages", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value === "https://girls-band-cry.com/news/") {
        return new Response(listingHtml(), { status: 200, headers: { "content-type": "text/html" } });
      }
      if (value === "https://girls-band-cry.com/news/post-488.html") {
        return new Response(detailHtml(), { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected URL: ${value}`);
    });
    const provider = new OfficialSourceDiscoveryProvider(fetcher as typeof fetch);

    const candidates = await provider.search({
      preset: girlsBandCryPreset,
      route,
      query: route.queries[0]!,
      sourceDate,
    });

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://girls-band-cry.com/news/",
      "https://girls-band-cry.com/news/post-488.html",
    ]);
    expect(candidates).toEqual([expect.objectContaining({
      title: "ガールズバンドクライ、新企画を発表",
      excerpt: "公式サイトは新しい企画の開催日程と参加方法を発表しました。",
      url: "https://girls-band-cry.com/news/post-488.html",
      publisher: "Girls Band Cry Official",
      language: "ja",
      sourceType: "official",
    })]);
    expect(candidates[0]?.publishedAt.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });
});
