import type { EvidenceDocument } from "@/lib/editorial/types";
import { normalizeEvidenceText } from "@/lib/editorial/normalize-evidence";
import type { DiscoveryRoute, NewspaperPreset } from "@/lib/presets/schema";

function includesTerm(text: string, term: string) {
  return text.includes(normalizeEvidenceText(term));
}

export function scoreEvidenceRelevance(
  preset: NewspaperPreset,
  route: DiscoveryRoute,
  evidence: EvidenceDocument,
) {
  const title = normalizeEvidenceText(evidence.title);
  const excerpt = normalizeEvidenceText(evidence.description);
  const combined = `${title} ${excerpt}`;
  const aliases = preset.aliases.map((alias) => normalizeEvidenceText(alias.value));
  const aliasInTitle = aliases.some((alias) => title.includes(alias));
  const aliasInExcerpt = aliases.some((alias) => excerpt.includes(alias));
  const excluded = route.excludeTerms.some((term) => includesTerm(combined, term));
  const noiseCount = preset.editorial.noiseSignals.filter((term) => includesTerm(combined, term)).length;
  const importantCount = preset.editorial.importantSignals.filter((term) => includesTerm(combined, term)).length;

  const matchingSection = [...preset.sections]
    .map((section) => ({
      section,
      matches: section.relevanceTerms.filter((term) => includesTerm(combined, term)).length,
    }))
    .sort((left, right) =>
      right.matches - left.matches ||
      right.section.priority - left.section.priority ||
      left.section.id.localeCompare(right.section.id),
    )[0];
  const routeSectionMatches = preset.sections
    .find((section) => section.id === route.sectionId)
    ?.relevanceTerms.filter((term) => includesTerm(combined, term)).length ?? 0;

  let score = 0;
  if (aliasInTitle) score += 48;
  else if (aliasInExcerpt) score += 22;
  if (evidence.isOfficial) score += 24;
  score += Math.min(importantCount * 8, 24);
  score += Math.min((matchingSection?.matches ?? 0) * 7, 21);
  if (route.sectionId === matchingSection?.section.id) score += 5;
  score -= Math.min(noiseCount * 28, 56);
  if (excluded) score -= 60;

  return {
    score: Math.max(0, Math.min(100, score)),
    sectionId: routeSectionMatches > 0
      ? route.sectionId
      : matchingSection && matchingSection.matches > 0
        ? matchingSection.section.id
        : route.sectionId,
    accepted: !excluded && score >= preset.editorial.minimumRelevanceScore,
  };
}
