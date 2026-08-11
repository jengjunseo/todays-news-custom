import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import type { DiscoveryProvider } from "@/lib/editorial/types";
import { girlsBandCryPreset } from "@/lib/presets/girls-band-cry";
import { wonjuPreset } from "@/lib/presets/wonju";
import { MemoryDigestPublisher, paperIdentity } from "@/lib/pipeline/digest-publisher";
import { runPresetPaper } from "@/lib/pipeline/run-daily-digest";

const sourceDate = "2026-08-01";

function externalFailure(message = "provider unavailable") {
  return new APICallError({
    message,
    url: "https://editorial.example/generate",
    requestBodyValues: {},
    statusCode: 503,
    responseBody: '{"error":"unavailable"}',
  });
}

function validSummaryFromPrompt(prompt: string) {
  const candidateJson = prompt.split("후보:\n")[1]!.split("\n\n출처:\n")[0]!;
  const sourceJson = prompt.split("\n\n출처:\n")[1]!;
  const [candidate] = JSON.parse(candidateJson) as Array<{ clusterId: string; title: string }>;
  const sources = JSON.parse(sourceJson) as Array<{ id: string; clusterId: string }>;
  const sourceIds = sources.filter((source) => source.clusterId === candidate.clusterId).map((source) => source.id);
  return {
    items: [{
      clusterId: candidate.clusterId,
      headline: candidate.title,
      oneLine: `${candidate.title}의 구체적인 일정과 적용 범위가 확인됐습니다.`,
      overview: `${candidate.title} 발표에서 대상과 시행 시점이 함께 공개됐습니다.`,
      keyPoints: ["공식 자료에서 적용 대상을 확인했습니다.", "후속 일정은 발표된 시점부터 시작됩니다."],
      analogy: "쉽게 보면 발표와 실제 시행 시점을 나누어 확인하는 과정입니다.",
      whyItMatters: "독자는 발표된 대상과 시점을 기준으로 다음 변화를 판단할 수 있습니다.",
      socraticQuestion: `${candidate.title}의 시행 시점에 가장 먼저 확인할 변화는 무엇일까요?`,
      factStatus: "reported" as const,
      confidence: 0.8,
      sourceIds,
    }],
  };
}

function sectionFailingGenerator(failedLabel: string) {
  return {
    generate: vi.fn(async (input: { prompt: string }) => {
      if (input.prompt.includes(`분야: ${failedLabel}`)) throw externalFailure();
      return validSummaryFromPrompt(input.prompt);
    }),
  } as unknown as StructuredGenerator & { generate: ReturnType<typeof vi.fn> };
}

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

  it("omits one failed section and builds nudges only from independently valid items", async () => {
    const publisher = new MemoryDigestPublisher();
    const summaryGenerator = sectionFailingGenerator("라이브");
    const result = await runPresetPaper(girlsBandCryPreset, {
      sourceDate,
      publisher,
      providers: [new FixtureDiscoveryProvider()],
      summaryGenerator,
    });
    const paper = publisher.published.get(paperIdentity(girlsBandCryPreset.id, sourceDate))!;

    expect(result.status).toBe("published");
    expect(paper.items).toHaveLength(girlsBandCryPreset.editorial.desiredItemCount - 1);
    expect(paper.items.some((item) => item.category === "live")).toBe(false);
    expect(paper.nudges).toHaveLength(3);
    const validItemIds = new Set(paper.items.map((item) => item.id));
    expect(paper.nudges.every((nudge) => validItemIds.has(nudge.primaryItemId))).toBe(true);
    expect(JSON.stringify([...paper.items, ...paper.nudges])).not.toMatch(
      /쉽게 말해, .*그렇다면|기사에서 확인되는 핵심 내용|의 다음 단계는 무엇일까요/,
    );
    const logs = vi.mocked(console.log).mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(logs.find((entry) => entry.stage === "category_first_ai_call_completed" && entry.category === "live"))
      .toMatchObject({
        presetId: "girls-band-cry",
        sourceDate,
        result: "error",
        failureClass: "external-provider",
      });
    expect(logs.find((entry) => entry.stage === "category_first_ai_call_completed" && entry.category === "live")?.runKey)
      .toMatch(/^paper:girls-band-cry:2026-08-01:/);
    expect(logs.find((entry) => entry.stage === "section_editorial_skipped" && entry.sectionId === "live"))
      .toMatchObject({
        presetId: "girls-band-cry",
        sourceDate,
        skipped: true,
        failureClass: "external-provider",
        firstAiCall: "failed",
        correctionAttempted: false,
      });
    expect(logs.find((entry) => entry.stage === "editorial_selection_completed")).toMatchObject({
      skippedSectionCount: 1,
      survivingValidItemCount: 4,
    });
  });

  it("publishes no paper and generates no nudges when every editorial section is empty", async () => {
    const publisher = new MemoryDigestPublisher();
    const nudgeGenerator = { generate: vi.fn() } as unknown as StructuredGenerator & { generate: ReturnType<typeof vi.fn> };

    await expect(runPresetPaper(girlsBandCryPreset, {
      sourceDate,
      publisher,
      providers: [new FixtureDiscoveryProvider()],
      summaryGenerator: { generate: async () => ({ items: [] }) },
      nudgeGenerator,
    })).rejects.toThrow(/유효한 editorial item/);

    expect(publisher.published.size).toBe(0);
    expect(nudgeGenerator.generate).not.toHaveBeenCalled();
    expect([...publisher.runs.values()].at(-1)).toMatchObject({ status: "failed" });
    const logs = vi.mocked(console.log).mock.calls.map(([entry]) => JSON.parse(String(entry)));
    expect(logs.filter((entry) => entry.stage === "section_editorial_skipped")).toHaveLength(
      girlsBandCryPreset.sections.length,
    );
    expect(logs.find((entry) => entry.stage === "section_editorial_skipped")).toMatchObject({
      failureClass: "empty-editorial-selection",
      firstAiCall: "succeeded",
      correctionAttempted: false,
    });
    expect(logs.find((entry) => entry.stage === "paper_pipeline_failed")).toMatchObject({
      skippedSectionCount: girlsBandCryPreset.sections.length,
      survivingValidItemCount: 0,
    });
  });
});
