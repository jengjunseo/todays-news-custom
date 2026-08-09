import { z } from "zod";

import { NewsCategorySchema } from "@/lib/news/types";

export const FactStatusSchema = z.enum([
  "confirmed",
  "reported",
  "claim",
  "early-research",
  "outlook",
]);

export const DigestItemSchema = z.object({
  id: z.string().min(1),
  clusterId: z.string().min(1),
  category: NewsCategorySchema,
  rank: z.number().int().min(1).max(2),
  headline: z.string().min(1).max(120),
  oneLine: z.string().min(1).max(180),
  overview: z.string().min(1).max(1200),
  keyPoints: z.array(z.string().min(1).max(240)).min(2).max(3),
  analogy: z.string().min(1).max(500),
  whyItMatters: z.string().min(1).max(800),
  socraticQuestion: z.string().min(1).max(300),
  factStatus: FactStatusSchema,
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(z.string().min(1).max(128)).min(1),
});

export type DigestItem = z.infer<typeof DigestItemSchema>;

export const AiDigestSelectionSchema = z.object({
  items: z
    .array(
      DigestItemSchema.omit({ id: true, category: true, rank: true }).extend({
        clusterId: z.string().min(1),
      }),
    )
    .max(2),
});
