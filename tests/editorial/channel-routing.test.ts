import { describe, expect, it, vi } from "vitest";

import {
  collectPresetEvidence,
  configuredDiscoveryProviders,
} from "@/lib/editorial/collect-evidence";
import type { DiscoveryProvider } from "@/lib/editorial/types";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import { wonjuPreset } from "@/lib/presets/wonju";

function provider(name: string, channel: "news-search" | "web-search" | "official-feed") {
  return {
    name,
    channels: [channel],
    search: vi.fn().mockResolvedValue([]),
  } satisfies DiscoveryProvider;
}

describe("Preset discovery channel routing", () => {
  it("configures provider adapters without an LLM discovery provider", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DISCOVERY_PROVIDER", "live");

    expect(configuredDiscoveryProviders().map((candidate) => candidate.name)).toEqual([
      "naver",
      "exa",
      "official-source",
    ]);
    vi.unstubAllEnvs();
  });

  it("dispatches Girls Band Cry to Exa-style web-search and direct official-feed", async () => {
    const news = provider("news", "news-search");
    const web = provider("web", "web-search");
    const official = provider("official", "official-feed");

    await collectPresetEvidence({
      preset: girlsBandCryPreset,
      sourceDate: "2026-08-01",
      providers: [news, web, official],
    });

    expect(news.search).not.toHaveBeenCalled();
    expect(web.search).toHaveBeenCalledTimes(girlsBandCryPreset.discovery
      .filter((route) => route.channel === "web-search")
      .reduce((count, route) => count + route.queries.length, 0));
    expect(official.search).toHaveBeenCalledTimes(girlsBandCryPreset.discovery
      .filter((route) => route.channel === "official-feed")
      .reduce((count, route) => count + route.queries.length, 0));
  });

  it("dispatches Wonju only to Naver-compatible news-search", async () => {
    const news = provider("news", "news-search");
    const web = provider("web", "web-search");
    const official = provider("official", "official-feed");

    await collectPresetEvidence({
      preset: wonjuPreset,
      sourceDate: "2026-08-01",
      providers: [news, web, official],
    });

    expect(web.search).not.toHaveBeenCalled();
    expect(official.search).not.toHaveBeenCalled();
    expect(news.search).toHaveBeenCalledTimes(
      wonjuPreset.discovery.reduce((count, route) => count + route.queries.length, 0),
    );
  });

  it("deduplicates the same canonical source discovered through Exa and official observation", async () => {
    const candidate = {
      title: "걸즈 밴드 크라이 공식 신곡 발표",
      excerpt: "걸즈 밴드 크라이 공식 사이트가 신곡 공개 일정과 참여 멤버를 발표했습니다.",
      url: "https://girls-band-cry.com/news/post-488.html?utm_source=route",
      providerUrl: "https://girls-band-cry.com/news/post-488.html",
      publisher: "Girls Band Cry Official",
      publishedAt: new Date("2026-08-01T03:00:00.000Z"),
      language: "ko",
      sourceType: "official" as const,
    };
    const web = {
      ...provider("exa", "web-search"),
      search: vi.fn().mockResolvedValue([candidate]),
    } satisfies DiscoveryProvider;
    const official = {
      ...provider("official-source", "official-feed"),
      search: vi.fn().mockResolvedValue([{ ...candidate, url: candidate.providerUrl }]),
    } satisfies DiscoveryProvider;

    const evidence = await collectPresetEvidence({
      preset: girlsBandCryPreset,
      sourceDate: "2026-08-01",
      providers: [web, official],
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.canonicalUrl).toBe("https://girls-band-cry.com/news/post-488.html");
  });
});
