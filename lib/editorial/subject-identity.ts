import { normalizeEvidenceText } from "@/lib/editorial/normalize-evidence";
import type { RawEvidenceCandidate } from "@/lib/editorial/types";
import type { DiscoveryRoute, NewspaperPreset } from "@/lib/presets/schema";

export type SubjectIdentityDecision = {
  accepted: boolean;
  proof:
    | "not-required"
    | "official-source"
    | "primary-title"
    | "primary-lead"
    | "associated-title"
    | "associated-lead"
    | "missing-subject";
};

function containsIdentity(value: string | undefined, identities: string[]) {
  if (!value) return false;
  const normalized = normalizeEvidenceText(value);
  return identities.some((identity) => normalized.includes(identity));
}

function normalizedIdentities(values: Array<{ value: string }>) {
  return values.map((identity) => normalizeEvidenceText(identity.value)).filter(Boolean);
}

function matchesOfficialDomain(value: string, domains: string[]) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function hasTitleSubjectIdentity(preset: NewspaperPreset, title: string) {
  if (!preset.subjectIdentity) return true;
  return containsIdentity(title, [
    ...normalizedIdentities(preset.aliases),
    ...normalizedIdentities(preset.subjectIdentity.associatedAliases),
  ]);
}

export function evaluateSubjectIdentity(input: {
  candidate: RawEvidenceCandidate;
  preset: NewspaperPreset;
  route: DiscoveryRoute;
  provider: string;
}): SubjectIdentityDecision {
  if (!input.preset.subjectIdentity) return { accepted: true, proof: "not-required" };

  const trustedOfficial =
    input.route.channel === "official-feed" &&
    input.provider === "official-source" &&
    input.candidate.sourceType === "official" &&
    matchesOfficialDomain(input.candidate.url, input.preset.officialDomains);
  if (trustedOfficial) return { accepted: true, proof: "official-source" };

  const primary = normalizedIdentities(input.preset.aliases);
  const associated = normalizedIdentities(input.preset.subjectIdentity.associatedAliases);
  if (containsIdentity(input.candidate.title, primary)) return { accepted: true, proof: "primary-title" };
  if (containsIdentity(input.candidate.identityLead, primary)) return { accepted: true, proof: "primary-lead" };
  if (containsIdentity(input.candidate.title, associated)) return { accepted: true, proof: "associated-title" };
  if (containsIdentity(input.candidate.identityLead, associated)) return { accepted: true, proof: "associated-lead" };
  return { accepted: false, proof: "missing-subject" };
}
