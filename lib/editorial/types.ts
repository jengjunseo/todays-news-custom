import { z } from "zod";

import type { DiscoveryRoute, NewspaperPreset } from "@/lib/presets/schema";

export const SourceTypeSchema = z.enum([
  "official",
  "news",
  "press-release",
  "interview",
  "rss",
]);

export const RawEvidenceCandidateSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string(),
  url: z.string().url(),
  providerUrl: z.string().url().optional(),
  publisher: z.string().min(1).optional(),
  publishedAt: z.coerce.date(),
  language: z.string().min(2),
  sourceType: SourceTypeSchema,
});

export type RawEvidenceCandidate = z.infer<typeof RawEvidenceCandidateSchema>;

export const EvidenceDocumentSchema = z.object({
  id: z.string().length(32),
  presetId: z.string().min(1),
  routeId: z.string().min(1),
  provider: z.string().min(1),
  category: z.string().min(1),
  query: z.string().min(1),
  title: z.string().min(1),
  normalizedTitle: z.string().min(1),
  description: z.string(),
  canonicalUrl: z.string().url(),
  providerUrl: z.string().url(),
  publisher: z.string().min(1),
  sourceDomain: z.string().min(1),
  publishedAt: z.string().datetime(),
  targetDate: z.string().date(),
  language: z.string().min(2),
  sourceType: SourceTypeSchema,
  isOfficial: z.boolean(),
  relevanceScore: z.number().min(0).max(100),
});

export type EvidenceDocument = z.infer<typeof EvidenceDocumentSchema>;

export interface DiscoveryProvider {
  readonly name: string;
  readonly channels: readonly DiscoveryRoute["channel"][];
  search(input: {
    preset: NewspaperPreset;
    route: DiscoveryRoute;
    query: string;
    sourceDate: string;
  }): Promise<RawEvidenceCandidate[]>;
}
