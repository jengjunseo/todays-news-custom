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
  const morningItem = items[0]!;
  const perspectiveItem = items.find((item) => item.id !== morningItem.id) ?? morningItem;
  const eveningItem = items.find(
    (item) => item.id !== morningItem.id && item.id !== perspectiveItem.id,
  ) ?? morningItem;
  return {
    morning: {
      title: BRAND.name,
      notificationBody: morningItem.oneLine,
      insightBody: morningItem.overview,
      question: morningItem.socraticQuestion,
      primaryItemId: morningItem.id,
      sourceIds: morningItem.sourceIds.slice(0, 2),
    },
    perspective: {
      title: "점심 생각거리",
      notificationBody: perspectiveItem.headline,
      insightBody: perspectiveItem.whyItMatters,
      question: perspectiveItem.socraticQuestion,
      primaryItemId: perspectiveItem.id,
      sourceIds: perspectiveItem.sourceIds.slice(0, 2),
      perspectiveType: "stakeholder" as const,
    },
    evening: {
      title: "오늘의 연결",
      notificationBody: eveningItem.headline,
      insightBody: eveningItem.whyItMatters,
      question: eveningItem.socraticQuestion,
      primaryItemId: eveningItem.id,
      secondaryItemId: null,
      sourceIds: eveningItem.sourceIds.slice(0, 2),
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
Perspective: Morning과 다른 중요한 사건을 우선하고, 사고법은 내부에서만 선택해 사건에 구체적인 자연스러운 문장으로 씁니다.
Evening: 실제 근거로 설명할 수 있을 때만 두 사건을 연결합니다. 억지 연결이라면 아직 다루지 않은 사건 하나의 구체적인 다음 변화를 설명합니다.

여러 item이 있으면 Morning과 Perspective의 primaryItemId를 다르게 고르세요. 세 알림이 같은 질문이나 문장을 반복하지 않게 하세요. trade-off, stakeholder 같은 사고법 이름이나 "비용과 이익은 누구에게 다를까요?" 같은 범용 질문 틀을 사용자 문장에 노출하지 마세요.

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
