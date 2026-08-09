import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { isExternalAiCallError } from "@/lib/ai/structured-generator";
import { clusterAndRankEvidence, topCandidatesBySection } from "@/lib/editorial/cluster-evidence";
import { collectPresetEvidence } from "@/lib/editorial/collect-evidence";
import type { DiscoveryProvider } from "@/lib/editorial/types";
import { createFallbackDigestItem, summarizeStory } from "@/lib/digest/summarize-story";
import { generateDailyNudges } from "@/lib/nudges/generate-daily-nudges";
import { DEFAULT_PRESET_ID, getPreset, NEWSPAPER_PRESETS } from "@/lib/presets";
import type { NewspaperPreset } from "@/lib/presets/schema";
import type { NewsProvider } from "@/lib/news/types";
import {
  MemoryDigestPublisher,
  PostgresDigestPublisher,
  type DigestPublisher,
} from "@/lib/pipeline/digest-publisher";
import { previousKstDate } from "@/lib/time/kst";

const demoPublisher = new MemoryDigestPublisher();

export type RunPresetPaperOptions = {
  presetId?: string;
  preset?: NewspaperPreset;
  sourceDate?: string;
  force?: boolean;
  providers?: DiscoveryProvider[];
  /** @deprecated Legacy SOURCE test seam. Preset pipelines use `providers`. */
  provider?: NewsProvider;
  publisher?: DigestPublisher;
  summaryGenerator?: StructuredGenerator;
  nudgeGenerator?: StructuredGenerator;
};

export async function runDailyDigest(options: RunPresetPaperOptions = {}) {
  const preset = options.preset ?? getPreset(options.presetId ?? DEFAULT_PRESET_ID);
  if (!preset) throw new Error(`알 수 없는 preset입니다: ${options.presetId}`);
  return runPresetPaper(preset, options);
}

