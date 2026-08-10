import { cleanEvidenceText } from "@/lib/editorial/normalize-evidence";
import { type DiscoveryProvider, type RawEvidenceCandidate } from "@/lib/editorial/types";
import {
  fetchHtmlEvidence,
  mapWithConcurrency,
  parsePublishedAt,
  readTextWithLimit,
} from "@/lib/editorial/providers/html-evidence";
import { isOnKstDate } from "@/lib/time/kst";

const MAX_SOURCE_URLS = 8;
const MAX_DETAIL_PAGES = 8;

type SearchInput = Parameters<DiscoveryProvider["search"]>[0];
type ListingItem = { url: string; title: string; publishedAt: Date };

function attributes(tag: string) {
  const result = new Map<string, string>();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    result.set(match[1]!.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function hostAllowed(url: URL, domains: string[]) {
  return domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

export function extractOfficialListing(input: {
  html: string;
  baseUrl: string;
  officialDomains: string[];
}) {
  const items: ListingItem[] = [];
  for (const match of input.html.matchAll(/<li\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const item = match[1] ?? "";
    const anchor = item.match(/<a\b[^>]*>/i)?.[0];
    const href = anchor ? attributes(anchor).get("href") : undefined;
    const timeText = cleanEvidenceText(item.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1] ?? "");
    const title = cleanEvidenceText(
      item.match(/<[^>]*class=["'][^"']*\bttl\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? "",
    );
    const publishedAt = parsePublishedAt(timeText);
    if (!href || !title || !publishedAt) continue;
    try {
      const url = new URL(href, input.baseUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && hostAllowed(url, input.officialDomains)) {
        items.push({ url: url.toString(), title, publishedAt });
      }
    } catch {
      continue;
    }
  }
  return items;
}

async function fetchListing(url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Official source failed (${response.status})`);
  return { html: await readTextWithLimit(response), finalUrl: response.url || url };
}

export class OfficialSourceDiscoveryProvider implements DiscoveryProvider {
  readonly name = "official-source";
  readonly channels = ["official-feed"] as const;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async search(input: SearchInput) {
    const sources = input.route.sourceUrls.slice(0, MAX_SOURCE_URLS);
    if (sources.length === 0) throw new Error("official-feed route has no sourceUrls");
    const listingResults = await mapWithConcurrency(sources, 2, async (sourceUrl) => {
      try {
        const listing = await fetchListing(sourceUrl, this.fetcher);
        return extractOfficialListing({
          html: listing.html,
          baseUrl: listing.finalUrl,
          officialDomains: input.preset.officialDomains,
        });
      } catch (error) {
        console.log(JSON.stringify({
          stage: "official_source_failed",
          presetId: input.preset.id,
          routeId: input.route.id,
          provider: this.name,
          errorType: error instanceof Error ? error.name : typeof error,
        }));
        return [];
      }
    });
    const datedItems = listingResults
      .flat()
      .filter((item) => isOnKstDate(item.publishedAt, input.sourceDate))
      .slice(0, MAX_DETAIL_PAGES);
    const candidates = await mapWithConcurrency(datedItems, 2, (item) => fetchHtmlEvidence({
      url: item.url,
      sourceTitle: item.title,
      fallbackLanguage: input.route.locales[0]?.split("-")[0] ?? "und",
      fallbackPublishedAt: item.publishedAt,
      sourceType: "official",
      fetcher: this.fetcher,
    }));
    return candidates.filter((candidate): candidate is RawEvidenceCandidate => candidate !== null);
  }
}
