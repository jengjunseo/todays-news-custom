import { createHash } from "node:crypto";

import { z } from "zod";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import { BRAND } from "@/lib/brand";
import { isExternalAiCallError } from "@/lib/ai/structured-generator";
import type { DigestItem } from "@/lib/digest/schemas";
import { kstDateAtTime, nextKstDate } from "@/lib/time/kst";

const PerspectiveTypeSchema = z.enum([
  "trade_off",
  "second_order",
  "counterfactual",
  "stakeholder",
  "assumption",
  "scale",
]);

const BaseNudgeSchema = z.object({
  title: z.string().min(1).max(60),
  notificationBody: z.string().min(1).max(180),
  insightBody: z.string().min(1).max(800),
  question: z.string().min(1).max(300),
  primaryItemId: z.string().min(1),
  sourceIds: z.array(z.string().min(1).max(128)).min(1),
});

export const DailyNudgesOutputSchema = z.object({
  morning: BaseNudgeSchema,
  perspective: BaseNudgeSchema.extend({
    perspectiveType: PerspectiveTypeSchema,
  }),
  evening: BaseNudgeSchema.extend({
    secondaryItemId: z.string().min(1).nullable(),
  }),
});

export const DailyNudgeSchema = BaseNudgeSchema.extend({
  id: z.string().length(24),
  type: z.enum(["morning", "perspective", "evening"]),
  secondaryItemId: z.string().nullable(),
  perspectiveType: PerspectiveTypeSchema.nullable(),
  scheduledFor: z.string().datetime(),
  status: z.enum(["pending", "sent", "skipped", "failed"]),
});

export type DailyNudge = z.infer<typeof DailyNudgeSchema>;

const SCHEDULE = {
  morning: "07:30",
  perspective: "12:40",
  evening: "18:30",
} as const;

const PRESSURE_PATTERNS = [
  /놓치면/u,
  /반드시\s*읽/u,
  /아직\s*안\s*읽/u,
  /뒤처/u,
  /지금\s*당장/u,
  /긴급/u,
  /서둘러/u,
];

function assertCalmLanguage(output: z.infer<typeof DailyNudgesOutputSchema>) {
  const text = JSON.stringify(output);
  if (PRESSURE_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error("강압적이거나 FOMO를 유발하는 문구입니다.");
  }
}

function validateReferences(
  output: z.infer<typeof DailyNudgesOutputSchema>,
  items: DigestItem[],
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const nudge of [output.morning, output.perspective, output.evening]) {
    const primary = itemById.get(nudge.primaryItemId);
    if (!primary) throw new Error("존재하지 않는 item ID입니다.");
    if (nudge.sourceIds.some((sourceId) => !primary.sourceIds.includes(sourceId))) {
      throw new Error("item에 없는 source ID입니다.");
    }
  }
  if (output.evening.secondaryItemId) {
    const secondary = itemById.get(output.evening.secondaryItemId);
    if (!secondary) throw new Error("존재하지 않는 secondary item ID입니다.");
    if (secondary.id === output.evening.primaryItemId) {
      throw new Error("저녁 연결의 두 item은 달라야 합니다.");
    }
  }
}

function withPrimarySourceIds(
  output: z.infer<typeof DailyNudgesOutputSchema>,
  items: DigestItem[],
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sourceIdsFor = (primaryItemId: string) => {
    const primary = itemById.get(primaryItemId);
    if (!primary) throw new Error("존재하지 않는 item ID입니다.");
    return primary.sourceIds.slice(0, 2);
  };

  return {
    morning: {
      ...output.morning,
      sourceIds: sourceIdsFor(output.morning.primaryItemId),
    },
    perspective: {
      ...output.perspective,
      sourceIds: sourceIdsFor(output.perspective.primaryItemId),
    },
    evening: {
      ...output.evening,
      sourceIds: sourceIdsFor(output.evening.primaryItemId),
    },
  };
}

