import { cache } from "react";
import { z } from "zod";

import { isDemoMode } from "@/lib/config/mode";
import { getPostgres } from "@/lib/db/postgres";
import { getDemoDigest, type DigestItemWithSources } from "@/lib/demo/digest";
import { DigestItemSchema } from "@/lib/digest/schemas";
import { DEFAULT_PRESET_ID, getPreset } from "@/lib/presets";

type DigestHeader = {
  id: string;
  presetId: string;
  presetName: string;
  sourceDate: string;
  itemCount: number;
  readingMinutes: number;
  generatedAt: string;
};

export type DigestForView = DigestHeader & {
  status: "published";
  items: DigestItemWithSources[];
};

const CurrentInsightNudgeViewSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["morning", "perspective", "evening"]),
  title: z.string().min(1),
  insightBody: z.string().min(1),
  question: z.string().min(1),
});

export type CurrentInsightNudgeView = z.infer<typeof CurrentInsightNudgeViewSchema>;

function logReadTiming(stage: string, startedAt: number, rowCount: number, presetId: string) {
  console.log(JSON.stringify({ stage, presetId, elapsedMs: Date.now() - startedAt, rowCount }));
}

function demoForView(demo: Awaited<ReturnType<typeof getDemoDigest>>): DigestForView {
  return {
    id: demo.id,
    presetId: demo.presetId,
    presetName: demo.presetName,
    sourceDate: demo.sourceDate,
    status: demo.status,
    itemCount: demo.itemCount,
    readingMinutes: demo.readingMinutes,
    generatedAt: demo.generatedAt,
    items: demo.items,
  };
}

async function readDigestItems(
  digest: DigestHeader,
  stagePrefix: "current_digest" | "archive_digest",
): Promise<DigestForView> {
  const sql = getPostgres();
  const itemsStartedAt = Date.now();
  const itemRows = await sql<Array<Record<string, unknown>>>`
    select id, cluster_id as "clusterId", section_id as category, rank, headline,
      one_line as "oneLine", overview, key_points_json as "keyPoints", analogy,
      why_it_matters as "whyItMatters", socratic_question as "socraticQuestion",
      fact_status as "factStatus", confidence::float8, source_ids_json as "sourceIds"
    from digest_items where digest_id = ${digest.id}
    order by rank, id
  `;
  logReadTiming(`${stagePrefix}_items_ms`, itemsStartedAt, itemRows.length, digest.presetId);

  const preset = getPreset(digest.presetId);
  const sectionOrder = new Map(preset?.sections.map((section, index) => [section.id, index]) ?? []);
  const parsedItems = itemRows
    .map((row) => DigestItemSchema.parse(row))
    .sort((left, right) =>
      (sectionOrder.get(left.category) ?? 999) - (sectionOrder.get(right.category) ?? 999) ||
      left.rank - right.rank ||
      left.id.localeCompare(right.id),
    );
  const sourceIds = [...new Set(parsedItems.flatMap((item) => item.sourceIds))];
  const sourcesStartedAt = Date.now();
  const sourceRows = sourceIds.length
    ? await sql<Array<{
        id: string;
        title: string;
        sourceDomain: string;
        canonicalUrl: string;
        publisher: string;
        sourceType: string;
        isOfficial: boolean;
      }>>`
        select id, title, source_domain as "sourceDomain", canonical_url as "canonicalUrl",
          publisher, source_type as "sourceType", is_official as "isOfficial"
        from source_articles where id in ${sql(sourceIds)}
      `
    : [];
  logReadTiming(`${stagePrefix}_sources_ms`, sourcesStartedAt, sourceRows.length, digest.presetId);

  const sourceById = new Map(sourceRows.map((source) => [source.id, source]));
  const items: DigestItemWithSources[] = parsedItems.map((item) => ({
    ...item,
    sources: item.sourceIds.flatMap((id) => {
      const source = sourceById.get(id);
      return source
        ? [{
            id,
            title: source.title,
            domain: source.sourceDomain,
            publisher: source.publisher,
            sourceType: source.sourceType,
            isOfficial: source.isOfficial,
            url: source.canonicalUrl,
          }]
        : [];
    }),
  }));
  return { ...digest, status: "published", items };
}

export const getCurrentDigest = cache(async (presetId = DEFAULT_PRESET_ID): Promise<DigestForView | null> => {
  const totalStartedAt = Date.now();
  if (!getPreset(presetId)) return null;
  if (isDemoMode()) {
    const demo = await getDemoDigest(presetId);
    if (!demo) return null;
    const digest = demoForView(demo);
    logReadTiming("current_digest_total_ms", totalStartedAt, digest.items.length, presetId);
    return digest;
  }

  const sql = getPostgres();
  const headerStartedAt = Date.now();
  const digests = await sql<DigestHeader[]>`
    select id::text, preset_id as "presetId", preset_name as "presetName",
      source_date::text as "sourceDate", item_count as "itemCount",
      reading_minutes as "readingMinutes", generated_at::text as "generatedAt"
    from daily_digests
    where preset_id = ${presetId} and status = 'published'
    order by source_date desc limit 1
  `;
  logReadTiming("current_digest_header_ms", headerStartedAt, digests.length, presetId);
  const digest = digests[0];
  if (!digest) {
    logReadTiming("current_digest_total_ms", totalStartedAt, 0, presetId);
    return null;
  }
  const result = await readDigestItems(digest, "current_digest");
  logReadTiming("current_digest_total_ms", totalStartedAt, result.items.length, presetId);
  return result;
});

