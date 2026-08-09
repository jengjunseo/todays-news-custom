import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import type { DiscoveryProvider } from "@/lib/editorial/types";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import { wonjuPreset } from "@/lib/presets/wonju";
import { MemoryDigestPublisher, paperIdentity } from "@/lib/pipeline/digest-publisher";
import { runPresetPaper } from "@/lib/pipeline/run-daily-digest";

const sourceDate = "2026-08-01";

beforeEach(() => {
  process.env.DEMO_MODE = "true";
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.DEMO_MODE;
  vi.restoreAllMocks();
});

describe("preset paper pipeline", () => {
  it("is idempotent within a paper identity", async () => {
    const publisher = new MemoryDigestPublisher();
    const options = { sourceDate, publisher, providers: [new FixtureDiscoveryProvider()] };
    const first = await runPresetPaper(girlsBandCryPreset, options);
    const second = await runPresetPaper(girlsBandCryPreset, options);

    expect(first.status).toBe("published");
    expect(second.status).toBe("skipped");
    expect(publisher.published.size).toBe(1);
    const paper = publisher.published.get(paperIdentity(girlsBandCryPreset.id, sourceDate))!;
    expect(paper.items).toHaveLength(girlsBandCryPreset.editorial.desiredItemCount);
    expect(paper.nudges).toHaveLength(3);
    expect(new Set(paper.articles.map((article) => article.id))).toEqual(
      new Set(paper.clusters.flatMap((cluster) => cluster.articles.map((article) => article.id))),
    );
  });

  it("publishes two presets for the same date without overwriting state", async () => {
    const publisher = new MemoryDigestPublisher();
    const options = { sourceDate, publisher, providers: [new FixtureDiscoveryProvider()] };
    await runPresetPaper(girlsBandCryPreset, options);
    await runPresetPaper(wonjuPreset, options);

    const girls = publisher.published.get(paperIdentity(girlsBandCryPreset.id, sourceDate))!;
    const wonju = publisher.published.get(paperIdentity(wonjuPreset.id, sourceDate))!;
    expect(publisher.published.size).toBe(2);
    expect(new Set(girls.items.map((item) => item.category))).toEqual(new Set(girlsBandCryPreset.sections.map((section) => section.id)));
    expect(new Set(wonju.items.map((item) => item.category))).toEqual(new Set(wonjuPreset.sections.map((section) => section.id)));
    expect(new Set(girls.items.map((item) => item.id))).not.toEqual(new Set(wonju.items.map((item) => item.id)));
    expect(new Set(girls.nudges.map((nudge) => nudge.id))).not.toEqual(new Set(wonju.nudges.map((nudge) => nudge.id)));
  });

  it("isolates a failed discovery route and publishes the remaining grounded sections", async () => {
    const fixture = new FixtureDiscoveryProvider();
    const partialProvider: DiscoveryProvider = {
      name: "partial-fixture",
      channels: fixture.channels,
      search: (input) => input.route.id === "wonju-civic"
        ? Promise.reject(new Error("route unavailable"))
        : fixture.search(input),
    };
    const publisher = new MemoryDigestPublisher();
    const result = await runPresetPaper(wonjuPreset, { sourceDate, publisher, providers: [partialProvider] });
    const paper = publisher.published.get(paperIdentity(wonjuPreset.id, sourceDate))!;

    expect(result.status).toBe("published");
    expect(paper.items.some((item) => item.category === "civic")).toBe(false);
    expect(paper.items.length).toBeGreaterThan(0);
    expect(paper.items.length).toBeLessThanOrEqual(wonjuPreset.editorial.desiredItemCount);
  });

  it("keeps the last published paper when a forced run has no evidence", async () => {
    const publisher = new MemoryDigestPublisher();
    await runPresetPaper(wonjuPreset, { sourceDate, publisher, providers: [new FixtureDiscoveryProvider()] });
    const key = paperIdentity(wonjuPreset.id, sourceDate);
    const previous = structuredClone(publisher.published.get(key));
    const unavailable: DiscoveryProvider = {
      name: "unavailable",
      channels: ["news-search"],
      search: async () => { throw new Error("provider down"); },
    };

    await expect(runPresetPaper(wonjuPreset, {
      sourceDate,
      force: true,
      publisher,
      providers: [unavailable],
    })).rejects.toThrow(/grounded evidence/);
    expect(publisher.published.get(key)).toEqual(previous);
  });

  it("uses deterministic grounded fallbacks when AI selects nothing", async () => {
    const publisher = new MemoryDigestPublisher();
    const result = await runPresetPaper(girlsBandCryPreset, {
      sourceDate,
      publisher,
      providers: [new FixtureDiscoveryProvider()],
      summaryGenerator: { generate: async () => ({ items: [] }) },
    });
    const paper = publisher.published.get(paperIdentity(girlsBandCryPreset.id, sourceDate))!;
    expect(result.status).toBe("published");
    expect(paper.items).toHaveLength(girlsBandCryPreset.editorial.desiredItemCount);
    expect(paper.items.every((item) => item.sourceIds.length >= 1)).toBe(true);
    expect(JSON.stringify(paper.items)).not.toMatch(/\.\.\.|…/);
  });
});
