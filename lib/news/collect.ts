import { NEWS_CONFIG } from "@/lib/news/news-config";
import { normalizeRawArticle } from "@/lib/news/normalize";
import { FixtureNewsProvider } from "@/lib/news/providers/fixture";
import { NaverNewsProvider } from "@/lib/news/providers/naver";
import { NEWS_CATEGORIES, SourceArticleSchema, type NewsProvider } from "@/lib/news/types";
import { isOnKstDate } from "@/lib/time/kst";

export function configuredNewsProvider(): NewsProvider {
  if (process.env.DEMO_MODE === "true" || process.env.NEWS_PROVIDER === "fixture") {
    return new FixtureNewsProvider();
  }
  return new NaverNewsProvider();
}

export async function collectNewsCandidates(
  sourceDate: string,
  provider: NewsProvider = configuredNewsProvider(),
) {
  const byUrl = new Map<string, ReturnType<typeof SourceArticleSchema.parse>>();
  const searches = NEWS_CATEGORIES.flatMap((category) =>
    NEWS_CONFIG[category].map((query) => ({ category, query })),
  );
  const results = new Array<{
    category: (typeof NEWS_CATEGORIES)[number];
    query: string;
    rawArticles: Awaited<ReturnType<NewsProvider["search"]>>;
  }>(searches.length);
  let nextSearchIndex = 0;

  async function worker() {
    while (nextSearchIndex < searches.length) {
      const index = nextSearchIndex;
      nextSearchIndex += 1;
      const { category, query } = searches[index]!;
      results[index] = {
        category,
        query,
        rawArticles: await provider.search({ category, query, sourceDate }),
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, searches.length) }, () => worker()));

  for (const { category, query, rawArticles } of results) {
    for (const raw of rawArticles) {
      if (!isOnKstDate(raw.publishedAt, sourceDate)) continue;
      const normalized = SourceArticleSchema.parse(
        normalizeRawArticle({ raw, provider: provider.name, category, query, sourceDate }),
      );
      if (!byUrl.has(normalized.canonicalUrl)) {
        byUrl.set(normalized.canonicalUrl, normalized);
      }
    }
  }

  return [...byUrl.values()].sort((a, b) => a.id.localeCompare(b.id));
}
