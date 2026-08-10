import { z } from "zod";

import { cleanEvidenceText } from "@/lib/editorial/normalize-evidence";
import {
  RawEvidenceCandidateSchema,
  type DiscoveryProvider,
  type RawEvidenceCandidate,
} from "@/lib/editorial/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const MAX_RESULTS = 8;

const ExaSearchResponseSchema = z.object({
  results: z.array(z.object({
    id: z.string().optional(),
    title: z.string().nullish(),
    url: z.string().nullish(),
    publishedDate: z.string().nullish(),
    author: z.string().nullish(),
    text: z.string().nullish(),
    highlights: z.array(z.string()).nullish(),
    summary: z.string().nullish(),
  }).passthrough()).default([]),
}).passthrough();

type SearchInput = Parameters<DiscoveryProvider["search"]>[0];

function kstRange(sourceDate: string) {
  const start = new Date(`${sourceDate}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    startPublishedDate: start.toISOString(),
    endPublishedDate: end.toISOString(),
  };
}

function toCandidate(
  value: z.infer<typeof ExaSearchResponseSchema>["results"][number],
  input: SearchInput,
): RawEvidenceCandidate | null {
  const title = cleanEvidenceText(value.title ?? "");
  const excerpt = cleanEvidenceText(
    value.highlights?.filter(Boolean).join(" ") || value.text || "",
  ).slice(0, 1_200);
  const publishedAt = new Date(value.publishedDate ?? "");
  if (!title || excerpt.length < 20 || Number.isNaN(publishedAt.getTime())) return null;
  try {
    const url = new URL(value.url ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return RawEvidenceCandidateSchema.parse({
      title,
      excerpt,
      url: url.toString(),
      providerUrl: url.toString(),
      publisher: cleanEvidenceText(value.author ?? "") || url.hostname.replace(/^www\./, ""),
      publishedAt,
      language: input.route.locales[0]?.split("-")[0] ?? "und",
      sourceType: "news",
    });
  } catch {
    return null;
  }
}

export function isExaDiscoveryConfigured() {
  return Boolean(process.env.EXA_API_KEY?.trim());
}

export class ExaDiscoveryProvider implements DiscoveryProvider {
  readonly name = "exa";
  readonly channels = ["web-search"] as const;

  constructor(
    private readonly apiKey = process.env.EXA_API_KEY,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async search(input: SearchInput) {
    if (!this.apiKey?.trim()) throw new Error("EXA_API_KEY가 설정되지 않았습니다.");
    const response = await this.fetcher(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        query: input.query,
        type: "auto",
        numResults: MAX_RESULTS,
        ...kstRange(input.sourceDate),
        contents: { highlights: true },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Exa search failed (${response.status})`);
    const payload = ExaSearchResponseSchema.parse(await response.json());
    const candidates = payload.results
      .slice(0, MAX_RESULTS)
      .map((result) => toCandidate(result, input))
      .filter((candidate): candidate is RawEvidenceCandidate => candidate !== null);
    const rejectedCount = Math.min(payload.results.length, MAX_RESULTS) - candidates.length;
    if (rejectedCount > 0) {
      console.log(JSON.stringify({
        stage: "discovery_items_rejected",
        presetId: input.preset.id,
        routeId: input.route.id,
        provider: this.name,
        rejectedCount,
      }));
    }
    return candidates;
  }
}
