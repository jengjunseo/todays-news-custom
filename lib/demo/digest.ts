import { cache } from "react";

import type { DigestItem } from "@/lib/digest/schemas";
import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import { DEFAULT_PRESET_ID, getPreset } from "@/lib/presets";
import { MemoryDigestPublisher, paperIdentity } from "@/lib/pipeline/digest-publisher";
import { runPresetPaper } from "@/lib/pipeline/run-daily-digest";
import { previousKstDate } from "@/lib/time/kst";

export type DigestSource = {
  id: string;
  title: string;
  domain: string;
  publisher: string;
  sourceType: string;
  isOfficial: boolean;
  url: string;
};

export type DigestItemWithSources = DigestItem & { sources: DigestSource[] };

export const getDemoDigest = cache(async (presetId = DEFAULT_PRESET_ID) => {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`알 수 없는 demo preset입니다: ${presetId}`);
  const sourceDate = previousKstDate();
  const publisher = new MemoryDigestPublisher();
  const previousDemoMode = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  try {
    await runPresetPaper(preset, {
      sourceDate,
      force: true,
      providers: [new FixtureDiscoveryProvider()],
      publisher,
    });
    const bundle = publisher.published.get(paperIdentity(preset.id, sourceDate));
    if (!bundle) throw new Error(`${preset.id} demo paper가 발행되지 않았습니다.`);
    const sourceById = new Map(bundle.articles.map((article) => [article.id, article]));
    const items: DigestItemWithSources[] = bundle.items.map((item) => ({
      ...item,
      sources: item.sourceIds.flatMap((id) => {
        const source = sourceById.get(id);
        return source
          ? [{
              id,
              title: source.title,
              domain: source.sourceDomain,
              publisher: source.publisher,
              sourceType: source.sourceType,
              isOfficial: source.isOfficial,
              url: source.canonicalUrl,
            }]
          : [];
      }),
    }));
    return {
      id: `demo-${preset.id}-${sourceDate}`,
      presetId: preset.id,
      presetName: preset.displayName,
      sourceDate,
      status: "published" as const,
      itemCount: items.length,
      readingMinutes: bundle.readingMinutes,
      items,
      nudges: bundle.nudges,
      generatedAt: new Date(`${sourceDate}T21:45:00Z`).toISOString(),
    };
  } finally {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  }
});
