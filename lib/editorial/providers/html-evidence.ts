import { cleanEvidenceText } from "@/lib/editorial/normalize-evidence";
import {
  RawEvidenceCandidateSchema,
  type RawEvidenceCandidate,
} from "@/lib/editorial/types";

const MAX_PAGE_BYTES = 1_000_000;

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

export function parsePublishedAt(value: string | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}[.-]\d{2}[.-]\d{2}$/.test(value)
    ? `${value.replaceAll(".", "-")}T12:00:00+09:00`
    : value;
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
    if (paragraph.length >= 20) return paragraph.slice(0, 1_200);
  }
  return "";
}

export function extractEvidenceFromHtml(input: {
  html: string;
  finalUrl: string;
  providerUrl: string;
  sourceTitle?: string;
  fallbackLanguage: string;
  fallbackPublishedAt?: Date;
  sourceType?: "official" | "news";
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
    || cleanEvidenceText(input.html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] ?? ""))
    ?? input.fallbackPublishedAt
    ?? null;
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
    sourceType: input.sourceType ?? "news",
  });
}

export async function readTextWithLimit(response: Response) {
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

export async function fetchHtmlEvidence(input: {
  url: string;
  sourceTitle?: string;
  fallbackLanguage: string;
  fallbackPublishedAt?: Date;
  sourceType?: "official" | "news";
  fetcher?: typeof fetch;
}): Promise<RawEvidenceCandidate | null> {
  try {
    const response = await (input.fetcher ?? fetch)(input.url, {
      headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) return null;
    return extractEvidenceFromHtml({
      html: await readTextWithLimit(response),
      finalUrl: response.url || input.url,
      providerUrl: input.url,
      sourceTitle: input.sourceTitle,
      fallbackLanguage: input.fallbackLanguage,
      fallbackPublishedAt: input.fallbackPublishedAt,
      sourceType: input.sourceType,
    });
  } catch {
    return null;
  }
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
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
