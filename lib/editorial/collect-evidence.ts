import {
  EvidenceDocumentSchema,
  type DiscoveryProvider,
  type EvidenceDocument,
} from "@/lib/editorial/types";
import { normalizeEvidence } from "@/lib/editorial/normalize-evidence";
import { ExaDiscoveryProvider } from "@/lib/editorial/providers/exa";
import { FixtureDiscoveryProvider } from "@/lib/editorial/providers/fixture";
import { NaverDiscoveryProvider } from "@/lib/editorial/providers/naver";
import { OfficialSourceDiscoveryProvider } from "@/lib/editorial/providers/official-source";
import { scoreEvidenceRelevance } from "@/lib/editorial/relevance";
import type { NewspaperPreset } from "@/lib/presets/schema";
import { isOnKstDate } from "@/lib/time/kst";

export function configuredDiscoveryProviders(): DiscoveryProvider[] {
  if (process.env.DEMO_MODE === "true" || process.env.DISCOVERY_PROVIDER === "fixture") {
    return [new FixtureDiscoveryProvider()];
  }
  return [
    new NaverDiscoveryProvider(),
    new ExaDiscoveryProvider(),
    new OfficialSourceDiscoveryProvider(),
  ];
}

function providerForChannel(providers: DiscoveryProvider[], channel: string) {
  return providers.find((provider) => provider.channels.includes(channel as never));
}

export async function collectPresetEvidence(input: {
  preset: NewspaperPreset;
  sourceDate: string;
  providers?: DiscoveryProvider[];
}) {
  const providers = input.providers ?? configuredDiscoveryProviders();
  const searches = input.preset.discovery.flatMap((route) =>
    route.queries.map((query) => ({ route, query })),
  );
  const results = new Array<{
    route: (typeof searches)[number]["route"];
    query: string;
    provider: DiscoveryProvider;
    raw: Awaited<ReturnType<DiscoveryProvider["search"]>>;
  } | null>(searches.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < searches.length) {
      const index = cursor++;
      const search = searches[index]!;
      const provider = providerForChannel(providers, search.route.channel);
      if (!provider) {
        console.log(JSON.stringify({
          stage: "discovery_route_skipped",
          presetId: input.preset.id,
          routeId: search.route.id,
          reason: "provider-unavailable",
        }));
        continue;
      }
      try {
        results[index] = {
          ...search,
          provider,
          raw: await provider.search({ ...input, ...search }),
        };
      } catch (error) {
        console.log(JSON.stringify({
          stage: "discovery_route_failed",
          presetId: input.preset.id,
          routeId: search.route.id,
          provider: provider.name,
          errorType: error instanceof Error ? error.name : typeof error,
        }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, searches.length) }, () => worker()));

  const byUrl = new Map<string, EvidenceDocument>();
  for (const result of results) {
    if (!result) continue;
    let evidenceCount = 0;
    for (const raw of result.raw) {
      if (!isOnKstDate(raw.publishedAt, input.sourceDate)) continue;
      try {
        const normalized = normalizeEvidence({
          raw,
          preset: input.preset,
          route: result.route,
          query: result.query,
          provider: result.provider.name,
          sourceDate: input.sourceDate,
        });
        const relevance = scoreEvidenceRelevance(input.preset, result.route, EvidenceDocumentSchema.parse(normalized));
        if (!relevance.accepted) continue;
        const evidence = EvidenceDocumentSchema.parse({
          ...normalized,
          category: relevance.sectionId,
          relevanceScore: relevance.score,
        });
        const previous = byUrl.get(evidence.canonicalUrl);
        if (!previous || evidence.relevanceScore > previous.relevanceScore) {
          byUrl.set(evidence.canonicalUrl, evidence);
        }
        evidenceCount += 1;
      } catch (error) {
        console.log(JSON.stringify({
          stage: "evidence_item_rejected",
          presetId: input.preset.id,
          routeId: result.route.id,
          errorType: error instanceof Error ? error.name : typeof error,
        }));
      }
    }
    console.log(JSON.stringify({
      stage: "discovery_route_completed",
      presetId: input.preset.id,
      routeId: result.route.id,
      provider: result.provider.name,
      candidateCount: result.raw.length,
      evidenceCount,
    }));
  }

  return [...byUrl.values()].sort(
    (left, right) => right.relevanceScore - left.relevanceScore || left.id.localeCompare(right.id),
  );
}