export const getCurrentInsightDigest = cache(async (presetId = DEFAULT_PRESET_ID) => {
  const totalStartedAt = Date.now();
  if (!getPreset(presetId)) return null;
  if (isDemoMode()) {
    const digest = await getDemoDigest(presetId);
    if (!digest) return null;
    const nudges = digest.nudges.map((nudge) => CurrentInsightNudgeViewSchema.parse(nudge));
    logReadTiming("insights_total_ms", totalStartedAt, nudges.length, presetId);
    return { id: digest.id, presetId, presetName: digest.presetName, sourceDate: digest.sourceDate, nudges };
  }

  const sql = getPostgres();
  const headerStartedAt = Date.now();
  const digests = await sql<Array<Pick<DigestHeader, "id" | "presetId" | "presetName" | "sourceDate">>>`
    select id::text, preset_id as "presetId", preset_name as "presetName", source_date::text as "sourceDate"
    from daily_digests where preset_id = ${presetId} and status = 'published'
    order by source_date desc limit 1
  `;
  logReadTiming("insights_digest_header_ms", headerStartedAt, digests.length, presetId);
  const digest = digests[0];
  if (!digest) return null;
  const nudgesStartedAt = Date.now();
  const rows = await sql<Array<Record<string, unknown>>>`
    select id, type, title, insight_body as "insightBody", question
    from daily_nudges where digest_id = ${digest.id} order by scheduled_for
  `;
  const nudges = rows.map((row) => CurrentInsightNudgeViewSchema.parse(row));
  logReadTiming("insights_nudges_ms", nudgesStartedAt, nudges.length, presetId);
  logReadTiming("insights_total_ms", totalStartedAt, nudges.length, presetId);
  return { ...digest, nudges };
});

export const getPublishedDigestBySourceDate = cache(
  async (presetIdOrSourceDate: string, maybeSourceDate?: string): Promise<DigestForView | null> => {
    const presetId = maybeSourceDate ? presetIdOrSourceDate : DEFAULT_PRESET_ID;
    const sourceDate = maybeSourceDate ?? presetIdOrSourceDate;
    const totalStartedAt = Date.now();
    if (!getPreset(presetId)) return null;
    if (isDemoMode()) {
      const demo = await getDemoDigest(presetId);
      if (!demo || demo.sourceDate !== sourceDate) return null;
      const digest = demoForView(demo);
      logReadTiming("archive_digest_total_ms", totalStartedAt, digest.items.length, presetId);
      return digest;
    }
    const sql = getPostgres();
    const headerStartedAt = Date.now();
    const digests = await sql<DigestHeader[]>`
      select id::text, preset_id as "presetId", preset_name as "presetName",
        source_date::text as "sourceDate", item_count as "itemCount",
        reading_minutes as "readingMinutes", generated_at::text as "generatedAt"
      from daily_digests
      where preset_id = ${presetId} and status = 'published' and source_date = ${sourceDate}
      limit 1
    `;
    logReadTiming("archive_digest_header_ms", headerStartedAt, digests.length, presetId);
    const digest = digests[0];
    if (!digest) return null;
    const result = await readDigestItems(digest, "archive_digest");
    logReadTiming("archive_digest_total_ms", totalStartedAt, result.items.length, presetId);
    return result;
  },
);

export async function listPublishedDigests(presetId = DEFAULT_PRESET_ID) {
  const startedAt = Date.now();
  if (!getPreset(presetId)) return [];
  if (isDemoMode()) {
    const digest = await getDemoDigest(presetId);
    logReadTiming("archive_list_total_ms", startedAt, digest ? 1 : 0, presetId);
    return digest ? [digest] : [];
  }
  const sql = getPostgres();
  const digests = await sql<Array<{
    id: string;
    presetId: string;
    presetName: string;
    sourceDate: string;
    itemCount: number;
    readingMinutes: number;
  }>>`
    select id::text, preset_id as "presetId", preset_name as "presetName",
      source_date::text as "sourceDate", item_count as "itemCount",
      reading_minutes as "readingMinutes"
    from daily_digests
    where preset_id = ${presetId} and status = 'published'
    order by source_date desc
  `;
  logReadTiming("archive_list_total_ms", startedAt, digests.length, presetId);
  return digests;
}
