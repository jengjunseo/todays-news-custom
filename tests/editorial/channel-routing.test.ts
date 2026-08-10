import { describe, expect, it, vi } from "vitest";

import { collectPresetEvidence } from "@/lib/editorial/collect-evidence";
import type { DiscoveryProvider } from "@/lib/editorial/types";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import { wonjuPreset } from "@/lib/presets/wonju";

function provider(name: string, channel: "news-search" | "web-search") {
  return {
    name,
    channels: [channel],
    search: vi.fn().mockResolvedValue([]),
  } satisfies DiscoveryProvider;
}

describe("Preset discovery channel routing", () => {
  it("dispatches Girls Band Cry only to multilingual web-search", async () => {
    const news = provider("news", "news-search");
    const web = provider("web", "web-search");

    await collectPresetEvidence({
      preset: girlsBandCryPreset,
      sourceDate: "2026-08-01",
      providers: [news, web],
    });

    expect(news.search).not.toHaveBeenCalled();
    expect(web.search).toHaveBeenCalledTimes(
      girlsBandCryPreset.discovery.reduce((count, route) => count + route.queries.length, 0),
    );
  });

  it("dispatches Wonju only to Naver-compatible news-search", async () => {
    const news = provider("news", "news-search");
    const web = provider("web", "web-search");

    await collectPresetEvidence({
      preset: wonjuPreset,
      sourceDate: "2026-08-01",
      providers: [news, web],
    });

    expect(web.search).not.toHaveBeenCalled();
    expect(news.search).toHaveBeenCalledTimes(
      wonjuPreset.discovery.reduce((count, route) => count + route.queries.length, 0),
    );
  });
});
