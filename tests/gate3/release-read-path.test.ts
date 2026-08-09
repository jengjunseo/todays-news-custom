import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryTexts, sqlMock } = vi.hoisted(() => ({
  queryTexts: [] as string[],
  sqlMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("@/lib/config/mode", () => ({ isDemoMode: () => false }));
vi.mock("@/lib/db/postgres", () => ({ getPostgres: () => sqlMock }));

import {
  getCurrentDigest,
  getCurrentInsightDigest,
  getPublishedDigestBySourceDate,
} from "@/lib/digest/read-digest";

const digestHeader = {
  id: "digest-1",
  sourceDate: "2026-08-03",
  itemCount: 1,
  readingMinutes: 3,
  generatedAt: "2026-08-03T21:45:00.000Z",
};

const digestItem = {
  id: "item-1",
  clusterId: "cluster-1",
  category: "politics",
  rank: 1,
  headline: "headline",
  oneLine: "one line",
  overview: "overview",
  keyPoints: ["point one", "point two"],
  analogy: "analogy",
  whyItMatters: "why it matters",
  socraticQuestion: "question?",
  factStatus: "confirmed",
  confidence: 0.9,
  sourceIds: ["source-1", "source-2"],
};

beforeEach(() => {
  queryTexts.length = 0;
  sqlMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  sqlMock.mockImplementation((first: unknown) => {
    if (Array.isArray(first) && !("raw" in first)) return { values: first };
    const query = (first as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim();
    queryTexts.push(query);
    if (query.includes("from daily_digests")) return Promise.resolve([digestHeader]);
    if (query.includes("from digest_items")) return Promise.resolve([digestItem]);
    if (query.includes("from source_articles")) {
      return Promise.resolve([
        { id: "source-1", title: "source one", sourceDomain: "example.com", canonicalUrl: "https://example.com/1" },
        { id: "source-2", title: "source two", sourceDomain: "example.org", canonicalUrl: "https://example.org/2" },
      ]);
    }
    if (query.includes("from daily_nudges")) {
      return Promise.resolve([
        { id: "nudge-1", type: "morning", title: "nudge", insightBody: "insight", question: "question?" },
      ]);
    }
    throw new Error(`unexpected query: ${query}`);
  });
});

describe("V1.0 release read paths", () => {
  it("reads only current digest items and their referenced sources for Home", async () => {
    const digest = await getCurrentDigest();

    expect(digest?.items[0]?.sources).toHaveLength(2);
    expect(queryTexts.some((query) => query.includes("from daily_nudges"))).toBe(false);
    expect(queryTexts.find((query) => query.includes("from source_articles"))).toContain("where id in");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"current_digest_header_ms"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"current_digest_items_ms"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"current_digest_sources_ms"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"current_digest_total_ms"'));
  });

  it("reads only current digest metadata and nudge view fields for Insights", async () => {
    const digest = await getCurrentInsightDigest();

    expect(digest?.nudges).toEqual([
      { id: "nudge-1", type: "morning", title: "nudge", insightBody: "insight", question: "question?" },
    ]);
    expect(queryTexts.some((query) => query.includes("from digest_items"))).toBe(false);
    expect(queryTexts.some((query) => query.includes("from source_articles"))).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"insights_digest_header_ms"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"insights_nudges_ms"'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"stage":"insights_total_ms"'));
  });

  it("reads only the requested published archive digest and its sources", async () => {
    const digest = await getPublishedDigestBySourceDate("2026-08-03");

    expect(digest?.sourceDate).toBe("2026-08-03");
    const headerQuery = queryTexts.find((query) => query.includes("from daily_digests"));
    expect(headerQuery).toContain("status = 'published'");
    expect(headerQuery).toContain("source_date =");
    expect(queryTexts.some((query) => query.includes("from daily_nudges"))).toBe(false);
    expect(queryTexts.find((query) => query.includes("from source_articles"))).toContain("where id in");
  });
});
