import { createHash } from "node:crypto";
import { z } from "zod";

import { EvidenceDocumentSchema, type EvidenceDocument } from "@/lib/editorial/types";
import type { NewspaperPreset } from "@/lib/presets/schema";

export const EvidenceClusterSchema = z.object({
  id: z.string().length(24),
  presetId: z.string().min(1),
  category: z.string().min(1),
  targetDate: z.string().date(),
  representativeTitle: z.string().min(1),
  deterministicScore: z.number().min(0).max(100),
  articleCount: z.number().int().positive(),
  sourceCount: z.number().int().positive(),
  queryCount: z.number().int().positive(),
  officialSourceCount: z.number().int().nonnegative(),
  articles: z.array(EvidenceDocumentSchema).min(1),
});

export type EvidenceCluster = z.infer<typeof EvidenceClusterSchema>;

function tokenSet(value: string) {
  return new Set(
    value
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function bigrams(value: string) {
  const compact = value.replace(/[^\p{L}\p{N}]/gu, "");
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.add(compact.slice(index, index + 2));
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function sameEvidenceEvent(left: EvidenceDocument, right: EvidenceDocument) {
  if (
    left.presetId !== right.presetId ||
    left.category !== right.category ||
    left.targetDate !== right.targetDate
  ) return false;
  if (left.canonicalUrl === right.canonicalUrl) return true;
  const tokenScore = jaccard(tokenSet(left.normalizedTitle), tokenSet(right.normalizedTitle));
  const bigramScore = jaccard(bigrams(left.normalizedTitle), bigrams(right.normalizedTitle));
  return tokenScore >= 0.32 || bigramScore >= 0.42 || (tokenScore >= 0.2 && bigramScore >= 0.28);
}

function makeCluster(articles: EvidenceDocument[]): EvidenceCluster {
  const sorted = [...articles].sort((left, right) => left.id.localeCompare(right.id));
  const sourceCount = new Set(sorted.map((article) => article.sourceDomain)).size;
  const queryCount = new Set(sorted.map((article) => article.query)).size;
  const officialSourceCount = sorted.filter((article) => article.isOfficial).length;
  const relevance = sorted.reduce((sum, article) => sum + article.relevanceScore, 0) / sorted.length;
  const deterministicScore = Math.min(
    100,
    Math.round(relevance * 0.62 + Math.min(sourceCount * 12, 24) + Math.min(queryCount * 5, 10) + Math.min(officialSourceCount * 8, 12)),
  );
  const id = createHash("sha256")
    .update(`${sorted[0]!.presetId}:${sorted.map((article) => article.id).join(":")}`)
    .digest("hex")
    .slice(0, 24);
  const representativeTitle = [...sorted].sort(
    (left, right) => right.relevanceScore - left.relevanceScore || left.title.length - right.title.length,
  )[0]!.title;
  return EvidenceClusterSchema.parse({
    id,
    presetId: sorted[0]!.presetId,
    category: sorted[0]!.category,
    targetDate: sorted[0]!.targetDate,
    representativeTitle,
    deterministicScore,
    articleCount: sorted.length,
    sourceCount,
    queryCount,
    officialSourceCount,
    articles: sorted,
  });
}

export function clusterAndRankEvidence(preset: NewspaperPreset, documents: EvidenceDocument[]) {
  const sectionOrder = new Map(preset.sections.map((section, index) => [section.id, index]));
  const groups: EvidenceDocument[][] = [];
  for (const document of [...documents].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = groups.find((candidate) => candidate.every((item) => sameEvidenceEvent(item, document)));
    if (group) group.push(document);
    else groups.push([document]);
  }
  return groups
    .map(makeCluster)
    .sort((left, right) =>
      (sectionOrder.get(left.category) ?? 999) - (sectionOrder.get(right.category) ?? 999) ||
      right.deterministicScore - left.deterministicScore ||
      left.id.localeCompare(right.id),
    );
}

export function topCandidatesBySection(
  preset: NewspaperPreset,
  clusters: EvidenceCluster[],
  limit = 6,
) {
  return Object.fromEntries(
    preset.sections.map((section) => [
      section.id,
      clusters.filter((cluster) => cluster.category === section.id).slice(0, limit),
    ]),
  ) as Record<string, EvidenceCluster[]>;
}