export async function runPresetPaper(
  preset: NewspaperPreset,
  options: Omit<RunPresetPaperOptions, "preset" | "presetId"> = {},
) {
  const pipelineStartedAt = Date.now();
  const sourceDate = options.sourceDate ?? previousKstDate();
  const logStage = (stage: string, details: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({
      stage,
      presetId: preset.id,
      sourceDate,
      elapsedMs: Date.now() - pipelineStartedAt,
      ...details,
    }));
  };
  logStage("paper_pipeline_started");

  const force = options.force === true;
  const publisher = options.publisher ??
    (process.env.DEMO_MODE === "true" ? demoPublisher : new PostgresDigestPublisher());
  const existing = await publisher.findPublished(preset.id, sourceDate);
  if (existing && !force) {
    logStage("paper_pipeline_completed", { status: "skipped" });
    return {
      status: "skipped" as const,
      reason: "already-published",
      digestId: existing.id,
      presetId: preset.id,
      sourceDate,
    };
  }

  const runKey = force
    ? `paper:${preset.id}:${sourceDate}:force:${crypto.randomUUID()}`
    : `paper:${preset.id}:${sourceDate}:v1`;
  await publisher.startRun(runKey, preset.id, sourceDate);
  try {
    logStage("discovery_started", { runKey });
    const evidence = await collectPresetEvidence({
      preset,
      sourceDate,
      providers: options.providers,
    });
    logStage("discovery_completed", { runKey, evidenceCount: evidence.length });

    const clusters = clusterAndRankEvidence(preset, evidence);
    const candidates = topCandidatesBySection(preset, clusters);
    logStage("evidence_cluster_rank_completed", { runKey, clusterCount: clusters.length });

    const summaryResults = await Promise.allSettled(
      preset.sections.map((section) => summarizeStory(
        section.id,
        candidates[section.id] ?? [],
        options.summaryGenerator,
        { preset, sectionLabel: section.label },
      )),
    );
    const primaryItems: Awaited<ReturnType<typeof summarizeStory>> = [];
    const extraItems: Array<{ item: Awaited<ReturnType<typeof summarizeStory>>[number]; score: number; sectionIndex: number }> = [];

    preset.sections.forEach((section, index) => {
      const sectionCandidates = candidates[section.id] ?? [];
      if (sectionCandidates.length === 0) return;
      const result = summaryResults[index]!;
      if (result.status === "fulfilled" && result.value.length > 0) {
        primaryItems.push(result.value[0]!);
        const extra = result.value[1];
        if (extra) {
          extraItems.push({
            item: extra,
            score: sectionCandidates.find((cluster) => cluster.id === extra.clusterId)?.deterministicScore ?? 0,
            sectionIndex: index,
          });
        }
        return;
      }
      const fallback = createFallbackDigestItem(
        section.id,
        sectionCandidates[0]!,
        { preset, sectionLabel: section.label },
      );
      logStage("section_summary_fallback", {
        runKey,
        sectionId: section.id,
        reason: result.status === "fulfilled" ? "empty-ai-result" : fallbackReason(result.reason),
        clusterId: fallback.clusterId,
      });
      primaryItems.push(fallback);
    });

    extraItems.sort((left, right) =>
      right.score - left.score || left.sectionIndex - right.sectionIndex || left.item.id.localeCompare(right.item.id),
    );
    const remaining = Math.max(0, preset.editorial.desiredItemCount - primaryItems.length);
    const items = [...primaryItems, ...extraItems.slice(0, remaining).map(({ item }) => item)]
      .slice(0, preset.editorial.desiredItemCount);
    if (items.length === 0) {
      throw new Error(`${preset.displayName} 면을 발행할 grounded evidence가 없습니다.`);
    }

    const nudges = await generateDailyNudges({ sourceDate, paperId: preset.id, items }, options.nudgeGenerator);
    const publishedClusterIds = new Set(items.map((item) => item.clusterId));
    const publishedClusters = clusters.filter((cluster) => publishedClusterIds.has(cluster.id));
    const publishedEvidence = [...new Map(
      publishedClusters.flatMap((cluster) => cluster.articles).map((document) => [document.id, document]),
    ).values()];
    const readingMinutes = Math.max(2, Math.ceil(items.length * 0.9));
    const digest = await publisher.publish({
      preset,
      sourceDate,
      articles: publishedEvidence,
      clusters: publishedClusters,
      items,
      nudges,
      readingMinutes,
    });
    const metrics = {
      evidenceCount: evidence.length,
      clusterCount: clusters.length,
      itemCount: items.length,
      nudgeCount: nudges.length,
    };
    await publisher.completeRun(runKey, metrics);
    logStage("paper_pipeline_completed", { runKey, status: "published", ...metrics });
    return { status: "published" as const, digestId: digest.id, presetId: preset.id, sourceDate, metrics };
  } catch (error) {
    logStage("paper_pipeline_failed", { runKey, errorType: error instanceof Error ? error.name : typeof error });
    await publisher.failRun(runKey, error instanceof Error ? error.message : "unknown pipeline error");
    throw error;
  }
}

export async function runAllPresetPapers(options: Omit<RunPresetPaperOptions, "preset" | "presetId"> = {}) {
  const results = await Promise.allSettled(
    NEWSPAPER_PRESETS.map((preset) => runPresetPaper(preset, options)),
  );
  return NEWSPAPER_PRESETS.map((preset, index) => {
    const result = results[index]!;
    return result.status === "fulfilled"
      ? result.value
      : { status: "failed" as const, presetId: preset.id, error: result.reason instanceof Error ? result.reason.message : "unknown error" };
  });
}

function fallbackReason(error: unknown) {
  if (error instanceof Error && (error.name === "TimeoutError" || /timeout|operation (?:was )?aborted/i.test(error.message))) {
    return "timeout";
  }
  return isExternalAiCallError(error) ? "external-error" : "invalid-output";
}
