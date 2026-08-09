import { z } from "zod";

export const NEWS_CATEGORIES = [
  "politics",
  "society",
  "science",
  "technology",
  "economy",
] as const;

// Kept as the reader/editorial section field for compatibility with the Stable
// card contract. Presets, rather than this module, now define the valid values.
export const NewsCategorySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type NewsCategory = z.infer<typeof NewsCategorySchema>;

export const RawNewsArticleSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  originalLink: z.string().url(),
  providerLink: z.string().url(),
  publishedAt: z.coerce.date(),
});

export type RawNewsArticle = z.infer<typeof RawNewsArticleSchema>;

export const SourceArticleSchema = z.object({
  id: z.string().length(32),
  provider: z.string().min(1),
  category: NewsCategorySchema,
  query: z.string().min(1),
  title: z.string().min(1),
  normalizedTitle: z.string().min(1),
  description: z.string(),
  canonicalUrl: z.string().url(),
  providerUrl: z.string().url(),
  sourceDomain: z.string().min(1),
  publishedAt: z.string().datetime(),
  targetDate: z.string().date(),
});

export type SourceArticle = z.infer<typeof SourceArticleSchema>;

export interface NewsProvider {
  readonly name: string;
  search(input: {
    query: string;
    category: NewsCategory;
    sourceDate: string;
  }): Promise<RawNewsArticle[]>;
}