function fixtureOutput(items: DigestItem[]) {
  const primary = items[0]!;
  const secondCategory = items.find((item) => item.category !== primary.category);
  return {
    morning: {
      title: BRAND.name,
      notificationBody: primary.oneLine,
      insightBody: `${primary.headline}. 중요한 건 발표 자체보다 ${primary.whyItMatters}`,
      question: primary.socraticQuestion,
      primaryItemId: primary.id,
      sourceIds: primary.sourceIds.slice(0, 2),
    },
    perspective: {
      title: "점심 생각거리",
      notificationBody: `${primary.headline}의 비용과 이익은 누구에게 다를까요?`,
      insightBody: `${primary.overview} 이 변화가 주는 이익과 감수해야 할 비용을 함께 비교해 볼 필요가 있습니다.`,
      question: primary.socraticQuestion,
      primaryItemId: primary.id,
      sourceIds: primary.sourceIds.slice(0, 2),
      perspectiveType: "trade_off" as const,
    },
    evening: {
      title: "오늘의 연결",
      notificationBody: secondCategory
        ? `${primary.headline}과 ${secondCategory.headline}은 어디에서 만날까요?`
        : `${primary.headline}이 오래 남길 변화는 무엇일까요?`,
      insightBody: secondCategory
        ? `${primary.headline}과 ${secondCategory.headline}은 다른 분야처럼 보이지만, 사람의 선택과 사회의 자원 배분을 함께 바꾼다는 점에서 연결됩니다.`
        : `${primary.headline}의 단기 결과보다 제도와 선택에 남길 장기 영향을 살펴봅니다.`,
      question: secondCategory
        ? "두 변화가 동시에 진행될 때 가장 먼저 생길 병목은 무엇일까요?"
        : primary.socraticQuestion,
      primaryItemId: primary.id,
      secondaryItemId: secondCategory?.id ?? null,
      sourceIds: primary.sourceIds.slice(0, 2),
    },
  };
}

class FixtureNudgeGenerator implements StructuredGenerator {
  constructor(private readonly items: DigestItem[]) {}
  async generate() {
    return fixtureOutput(this.items);
  }
}

function promptFor(items: DigestItem[]) {
  return `아래 전날 뉴스 digest만 사용해 하루치 알림 3개를 한 번에 만드세요.

Morning: 반드시 알아둘 변화 하나를 정보 중심으로 설명합니다.
Perspective: 한 사건을 trade_off, second_order, counterfactual, stakeholder, assumption, scale 중 한 사고법으로 다시 봅니다.
Evening: 가능하면 서로 다른 분야 두 사건을 유의미하게 연결하고, 억지 연결이면 가장 중요한 사건의 장기 함의를 설명합니다.

강압, FOMO, 긴급 표현, 읽지 않았다는 압박을 쓰지 마세요. 아래 item ID와 각 item의 source ID만 참조하세요.

${JSON.stringify(
  items.map((item) => ({
    id: item.id,
    category: item.category,
    headline: item.headline,
    oneLine: item.oneLine,
    overview: item.overview,
    whyItMatters: item.whyItMatters,
    question: item.socraticQuestion,
    sourceIds: item.sourceIds,
  })),
  null,
  2,
)}`;
}

function finalize(
  output: unknown,
  sourceDate: string,
  paperId: string,
  items: DigestItem[],
): DailyNudge[] {
  const parsed = DailyNudgesOutputSchema.parse(output);
  assertCalmLanguage(parsed);
  const resolved = withPrimarySourceIds(parsed, items);
  validateReferences(resolved, items);
  const deliveryDate = nextKstDate(sourceDate);

  return (["morning", "perspective", "evening"] as const).map((type) => {
    const value = resolved[type];
    return DailyNudgeSchema.parse({
      ...value,
      id: createHash("sha256").update(`${paperId}:${sourceDate}:${type}`).digest("hex").slice(0, 24),
      type,
      secondaryItemId: type === "evening" ? resolved.evening.secondaryItemId : null,
      perspectiveType:
        type === "perspective" ? resolved.perspective.perspectiveType : null,
      scheduledFor: kstDateAtTime(deliveryDate, SCHEDULE[type]).toISOString(),
      status: "pending",
    });
  });
}

export async function generateDailyNudges(
  input: { sourceDate: string; paperId?: string; items: DigestItem[] },
  generator?: StructuredGenerator,
) {
  if (input.items.length === 0) throw new Error("nudge를 만들 digest item이 없습니다.");
  const activeGenerator = generator ?? new FixtureNudgeGenerator(input.items);
  const prompt = promptFor(input.items);

  try {
    return finalize(
      await activeGenerator.generate({ schema: DailyNudgesOutputSchema, prompt }),
      input.sourceDate,
      input.paperId ?? "legacy",
      input.items,
    );
  } catch (firstError) {
    if (isExternalAiCallError(firstError)) throw firstError;
    return finalize(
      await activeGenerator.generate({
        schema: DailyNudgesOutputSchema,
        prompt,
        correction: `스키마, item/source grounding, 차분한 문구를 지키세요. 오류: ${firstError instanceof Error ? firstError.message : "invalid response"}`,
      }),
      input.sourceDate,
      input.paperId ?? "legacy",
      input.items,
    );
  }
}
