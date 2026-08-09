import { createHash } from "node:crypto";

import type { NewsCategory, RawNewsArticle, SourceArticle } from "@/lib/news/types";

const LEADING_LABEL = /^\s*(?:\[(?:속보|단독|종합|인터뷰|팩트체크)\]\s*)+/u;
const TRACKING_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
  "tracking",
]);

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function cleanNewsText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(LEADING_LABEL, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTitle(value: string) {
  return cleanNewsText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("지원하지 않는 기사 URL입니다.");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

export function normalizeRawArticle(input: {
  raw: RawNewsArticle;
  provider: string;
  category: NewsCategory;
  query: string;
  sourceDate: string;
}): SourceArticle {
  const canonicalUrl = canonicalizeUrl(input.raw.originalLink || input.raw.providerLink);
  const title = cleanNewsText(input.raw.title);
  return {
    id: createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 32),
    provider: input.provider,
    category: input.category,
    query: input.query,
    title,
    normalizedTitle: normalizeTitle(title),
    description: cleanNewsText(input.raw.description),
    canonicalUrl,
    providerUrl: canonicalizeUrl(input.raw.providerLink),
    sourceDomain: new URL(canonicalUrl).hostname,
    publishedAt: input.raw.publishedAt.toISOString(),
    targetDate: input.sourceDate,
  };
}
