import { z } from "zod";

import { cleanEvidenceText } from "@/lib/editorial/normalize-evidence";
import {
  fetchPrimaryIdentitySurface,
  mapWithConcurrency,
} from "@/lib/editorial/providers/html-evidence";
import { hasTitleSubjectIdentity } from "@/lib/editorial/subject-identity";
import {
  RawEvidenceCandidateSchema,
  type DiscoveryProvider,
  type RawEvidenceCandidate,
} from "@/lib/editorial/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const MAX_RESULTS = 8;
const MAX_PRIMARY_ALIASES = 4;
const MAX_ASSOCIATED_ALIASES = 2;
const MAX_EXCLUDE_TERMS = 4;

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

function compactValues(values: string[], limit: number) {
  return [...new Set(values.map((value) => cleanEvidenceText(value).slice(0, 80)).filter(Boolean))]
    .slice(0, limit);
}

function localeForQuery(input: SearchInput) {
  const queryIndex = input.route.queries.indexOf(input.query);
  return input.route.locales[queryIndex] ?? input.route.locales[0] ?? "und";
}

function aliasesForLocale(input: SearchInput, locale: string) {
  const language = locale.split("-")[0]?.toLowerCase();
  const ordered = [
    ...input.preset.aliases.filter((alias) => alias.language.toLowerCase() === language),
    ...input.preset.aliases.filter((alias) => alias.language.toLowerCase() === "en"),
    ...input.preset.aliases,
  ];
  return compactValues(ordered.map((alias) => alias.value), MAX_PRIMARY_ALIASES);
}

export function buildExaSearchRequest(input: SearchInput) {
  const locale = localeForQuery(input);
  const primaryAliases = aliasesForLocale(input, locale);
  const associatedAliases = compactValues(
    input.preset.subjectIdentity?.associatedAliases.map((alias) => alias.value) ?? [],
    MAX_ASSOCIATED_ALIASES,
  );
  const excludeTerms = compactValues(input.route.excludeTerms, MAX_EXCLUDE_TERMS);
  const subject = primaryAliases.join(" / ");
  const clauses = [
    `Find a source page whose primary subject is ${subject}.`,
    `Focus on this route: ${cleanEvidenceText(input.route.intent)}.`,
    `Use \"${cleanEvidenceText(input.query)}\" as a multilingual search-phrasing hint.`,
    associatedAliases.length > 0
      ? `Coverage centered on ${associatedAliases.join(" / ")} is relevant only when explicitly connected to the primary subject.`
      : "",
    excludeTerms.length > 0
      ? `Do not intentionally seek pages primarily about ${excludeTerms.join(" / ")}.`
      : "",
    locale !== "und" ? `Preset locale context: ${locale}.` : "",
  ].filter(Boolean);
  const highlightClauses = [
    `Extract source passages that directly discuss ${subject}.`,
    `Prioritize passages about ${cleanEvidenceText(input.route.intent)}.`,
    associatedAliases.length > 0
      ? `Also extract an explicit connection to ${associatedAliases.join(" / ")} when present.`
      : "",
  ].filter(Boolean);

  return {
    query: clauses.join(" "),
    type: "auto" as const,
    numResults: MAX_RESULTS,
    ...kstRange(input.sourceDate),
    contents: {
      highlights: {
        query: highlightClauses.join(" "),
      },
    },
  };
}

function detectResultLanguage(value: string) {
  const hasHangul = /[\uac00-\ud7a3]/u.test(value);
  const hasKana = /[\u3040-\u30ff]/u.test(value);
  if (hasHangul === hasKana) return "und";
  return hasHangul ? "ko" : "ja";
}

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
      language: detectResultLanguage(`${title} ${excerpt}`),
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
    const startedAt = Date.now();
    const response = await this.fetcher(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(buildExaSearchRequest(input)),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Exa search failed (${response.status})`);
    const payload = ExaSearchResponseSchema.parse(await response.json());
    const parsedCandidates = payload.results
      .slice(0, MAX_RESULTS)
      .map((result) => toCandidate(result))
      .filter((candidate): candidate is RawEvidenceCandidate => candidate !== null);
    let identityPageFetchCount = 0;
    const candidates = await mapWithConcurrency(parsedCandidates, 2, async (candidate) => {
      if (!input.preset.subjectIdentity || hasTitleSubjectIdentity(input.preset, candidate.title)) {
        return candidate;
      }
      identityPageFetchCount += 1;
      const surface = await fetchPrimaryIdentitySurface({
        url: candidate.url,
        sourceTitle: candidate.title,
        fetcher: this.fetcher,
      });
      return RawEvidenceCandidateSchema.parse({
        ...candidate,
        title: surface?.title || candidate.title,
        identityLead: surface?.lead || undefined,
        language: surface?.language || candidate.language,
      });
    });
    const rejectedCount = Math.min(payload.results.length, MAX_RESULTS) - parsedCandidates.length;
    if (rejectedCount > 0) {
      console.log(JSON.stringify({
        stage: "discovery_items_rejected",
        presetId: input.preset.id,
        routeId: input.route.id,
        provider: this.name,
        rejectedCount,
      }));
    }
    console.log(JSON.stringify({
      stage: "exa_search_completed",
      presetId: input.preset.id,
      routeId: input.route.id,
      localeContext: localeForQuery(input),
      resultCount: candidates.length,
      identityPageFetchCount,
      elapsedMs: Date.now() - startedAt,
    }));
    return candidates;
  }
}
