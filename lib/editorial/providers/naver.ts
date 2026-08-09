import { z } from "zod";

import {
  RawEvidenceCandidateSchema,
  type DiscoveryProvider,
  type RawEvidenceCandidate,
} from "@/lib/editorial/types";
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

function httpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export class NaverDiscoveryProvider implements DiscoveryProvider {
  readonly name = "naver";
  readonly channels = ["news-search"] as const;

  constructor(
    private readonly clientId = process.env.NAVER_API_HUB_CLIENT_ID,
    private readonly clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET,
  ) {}

  async search(input: Parameters<DiscoveryProvider["search"]>[0]) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("NAVER_API_HUB_CLIENT_ID와 NAVER_API_HUB_CLIENT_SECRET이 필요합니다.");
    }

    const collected: RawEvidenceCandidate[] = [];
    let malformedItemCount = 0;
    for (let page = 0; page < 3; page += 1) {
      const start = page * 100 + 1;
      const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/news");
      url.searchParams.set("query", input.query);
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(start));
      url.searchParams.set("sort", "date");

      const response = await fetch(url, {
        headers: {
          "X-NCP-APIGW-API-KEY-ID": this.clientId,
          "X-NCP-APIGW-API-KEY": this.clientSecret,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`NAVER discovery 실패 (${response.status})`);

      const parsed = NaverResponseSchema.parse(await response.json());
      let reachedOlderItem = false;
      for (const item of parsed.items) {
        const originalLink = httpUrl(item.originallink);
        const providerLink = httpUrl(item.link);
        if (!originalLink && !providerLink) {
          malformedItemCount += 1;
          continue;
        }
        const publishedAt = new Date(item.pubDate);
        if (Number.isNaN(publishedAt.getTime())) {
          malformedItemCount += 1;
          continue;
        }
        if (isOnKstDate(publishedAt, input.sourceDate)) {
          collected.push(
            RawEvidenceCandidateSchema.parse({
              title: item.title,
              excerpt: item.description,
              url: originalLink ?? providerLink,
              providerUrl: providerLink ?? originalLink,
              publishedAt,
              language: input.route.locales[0]?.split("-")[0] ?? "ko",
              sourceType: "news",
            }),
          );
        } else if (publishedAt < new Date(`${input.sourceDate}T00:00:00+09:00`)) {
          reachedOlderItem = true;
        }
      }
      if (reachedOlderItem || parsed.items.length < 100) break;
    }

    if (malformedItemCount > 0) {
      console.log(JSON.stringify({
        stage: "discovery_malformed_items",
        provider: this.name,
        presetId: input.preset.id,
        routeId: input.route.id,
        count: malformedItemCount,
      }));
    }
    return collected;
  }
}
