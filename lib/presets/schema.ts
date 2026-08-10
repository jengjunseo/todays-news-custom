import { z } from "zod";

export const PresetIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const EditorialSectionSchema = z.object({
  id: PresetIdSchema,
  label: z.string().min(1).max(40),
  priority: z.number().int().min(1).max(10),
  relevanceTerms: z.array(z.string().min(1)).min(1),
});

export const DiscoveryRouteSchema = z.object({
  id: PresetIdSchema,
  channel: z.enum(["news-search", "web-search", "official-feed"]),
  sectionId: PresetIdSchema,
  intent: z.string().min(1).max(240),
  queries: z.array(z.string().min(1)).min(1),
  locales: z.array(z.string().min(2)).min(1),
  excludeTerms: z.array(z.string().min(1)).default([]),
  sourceUrls: z.array(z.string().url()).max(8).default([]),
}).superRefine((route, context) => {
  if (route.channel === "official-feed" && route.sourceUrls.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["sourceUrls"],
      message: "official-feed routes require at least one direct source URL",
    });
  }
  if (route.channel !== "official-feed" && route.sourceUrls.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["sourceUrls"],
      message: "sourceUrls are only valid for official-feed routes",
    });
  }
});

export const NewspaperPresetSchema = z
  .object({
    id: PresetIdSchema,
    displayName: z.string().min(1).max(80),
    description: z.string().min(1).max(240),
    aliases: z
      .array(
        z.object({
          value: z.string().min(1),
          language: z.string().min(2),
        }),
      )
      .min(1),
    subjectIdentity: z.object({
      associatedAliases: z.array(
        z.object({
          value: z.string().min(2),
          language: z.string().min(2),
        }),
      ).default([]),
    }).optional(),
    officialDomains: z.array(z.string().min(1)),
    sections: z.array(EditorialSectionSchema).min(2).max(10),
    discovery: z.array(DiscoveryRouteSchema).min(1),
    editorial: z.object({
      importantSignals: z.array(z.string().min(1)).min(1),
      noiseSignals: z.array(z.string().min(1)),
      desiredItemCount: z.number().int().min(1).max(10),
      allowFiller: z.boolean(),
      minimumRelevanceScore: z.number().min(0).max(100),
    }),
    explanation: z.object({
      readerContext: z.string().min(1).max(600),
      usefulWhy: z.string().min(1).max(600),
      avoidInference: z.array(z.string().min(1)).min(1),
    }),
  })
  .superRefine((preset, context) => {
    const sectionIds = new Set<string>();
    for (const section of preset.sections) {
      if (sectionIds.has(section.id)) {
        context.addIssue({ code: "custom", message: `duplicate section id: ${section.id}` });
      }
      sectionIds.add(section.id);
    }
    const routeIds = new Set<string>();
    for (const route of preset.discovery) {
      if (routeIds.has(route.id)) {
        context.addIssue({ code: "custom", message: `duplicate route id: ${route.id}` });
      }
      routeIds.add(route.id);
      if (!sectionIds.has(route.sectionId)) {
        context.addIssue({
          code: "custom",
          message: `route ${route.id} references unknown section ${route.sectionId}`,
        });
      }
      for (const sourceUrl of route.sourceUrls) {
        const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
        const allowed = preset.officialDomains.some((domain) =>
          hostname === domain || hostname.endsWith(`.${domain}`),
        );
        if (!allowed) {
          context.addIssue({
            code: "custom",
            message: `route ${route.id} source URL is outside officialDomains: ${hostname}`,
          });
        }
      }
    }
  });

export type NewspaperPreset = z.infer<typeof NewspaperPresetSchema>;
export type EditorialSection = z.infer<typeof EditorialSectionSchema>;
export type DiscoveryRoute = z.infer<typeof DiscoveryRouteSchema>;

export function definePreset(input: z.input<typeof NewspaperPresetSchema>) {
  return NewspaperPresetSchema.parse(input);
}
