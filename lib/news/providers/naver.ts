import { z } from "zod";

import { NAVER_MAX_PAGES_PER_QUERY, NAVER_PAGE_SIZE } from "@/lib/news/news-config";
import { RawNewsArticleSchema, type NewsProvider } from "@/lib/news/types";
import { isOnKstDate } from "@/lib/time/kst";

const NaverResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  start: z.number().int().positive(),
  display: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      title: z.string(),
      originallink: z.string(),
      link: z.string(),
      description: z.string(),
      pubDate: z.string().min(1),
    }),
  ),
});

function usableHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export class NaverNewsProvider implements NewsProvider {
  readonly name = "naver";

  constructor(
    private readonly clientId = process.env.NAVER_API_HUB_CLIENT_ID,
    private readonly clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET,
  ) {}

  async search(input: Parameters<NewsProvider["search"]>[0]) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NAVER_API_HUB_CLIENT_ID와 NAVER_API_HUB_CLIENT_SECRET이 필요합니다.");
    }

    const collected = [];
    let malformedItemCount = 0;
    for (let page = 0; page < NAVER_MAX_PAGES_PER_QUERY; page += 1) {
      const start = page * NAVER_PAGE_SIZE + 1;
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
      url.searchParams.set("query", input.query);
      url.searchParams.set("display", String(NAVER_PAGE_SIZE));
      url.searchParams.set("start", String(start));
      url.searchParams.set("sort", "date");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-NCP-APIGW-API-KEY-ID": this.clientId,
          "X-NCP-APIGW-API-KEY": this.clientSecret,
        },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`NAVER 뉴스 검색 실패 (${response.status})`);
      }

      const parsed = NaverResponseSchema.parse(await response.json());
      let foundOlderArticle = false;
      for (const item of parsed.items) {
        const originalLink = usableHttpUrl(item.originallink);
        const providerLink = usableHttpUrl(item.link);
        if (!originalLink || !providerLink) malformedItemCount += 1;
        if (!originalLink && !providerLink) continue;
        const publishedAt = new Date(item.pubDate);
        if (Number.isNaN(publishedAt.getTime())) continue;
        const onTargetDate = isOnKstDate(publishedAt, input.sourceDate);
        if (onTargetDate) {
          collected.push(
            RawNewsArticleSchema.parse({
              title: item.title,
              description: item.description,
              originalLink: originalLink ?? providerLink,
              providerLink: providerLink ?? originalLink,
              publishedAt,
            }),
          );
        } else if (publishedAt < new Date(`${input.sourceDate}T00:00:00+09:00`)) {
          foundOlderArticle = true;
        }
      }

      if (foundOlderArticle || parsed.items.length < NAVER_PAGE_SIZE || start + NAVER_PAGE_SIZE > 1000) {
        break;
      }
    }
    if (malformedItemCount > 0) {
      console.log(JSON.stringify({
        event: "naver_malformed_items",
        category: input.category,
        query: input.query,
        sourceDate: input.sourceDate,
        count: malformedItemCount,
      }));
    }
    return collected;
  }
}
