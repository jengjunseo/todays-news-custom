import { describe, expect, it } from "vitest";

import { clusterAndRankEvidence } from "@/lib/editorial/cluster-evidence";
import { collectPresetEvidence } from "@/lib/editorial/collect-evidence";
import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import { NEWSPAPER_PRESETS } from "@/lib/presets";

const sourceDate = "2026-08-01";

describe("preset-driven evidence boundary", () => {
  it.each(NEWSPAPER_PRESETS)("normalizes and rejects noise for $id", async (preset) => {
    const evidence = await collectPresetEvidence({
      preset,
      sourceDate,
      providers: [new FixtureDiscoveryProvider()],
    });

    expect(evidence.length).toBe(preset.sections.length * 2);
    expect(evidence.every((document) => document.presetId === preset.id)).toBe(true);
    expect(evidence.every((document) => document.routeId && document.provider === "fixture")).toBe(true);
    expect(evidence.every((document) => document.canonicalUrl.startsWith("https://"))).toBe(true);
    expect(evidence.some((document) => document.sourceDomain === "noise.example")).toBe(false);
    expect(new Set(evidence.map((document) => document.category))).toEqual(
      new Set(preset.sections.map((section) => section.id)),
    );
  });

  it.each(NEWSPAPER_PRESETS)("groups corroborating sources into one event for $id", async (preset) => {
    const evidence = await collectPresetEvidence({ preset, sourceDate, providers: [new FixtureDiscoveryProvider()] });
    const clusters = clusterAndRankEvidence(preset, evidence);

    expect(clusters).toHaveLength(preset.sections.length);
    expect(clusters.every((cluster) => cluster.articleCount === 2)).toBe(true);
    expect(clusters.every((cluster) => cluster.sourceCount === 2)).toBe(true);
  });

  it("expresses different editorial worlds without different engines", () => {
    const [girlsBandCry, wonju] = NEWSPAPER_PRESETS;
    expect(girlsBandCry.sections.map((section) => section.id)).not.toEqual(
      wonju.sections.map((section) => section.id),
    );
    expect(girlsBandCry.discovery.every((route) => route.channel === "web-search")).toBe(true);
    expect(wonju.discovery.every((route) => route.channel === "news-search")).toBe(true);
    expect(girlsBandCry.editorial.allowFiller).toBe(false);
    expect(wonju.editorial.allowFiller).toBe(false);
  });
});
