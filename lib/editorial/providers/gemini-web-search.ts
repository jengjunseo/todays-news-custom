import { createGoogle, type GoogleProviderMetadata } from "@ai-sdk/google";
import { generateText } from "ai";

import { cleanEvidenceText } from "@/lib/editorial/normalize-evidence";
import {
  RawEvidenceCandidateSchema,
  type DiscoveryProvider,
  type RawEvidenceCandidate,
} from "@/lib/editorial/types";

type GroundedUrlSource = {
  sourceType: "url";
  url: string;
  title?: string;
};

export type GeminiSearchResult = {
  sources: GroundedUrlSource[];
  providerMetadata?: Record<string, unknown>;
};

type SearchInput = Parameters<DiscoveryProvider["search"]>[0];
type SearchRunner = (input: {
  apiKey: string;
  model: string;
  prompt: string;
  startTime: string;
  endTime: string;
}) => Promise<GeminiSearchResult>;
type FetchPage = (source: GroundedUrlSource, input: SearchInput) => Promise<RawEvidenceCandidate | null>;

const MAX_GROUNDED_SOURCES = 8;
const MAX_PAGE_BYTES = 1_000_000;

function discoveryModel() {
  const explicit = process.env.DISCOVERY_MODEL?.trim();
  if (explicit) return explicit;
  if (process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini") {
    const legacy = process.env.AI_MODEL?.trim();
    if (legacy) return legacy;
  }
  throw new Error("DISCOVERY_MODEL이 설정되지 않았습니다.");
}

export function getDiscoveryRuntimeMetadata() {
  return { provider: "gemini" as const, model: discoveryModel() };
}

export function isWebSearchDiscoveryConfigured() {
  try {
    getDiscoveryRuntimeMetadata();
    return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  } catch {
    return false;
  }
}

