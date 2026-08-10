import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GeminiWebSearchDiscoveryProvider,
  getDiscoveryRuntimeMetadata,
} from "@/lib/editorial/providers/gemini-web-search";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";

const sourceDate = "2026-08-01";
const route = girlsBandCryPreset.discovery[0]!;
const providerUrl = "https://grounding.example/redirect/123";

function searchInput() {
  return {
    preset: girlsBandCryPreset,
    route,
    query: route.queries[0]!,
    sourceDate,
  };
}

function groundedResult() {
  return {
    sources: [{ sourceType: "url" as const, url: providerUrl, title: "Grounded source" }],
    providerMetadata: {
      google: {
        groundingMetadata: {
          groundingChunks: [{ web: { uri: providerUrl, title: "Grounded source" } }],
        },
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Gemini web-search evidence adapter", () => {
  it("uses DISCOVERY_MODEL independently from the editorial AI model", () => {
    vi.stubEnv("AI_PROVIDER", "openrouter");
    vi.stubEnv("AI_MODEL", "openai/editorial-model");
    vi.stubEnv("DISCOVERY_MODEL", "gemini-3.6-flash");

    expect(getDiscoveryRuntimeMetadata()).toEqual({
      provider: "gemini",
      model: "gemini-3.6-flash",
    });
  });

  it("only uses AI_MODEL as a backward-compatible discovery model for Gemini editorial setups", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("AI_MODEL", "gemini-3.5-flash");
    vi.stubEnv("DISCOVERY_MODEL", "");
    expect(getDiscoveryRuntimeMetadata().model).toBe("gemini-3.5-flash");

    vi.stubEnv("AI_PROVIDER", "openrouter");
    expect(() => getDiscoveryRuntimeMetadata()).toThrow("DISCOVERY_MODEL");
  });

  it("keeps only fetched pages that are traceable to Google grounding sources", async () => {
    const runSearch = vi.fn().mockResolvedValue(groundedResult());
    const html = `
      <html lang="ja-JP"><head>
        <link rel="canonical" href="https://girls-band-cry.com/news/2026/08/01/live" />
        <meta property="og:title" content="ガールズバンドクライ 新ライブ発表" />
        <meta property="og:description" content="公式サイトは新しいライブの日程と会場を発表しました。" />
        <meta property="article:published_time" content="2026-08-01T09:00:00+09:00" />
        <meta property="og:site_name" content="Girls Band Cry Official" />
      </head></html>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })));
    const provider = new GeminiWebSearchDiscoveryProvider(
      "test-google-key",
      "gemini-3.6-flash",
      runSearch,
    );

    const evidence = await provider.search(searchInput());

    expect(runSearch).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "test-google-key",
      model: "gemini-3.6-flash",
      prompt: expect.stringContaining("トゲナシトゲアリ"),
      startTime: "2026-07-31T15:00:00.000Z",
      endTime: "2026-08-01T14:59:59.999Z",
    }));
    expect(evidence).toEqual([expect.objectContaining({
      title: "ガールズバンドクライ 新ライブ発表",
      excerpt: "公式サイトは新しいライブの日程と会場を発表しました。",
      url: "https://girls-band-cry.com/news/2026/08/01/live",
      providerUrl,
      publisher: "Girls Band Cry Official",
      language: "ja",
    })]);
  });

  it("discards ungrounded model output instead of treating prose as evidence", async () => {
    const fetchPage = vi.fn();
    const provider = new GeminiWebSearchDiscoveryProvider(
      "test-google-key",
      "gemini-3.6-flash",
      vi.fn().mockResolvedValue({
        sources: [{ sourceType: "url", url: providerUrl, title: "Model-mentioned source" }],
        providerMetadata: { google: { groundingMetadata: null } },
        text: "A confident but ungrounded answer with invented details.",
      }),
      fetchPage,
    );

    await expect(provider.search(searchInput())).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("discards grounded links whose fetched page lacks a usable publication date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`
      <html><head>
        <meta property="og:title" content="ガールズバンドクライ 新発表" />
        <meta property="og:description" content="公式サイトが新しい企画の詳細を公開しました。" />
      </head></html>
    `, { status: 200, headers: { "content-type": "text/html" } })));
    const provider = new GeminiWebSearchDiscoveryProvider(
      "test-google-key",
      "gemini-3.6-flash",
      vi.fn().mockResolvedValue(groundedResult()),
    );

    await expect(provider.search(searchInput())).resolves.toEqual([]);
  });
});
