import { describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { createFallbackDigestItem, summarizeStory } from "@/lib/digest/summarize-story";
import type { StoryCluster } from "@/lib/news/cluster";

function cluster(id: string, category: StoryCluster["category"] = "economy"): StoryCluster {
  return {
    id,
    category,
    targetDate: "2026-08-01",
    representativeTitle: "한국은행 기준금리 동결",
    deterministicScore: 90,
    articleCount: 2,
    sourceCount: 2,
    queryCount: 2,
    articles: ["a", "b"].map((suffix, index) => ({
      id: `${id}${suffix}`.padEnd(32, "0").slice(0, 32),
      provider: "fixture",
      category,
      query: `금리 ${index}`,
      title: "한국은행 기준금리 동결",
      normalizedTitle: "한국은행 기준금리 동결",
      description: "물가와 가계부채를 함께 고려한 결정입니다.",
      canonicalUrl: `https://${suffix}.example/${id}`,
      providerUrl: `https://n.news.naver.com/${id}/${suffix}`,
      sourceDomain: `${suffix}.example`,
      publishedAt: "2026-08-01T03:00:00.000Z",
      targetDate: "2026-08-01",
    })),
  };
}

function validItem(clusterId: string, sourceIds = ["S1", "S2"]) {
  return {
    clusterId,
    headline: "한국은행, 기준금리 동결",
    oneLine: "물가와 가계부채를 함께 고려해 금리를 유지했습니다.",
    overview: "한국은행이 기준금리를 유지했습니다.",
    keyPoints: ["금리를 바꾸지 않았습니다.", "물가와 부채 위험을 함께 봤습니다."],
    analogy: "속도와 안전을 함께 보는 운전과 비슷합니다.",
    whyItMatters: "대출 이자와 소비 여건에 영향을 줍니다.",
    socraticQuestion: "물가와 부채 중 어느 위험을 먼저 줄여야 할까요?",
    factStatus: "confirmed" as const,
    confidence: 0.9,
    sourceIds,
  };
}

function mockGenerator(outputs: unknown[]): StructuredGenerator & { generate: ReturnType<typeof vi.fn> } {
  return { generate: vi.fn(async () => outputs.shift()) };
}

describe("AI selection and grounded explanation", () => {
  it("limits prompt sources to three distinct domains deterministically", async () => {
    const candidate = cluster("cluster-many");
    candidate.articles = [
      ...["1", "2", "3"].map((suffix) => ({
        ...candidate.articles[0]!,
        id: `a${suffix}`.padEnd(32, "0"),
        sourceDomain: "a.example",
        canonicalUrl: `https://a.example/${suffix}`,
      })),
      {
        ...candidate.articles[0]!,
        id: "b1".padEnd(32, "0"),
        sourceDomain: "b.example",
        canonicalUrl: "https://b.example/1",
      },
      {
        ...candidate.articles[0]!,
        id: "c1".padEnd(32, "0"),
        sourceDomain: "c.example",
        canonicalUrl: "https://c.example/1",
      },
    ];
    const prompts: string[] = [];
    const generator: StructuredGenerator = {
      async generate(input) {
        prompts.push(input.prompt);
        return { items: [validItem(candidate.id, ["S1", "S2", "S3"])] };
      },
    };

    await summarizeStory("economy", [candidate], generator);
    await summarizeStory("economy", [candidate], generator);

    const sources = JSON.parse(prompts[0]!.split("출처:\n")[1]!);
    expect(sources).toHaveLength(3);
    expect(sources.map((source: { domain: string }) => source.domain)).toEqual([
      "a.example",
      "b.example",
      "c.example",
    ]);
    expect(prompts[1]).toBe(prompts[0]);
    expect(prompts[0]).toContain("작동 구조를 1~2단계 설명하세요");
    expect(prompts[0]).toContain("현재 카드만 읽어도 생각을 시작할 수 있도록");
    expect(prompts[0]).toContain("영어 메타어를 질문에 그대로 쓰지 마세요");
  });

  it("accepts a valid schema and assigns category rank", async () => {
    const generator = mockGenerator([{ items: [validItem("cluster-1")] }]);
    const result = await summarizeStory("economy", [cluster("cluster-1")], generator);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "economy", rank: 1 });
  });

  it("rejects an unknown source ID then succeeds on one correction retry", async () => {
    const generator = mockGenerator([
      { items: [validItem("cluster-1", ["S99"])] },
      { items: [validItem("cluster-1")] },
    ]);
    const result = await summarizeStory("economy", [cluster("cluster-1")], generator);
    expect(result).toHaveLength(1);
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry an external API failure", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = new APICallError({
      message: "rate limited",
      url: "https://openrouter.ai/api/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: '{"error":{"message":"rate limit reached"}}',
    });
    const generator = {
      generate: vi.fn().mockRejectedValue(error),
    } satisfies StructuredGenerator;

    await expect(summarizeStory("economy", [cluster("cluster-1")], generator)).rejects.toBe(error);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    const errorLog = logSpy.mock.calls
      .map(([entry]) => JSON.parse(String(entry)))
      .find((entry) => entry.stage === "category_first_ai_call_completed");
    expect(errorLog).toMatchObject({
      result: "error",
      errorName: "AI_APICallError",
      errorMessage: "rate limited",
      statusCode: 429,
      responseBody: '{"error":{"message":"rate limit reached"}}',
    });
    logSpy.mockRestore();
  });

  it("rejects a cluster outside candidates", async () => {
    const generator = mockGenerator([
      { items: [validItem("invented")] },
      { items: [validItem("invented")] },
    ]);
    await expect(summarizeStory("economy", [cluster("cluster-1")], generator)).rejects.toThrow(
      "경제 요약/grounding 실패: 후보 밖 cluster ID입니다.",
    );
  });

  it("rejects duplicate clusters and more than two items", async () => {
    const duplicate = { items: [validItem("cluster-1"), validItem("cluster-1")] };
    const tooMany = {
      items: [validItem("cluster-1"), validItem("cluster-2"), validItem("cluster-3")],
    };
    await expect(
      summarizeStory(
        "economy",
        [cluster("cluster-1"), cluster("cluster-2"), cluster("cluster-3")],
        mockGenerator([duplicate, tooMany]),
      ),
    ).rejects.toThrow("경제 요약/grounding 실패");
  });

  it("preserves the final error after two invalid responses", async () => {
    const generator = mockGenerator([{ invalid: true }, { invalid: true }]);
    await expect(summarizeStory("economy", [cluster("cluster-1")], generator)).rejects.toThrow(
      "경제 요약/grounding 실패",
    );
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it("creates readable fallback fields without truncation, repetition, or source-count metadata", () => {
    const candidate = cluster("fallback-quality");
    candidate.sourceCount = 9;
    candidate.representativeTitle = "지역 기업이 새로운 운영 계획을 발표했다";
    candidate.articles = [
      {
        ...candidate.articles[0]!,
        id: "fallback-a".padEnd(32, "0"),
        title: candidate.representativeTitle,
        description: "회사는 기존 사업의 운영 방식을 다음 달부터 단계적으로 바꾸겠다고 밝혔다. 적용 대상은 일부 지역부터 시작된다.",
      },
      {
        ...candidate.articles[1]!,
        id: "fallback-b".padEnd(32, "0"),
        title: "운영 계획의 적용 대상 공개",
        description: "첫 적용 지역과 구체적인 일정은 후속 공지에서 공개될 예정이다.",
      },
    ];

    const item = createFallbackDigestItem("economy", candidate);
    const fields = [item.oneLine, item.overview, ...item.keyPoints, item.analogy];
    const normalized = fields.map((value) => value.replace(/[^\p{L}\p{N}]/gu, ""));

    expect(item.whyItMatters).not.toContain("9개 출처");
    expect(new Set(normalized).size).toBe(normalized.length);
    expect(fields.every((value) => !value.endsWith("밝혔"))).toBe(true);
    expect(item.socraticQuestion).toContain(item.oneLine);
    expect(item.socraticQuestion).not.toMatch(/trade-off|incentive|second-order effect|verification/i);
  });

  it("drops partial snippets, unbalanced quotes, and duplicate fallback facts", () => {
    const candidate = cluster("fallback-fragments");
    candidate.representativeTitle = "지역 기업이 신규 사업 계획을 발표했다";
    candidate.articles = [
      {
        ...candidate.articles[0]!,
        id: "fragment-a".padEnd(32, "0"),
        title: candidate.representativeTitle,
        description: "지역 경제를 활성화하고, ... 회사는 다음 달 시범 사업을 시작한다고 밝혔다. 고객 신",
      },
      {
        ...candidate.articles[1]!,
        id: "fragment-b".padEnd(32, "0"),
        title: "신규 사업 계획의 일정 공개",
        description: "“새 사업은 지역 경제를 회사는 다음 달 시범 사업을 시작한다고 밝혔다. 적용 대상은 두 지역으로 제한된다.",
      },
    ];

    const item = createFallbackDigestItem("economy", candidate);
    const fields = [item.oneLine, item.overview, ...item.keyPoints, item.analogy];
    const normalized = fields.map((value) => value.replace(/[^\p{L}\p{N}]/gu, ""));

    expect(fields.join(" ")).not.toMatch(/\.\.\.|…|고객 신|“새 사업은/);
    expect(new Set(normalized).size).toBe(normalized.length);
    expect(item.oneLine).toBe("회사는 다음 달 시범 사업을 시작한다고 밝혔다.");
    expect(item.overview).toBe("적용 대상은 두 지역으로 제한된다.");
  });
});
