import { createHash } from "node:crypto";

import type { RawEvidenceCandidate } from "@/lib/editorial/types";
import type { DiscoveryRoute, NewspaperPreset } from "@/lib/presets/schema";

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

export function cleanEvidenceText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return HTML_ENTITIES[entity.toLowerCase()] ?? match;
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const number = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEvidenceText(value: string) {
  return cleanEvidenceText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeEvidenceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("지원하지 않는 evidence URL입니다.");
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (TRACKING_PARAMETERS.has(normalized) || normalized.startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

function matchesDomain(hostname: string, domains: string[]) {
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function normalizeEvidence(input: {
  raw: RawEvidenceCandidate;
  preset: NewspaperPreset;
  route: DiscoveryRoute;
  query: string;
  provider: string;
  sourceDate: string;
}) {
  const canonicalUrl = canonicalizeEvidenceUrl(input.raw.url);
  const providerUrl = canonicalizeEvidenceUrl(input.raw.providerUrl ?? input.raw.url);
  const sourceDomain = new URL(canonicalUrl).hostname;
  const title = cleanEvidenceText(input.raw.title);
  const isOfficial =
    input.raw.sourceType === "official" ||
    matchesDomain(sourceDomain, input.preset.officialDomains);

  return {
    id: createHash("sha256")
      .update(`${input.preset.id}:${canonicalUrl}`)
      .digest("hex")
      .slice(0, 32),
    presetId: input.preset.id,
    routeId: input.route.id,
    provider: input.provider,
    category: input.route.sectionId,
    query: input.query,
    title,
    normalizedTitle: normalizeEvidenceText(title),
    description: cleanEvidenceText(input.raw.excerpt),
    canonicalUrl,
    providerUrl,
    publisher: cleanEvidenceText(input.raw.publisher ?? sourceDomain),
    sourceDomain,
    publishedAt: input.raw.publishedAt.toISOString(),
    targetDate: input.sourceDate,
    language: input.raw.language,
    sourceType: isOfficial ? ("official" as const) : input.raw.sourceType,
    isOfficial,
    relevanceScore: 0,
  };
}