function kstRange(sourceDate: string) {
  const start = new Date(`${sourceDate}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function searchPrompt(input: SearchInput) {
  const aliases = input.preset.aliases.map((alias) => `${alias.value} (${alias.language})`).join(", ");
  return [
    `Find public web pages published on ${input.sourceDate} in Korea/Japan time for this newspaper route.`,
    `Topic: ${input.preset.displayName}. Aliases: ${aliases}.`,
    `Editorial intent: ${input.route.intent}. Query focus: ${input.query}.`,
    `Locales: ${input.route.locales.join(", ")}. Exclude: ${input.route.excludeTerms.join(", ") || "none"}.`,
    "Prefer primary or official pages when relevant, while retaining useful independent reporting.",
    "Do not invent links. Return a short overview; only Google Search grounding sources will be consumed.",
  ].join("\n");
}

const defaultSearchRunner: SearchRunner = async (input) => {
  const google = createGoogle({ apiKey: input.apiKey });
  const result = await generateText({
    model: google(input.model),
    tools: {
      google_search: google.tools.googleSearch({
        searchTypes: { webSearch: {} },
        timeRangeFilter: { startTime: input.startTime, endTime: input.endTime },
      }),
    },
    prompt: input.prompt,
    maxRetries: 0,
    timeout: { totalMs: 90_000 },
    maxOutputTokens: 512,
  });
  return {
    sources: result.sources.flatMap((source) => source.sourceType === "url"
      ? [{ sourceType: "url" as const, url: source.url, title: source.title }]
      : []),
    providerMetadata: result.providerMetadata,
  };
};

function groundedSources(result: GeminiSearchResult) {
  const google = result.providerMetadata?.google as GoogleProviderMetadata | undefined;
  const groundedUrls = new Set(
    google?.groundingMetadata?.groundingChunks
      ?.flatMap((chunk) => {
        if (chunk.web?.uri) return [chunk.web.uri];
        const retrievedUri = chunk.retrievedContext?.uri;
        return retrievedUri?.startsWith("http://") || retrievedUri?.startsWith("https://")
          ? [retrievedUri]
          : [];
      }) ?? [],
  );
  if (groundedUrls.size === 0) return [];
  return result.sources.filter((source) => groundedUrls.has(source.url));
}

function attributes(tag: string) {
  const result = new Map<string, string>();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function metaValue(html: string, names: string[]) {
  const expected = new Set(names.map((name) => name.toLowerCase()));
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop");
    const content = attrs.get("content");
    if (key && content && expected.has(key.toLowerCase())) return cleanEvidenceText(content);
  }
  return "";
}

function canonicalLink(html: string, baseUrl: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.get("rel")?.toLowerCase() !== "canonical" || !attrs.get("href")) continue;
    try {
      const url = new URL(attrs.get("href")!, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      return baseUrl;
    }
  }
  return baseUrl;
}

function parsePublishedAt(value: string) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+09:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

type JsonLdArticle = {
  headline?: string;
  description?: string;
  datePublished?: string;
  publisher?: { name?: string } | string;
};

function jsonLdArticle(html: string): JsonLdArticle | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root: unknown = JSON.parse(match[1]!);
      const queue: unknown[] = [root];
      for (let visited = 0; queue.length > 0 && visited < 500; visited += 1) {
        const value = queue.shift();
        if (Array.isArray(value)) {
          queue.push(...value);
          continue;
        }
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (typeof record.datePublished === "string") return record as JsonLdArticle;
        queue.push(...Object.values(record));
      }
    } catch {
      continue;
    }
  }
  return null;
}

function pageTitle(html: string, sourceTitle?: string, structuredTitle?: string) {
  const meta = metaValue(html, ["og:title", "twitter:title", "headline"]);
  if (meta) return meta;
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanEvidenceText(title ?? structuredTitle ?? sourceTitle ?? "");
}

function pageExcerpt(html: string, structuredDescription?: string) {
  const meta = metaValue(html, ["og:description", "twitter:description", "description"]);
  if (meta) return meta;
  if (structuredDescription) return cleanEvidenceText(structuredDescription).slice(0, 1_200);
  for (const match of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const paragraph = cleanEvidenceText(match[1] ?? "");
    if (paragraph.length >= 40) return paragraph.slice(0, 1_200);
  }
  return "";
}

export function extractEvidenceFromHtml(input: {
  html: string;
  finalUrl: string;
  providerUrl: string;
  sourceTitle?: string;
  fallbackLanguage: string;
}) {
  const structured = jsonLdArticle(input.html);
  const title = pageTitle(input.html, input.sourceTitle, structured?.headline);
  const excerpt = pageExcerpt(input.html, structured?.description);
  const publishedAt = parsePublishedAt(metaValue(input.html, [
    "article:published_time",
    "datepublished",
    "date",
    "pubdate",
    "publishdate",
    "dc.date.issued",
  ]) || structured?.datePublished
    || cleanEvidenceText(input.html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] ?? ""));
  if (!title || excerpt.length < 20 || !publishedAt) return null;

  const htmlLanguage = input.html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1];
  const url = canonicalLink(input.html, input.finalUrl);
  const structuredPublisher = typeof structured?.publisher === "string"
    ? structured.publisher
    : structured?.publisher?.name;
  const publisher = metaValue(input.html, ["og:site_name", "application-name"])
    || cleanEvidenceText(structuredPublisher ?? "")
    || new URL(url).hostname.replace(/^www\./, "");
  return RawEvidenceCandidateSchema.parse({
    title,
    excerpt,
    url,
    providerUrl: input.providerUrl,
    publisher,
    publishedAt,
    language: htmlLanguage?.split("-")[0] ?? input.fallbackLanguage,
    sourceType: "news",
  });
}

async function readTextWithLimit(response: Response) {
  if (!response.body) return (await response.text()).slice(0, MAX_PAGE_BYTES);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_PAGE_BYTES - size;
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
    size += Math.min(value.length, remaining);
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

const defaultFetchPage: FetchPage = async (source, input) => {
  try {
    const response = await fetch(source.url, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) {
      return null;
    }
    return extractEvidenceFromHtml({
      html: await readTextWithLimit(response),
      finalUrl: response.url || source.url,
      providerUrl: source.url,
      sourceTitle: source.title,
      fallbackLanguage: input.route.locales[0]?.split("-")[0] ?? "und",
    });
  } catch {
    return null;
  }
};

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, task: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await task(values[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export class GeminiWebSearchDiscoveryProvider implements DiscoveryProvider {
  readonly name = "gemini-web-search";
  readonly channels = ["web-search"] as const;

  constructor(
    private readonly apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    private readonly model = process.env.DISCOVERY_MODEL,
    private readonly runSearch: SearchRunner = defaultSearchRunner,
    private readonly fetchPage: FetchPage = defaultFetchPage,
  ) {}

  async search(input: SearchInput) {
    if (!this.apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다.");
    const model = this.model?.trim() || discoveryModel();
    const range = kstRange(input.sourceDate);
    const result = await this.runSearch({
      apiKey: this.apiKey,
      model,
      prompt: searchPrompt(input),
      ...range,
    });
    const sources = groundedSources(result).slice(0, MAX_GROUNDED_SOURCES);
    if (sources.length === 0) return [];
    const candidates = await mapWithConcurrency(sources, 2, (source) => this.fetchPage(source, input));
    return candidates.filter((candidate): candidate is RawEvidenceCandidate => candidate !== null);
  }
}
