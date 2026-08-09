import { describe, expect, it, vi } from "vitest";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import type { DigestItem } from "@/lib/digest/schemas";
import { generateDailyNudges } from "@/lib/nudges/generate-daily-nudges";

function item(id: string, category: DigestItem["category"], sourceIds = ["S1", "S2"]): DigestItem {
  return {
    id,
    clusterId: `cluster-${id}`,
    category,
    rank: 1,
    headline: `${category} 핵심 변화`,
    oneLine: "전날 중요한 변화가 확인됐습니다.",
    overview: "무슨 일이 있었는지 차분하게 설명합니다.",
    keyPoints: ["첫 번째 핵심", "두 번째 핵심"],
    analogy: "지도를 고치는 일과 비슷합니다.",
    whyItMatters: "생활의 선택 범위를 바꿀 수 있습니다.",
    socraticQuestion: "이 변화의 비용은 누가 부담해야 할까요?",
    factStatus: "confirmed",
    confidence: 0.9,
    sourceIds,
  };
}

const items = [item("item-1", "economy"), item("item-2", "technology", ["S3", "S4"])];

function output(overrides: Record<string, unknown> = {}) {
  return {
    morning: {
      title: "어제의 핵심",
      notificationBody: "금리는 유지됐습니다. 중요한 건 그 이유입니다.",
      insightBody: "물가와 부채 위험을 함께 고려한 결정입니다.",
      question: "두 위험 중 무엇을 먼저 줄여야 할까요?",
      primaryItemId: "item-1",
      sourceIds: ["S1"],
    },
    perspective: {
      title: "점심 생각거리",
      notificationBody: "안정과 성장의 비용을 함께 봅니다.",
      insightBody: "한 선택이 다른 선택의 여지를 줄일 수 있습니다.",
      question: "어떤 비용을 더 공정하게 나눌 수 있을까요?",
      primaryItemId: "item-1",
      sourceIds: ["S1"],
      perspectiveType: "trade_off",
    },
    evening: {
      title: "오늘의 연결",
      notificationBody: "경제와 기술 변화가 자원 배분에서 만납니다.",
      insightBody: "두 사건은 전력과 투자 선택을 함께 바꿉니다.",
      question: "가장 먼저 생길 병목은 무엇일까요?",
      primaryItemId: "item-1",
      secondaryItemId: "item-2",
      sourceIds: ["S1"],
    },
    ...overrides,
  };
}

function generator(outputs: unknown[]): StructuredGenerator & { generate: ReturnType<typeof vi.fn> } {
  return { generate: vi.fn(async () => outputs.shift()) };
}

describe("three daily nudges", () => {
  it("uses deterministic nudges by default in production", async () => {
    vi.stubEnv("DEMO_MODE", "false");

    const result = await generateDailyNudges({ sourceDate: "2026-08-01", items });

    expect(result.map((nudge) => nudge.type)).toEqual(["morning", "perspective", "evening"]);
    vi.unstubAllEnvs();
  });

  it("creates morning, perspective and evening in one call", async () => {
    const mock = generator([output()]);
    const result = await generateDailyNudges({ sourceDate: "2026-08-01", items }, mock);
    expect(result.map((nudge) => nudge.type)).toEqual(["morning", "perspective", "evening"]);
    expect(mock.generate).toHaveBeenCalledTimes(1);
    expect(result[2]?.secondaryItemId).toBe("item-2");
  });

  it("uses the primary item source IDs without a correction call", async () => {
    const invalidSource = output({ morning: { ...output().morning, sourceIds: ["S99"] } });
    const mock = generator([invalidSource]);

    const result = await generateDailyNudges({ sourceDate: "2026-08-01", items }, mock);

    expect(result[0]?.sourceIds).toEqual(["S1", "S2"]);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry an aborted external call", async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "AbortError";
    const mock = {
      generate: vi.fn().mockRejectedValue(error),
    } satisfies StructuredGenerator;

    await expect(
      generateDailyNudges({ sourceDate: "2026-08-01", items }, mock),
    ).rejects.toBe(error);
    expect(mock.generate).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid item ID", async () => {
    const invalidItem = output({ morning: { ...output().morning, primaryItemId: "missing" } });
    await expect(
      generateDailyNudges({ sourceDate: "2026-08-01", items }, generator([invalidItem, invalidItem])),
    ).rejects.toThrow();
  });

  it("rejects pressure and FOMO language", async () => {
    const pressured = output({
      morning: { ...output().morning, notificationBody: "놓치면 뒤처집니다. 지금 당장 확인하세요." },
    });
    await expect(
      generateDailyNudges({ sourceDate: "2026-08-01", items }, generator([pressured, pressured])),
    ).rejects.toThrow("강압적");
  });

  it("uses explicit KST schedule values", async () => {
    const result = await generateDailyNudges(
      { sourceDate: "2026-08-01", items },
      generator([output()]),
    );
    expect(result.map((nudge) => nudge.scheduledFor)).toEqual([
      "2026-08-01T22:30:00.000Z",
      "2026-08-02T03:40:00.000Z",
      "2026-08-02T09:30:00.000Z",
    ]);
  });
});
