import { createHash } from "node:crypto";
import { APICallError } from "ai";

import type { StructuredGenerator } from "@/lib/ai/structured-generator";
import {
  AiSdkStructuredGenerator,
  isExternalAiCallError,
} from "@/lib/ai/structured-generator";
import {
  AiDigestSelectionSchema,
  DigestItemSchema,
  type DigestItem,
} from "@/lib/digest/schemas";
import type { StoryCluster } from "@/lib/news/cluster";
import type { NewsCategory } from "@/lib/news/types";
import type { EvidenceCluster } from "@/lib/editorial/cluster-evidence";
import type { NewspaperPreset } from "@/lib/presets/schema";

const CATEGORY_LABEL: Record<NewsCategory, string> = {
  politics: "정치",
  society: "사회",
  science: "과학",
  technology: "IT·정보",
  economy: "경제",
};

export type PresetEditorialContext = {
  preset: NewspaperPreset;
  sectionLabel: string;
};

type SummarizableCluster = StoryCluster | EvidenceCluster;

function categoryLabel(category: NewsCategory, context?: PresetEditorialContext) {
  return context?.sectionLabel ?? CATEGORY_LABEL[category] ?? category;
}

function truncatedLogText(value: unknown, limit: number) {
  if (value == null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.slice(0, limit);
}

function aiErrorLogDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorType: typeof error };
  const details: Record<string, unknown> = {
    errorName: error.name,
    errorMessage: truncatedLogText(error.message, 300),
  };
  if (APICallError.isInstance(error)) {
    details.statusCode = error.statusCode;
    const responseBody = truncatedLogText(error.responseBody, 500);
    if (responseBody) details.responseBody = responseBody;
  }
  return details;
}

type GroundedSource = {
  id: string;
  articleId: string;
  clusterId: string;
  title: string;
  description: string;
  url: string;
  domain: string;
  publishedAt: string;
};

function groundedSources(candidates: SummarizableCluster[]) {
  let index = 0;
  return candidates.flatMap((cluster) =>
    selectPromptArticles(cluster).map((article): GroundedSource => ({
      id: `S${++index}`,
      articleId: article.id,
      clusterId: cluster.id,
      title: article.title,
      description: article.description,
      url: article.canonicalUrl,
      domain: article.sourceDomain,
      publishedAt: article.publishedAt,
    })),
  );
}

function selectPromptArticles(cluster: SummarizableCluster) {
  const articles = [...cluster.articles].sort((left, right) => left.id.localeCompare(right.id));
  const selected = [];
  const selectedIds = new Set<string>();
  const domains = new Set<string>();

  for (const article of articles) {
    if (domains.has(article.sourceDomain)) continue;
    selected.push(article);
    selectedIds.add(article.id);
    domains.add(article.sourceDomain);
    if (selected.length === 3) return selected;
  }
  for (const article of articles) {
    if (selectedIds.has(article.id)) continue;
    selected.push(article);
    if (selected.length === 3) break;
  }
  return selected;
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function textKey(value: string) {
  return normalizedText(value).toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]/gu, "");
}

function hasBalancedQuotes(value: string) {
  const pairs = [
    ["“", "”"],
    ["‘", "’"],
    ["「", "」"],
    ["『", "』"],
  ] as const;
  return (
    (value.match(/"/g)?.length ?? 0) % 2 === 0 &&
    pairs.every(
      ([open, close]) => value.split(open).length === value.split(close).length,
    )
  );
}

function isCompleteSourceText(value: string) {
  return (
    !value.includes("...") &&
    !value.includes("…") &&
    !/(?:^|\s)(?:주|월|일|년)\s*\d+[.]?$/u.test(value) &&
    hasBalancedQuotes(value)
  );
}

function completeSourceSentences(value: string) {
  return (normalizedText(value).match(/[^.!?。]+[.!?。]+(?:["”’」』])?/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(isCompleteSourceText);
}

function isNearDuplicate(left: string, right: string) {
  const tokens = (value: string) =>
    new Set(
      normalizedText(value)
        .toLocaleLowerCase("ko-KR")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length > 1),
    );
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (Math.min(leftTokens.size, rightTokens.size) < 3) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.75;
}

function distinctTexts(values: string[]) {
  const selected: string[] = [];
  const keys: string[] = [];
  for (const value of values) {
    const text = normalizedText(value);
    const key = textKey(text);
    if (
      !key ||
      keys.some(
        (existing) =>
          existing === key ||
          (Math.min(existing.length, key.length) > 30 &&
            (existing.includes(key) || key.includes(existing))) ||
          isNearDuplicate(selected[keys.indexOf(existing)]!, text),
      )
    ) {
      continue;
    }
    selected.push(text);
    keys.push(key);
  }
  return selected;
}

function boundedText(value: string, maxLength: number, fallback: string) {
  const text = normalizedText(value);
  if (text.length <= maxLength && isCompleteSourceText(text)) return text;

  const sentences = text.match(/[^.!?。]+[.!?。]+/g) ?? [];
  let complete = "";
  for (const sentence of sentences) {
    const next = `${complete} ${sentence.trim()}`.trim();
    if (next.length > maxLength) break;
    complete = next;
  }
  if (complete && isCompleteSourceText(complete)) return complete;

  const safeFallback = normalizedText(fallback);
  if (safeFallback && safeFallback.length <= maxLength && isCompleteSourceText(safeFallback)) {
    return safeFallback;
  }
  return "확인된 보도 내용을 살펴봐야 합니다.";
}

const GENERIC_EDITORIAL_WORDS = new Set([
  "관련", "보도", "사실", "내용", "변화", "영향", "상황", "실제", "무엇", "어떤",
]);

function meaningfulWords(value: string) {
  return new Set(
    normalizedText(value)
      .toLocaleLowerCase("ko-KR")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1 && !GENERIC_EDITORIAL_WORDS.has(word)),
  );
}

function assertEditorialQuality(item: DigestItem) {
  const fields = [
    item.oneLine,
    item.overview,
    ...item.keyPoints,
    item.analogy,
    item.whyItMatters,
    item.socraticQuestion,
  ];
  if (fields.some((field) => !isCompleteSourceText(field))) {
    throw new Error("완결되지 않은 editorial 문장입니다.");
  }
  if (item.keyPoints.some((point, index) =>
    item.keyPoints.slice(index + 1).some((other) => isNearDuplicate(point, other)))) {
    throw new Error("서로 중복되는 key point입니다.");
  }
  const anchors = meaningfulWords(`${item.headline} ${item.oneLine}`);
  const questionWords = meaningfulWords(item.socraticQuestion);
  if (![...anchors].some((word) => questionWords.has(word))) {
    throw new Error("사건에 구체적이지 않은 생각해보기 질문입니다.");
  }
}

export function createFallbackDigestItem(
  category: NewsCategory,
  cluster: SummarizableCluster,
  context?: PresetEditorialContext,
): DigestItem {
  const articles = [...cluster.articles].sort((left, right) => left.id.localeCompare(right.id));
  const facts = distinctTexts(
    articles.flatMap((article) => completeSourceSentences(article.description)),
  );
  const headline =
    distinctTexts([cluster.representativeTitle, ...articles.map((article) => article.title)])
      .find((title) => title.length <= 120 && isCompleteSourceText(title)) ??
    facts.find((fact) => fact.length <= 120)?.replace(/[.!?。]+$/u, "") ??
    `${categoryLabel(category, context)} 소식`;
  const groundedFacts = facts.filter((text) => textKey(text) !== textKey(headline));
  const oneLine = boundedText(
    groundedFacts[0] ?? `${headline}에 관한 소식이 전해졌습니다.`,
    180,
    `${headline}에 관한 소식이 전해졌습니다.`,
  );
  const remainingFacts = groundedFacts.filter((text) => textKey(text) !== textKey(oneLine));
  const overview = boundedText(
    remainingFacts[0] ?? oneLine,
    1200,
    oneLine,
  );
  const keyPoints = distinctTexts(remainingFacts.slice(1, 3));
  const groundedBackupPoints = [
    `기사에서 확인되는 핵심 내용은 “${oneLine}”입니다.`,
    `또 다른 핵심은 “${overview}”입니다.`,
    `보도된 사건은 “${headline}”입니다.`,
    `기사에 담긴 설명은 “${oneLine}”입니다.`,
  ];
  for (const point of groundedBackupPoints) {
    if (keyPoints.length >= 2) break;
    if (!keyPoints.some((existing) => textKey(existing) === textKey(point))) {
      keyPoints.push(point);
    }
  }
  const analogyFact = remainingFacts[3] ?? oneLine;
  const analogy = analogyFact
    ? `쉽게 말해, ${boundedText(analogyFact, 470, oneLine)}`
    : oneLine;
  const whyItMatters = boundedText(
    remainingFacts[4] ??
      `${headline} 보도에서 눈여겨볼 구체적인 내용은 “${remainingFacts[0] ?? oneLine}”입니다.`,
    800,
    oneLine,
  );
  const questionContext = remainingFacts[4] ?? overview;
  const specificQuestion = `${questionContext} 그렇다면 ${headline}의 다음 단계는 무엇일까요?`;
  const socraticQuestion = specificQuestion.length <= 300
    ? specificQuestion
    : `${headline}의 다음 단계는 무엇일까요?`;

  return DigestItemSchema.parse({
    id: createHash("sha256")
      .update(`${"presetId" in cluster ? cluster.presetId : "legacy"}:${cluster.targetDate}:${cluster.id}`)
      .digest("hex")
      .slice(0, 24),
    clusterId: cluster.id,
    category,
    rank: 1,
    headline,
    oneLine,
    overview,
    keyPoints: keyPoints.map((point, index) =>
      boundedText(point, 240, index === 0 ? oneLine : overview),
    ),
    analogy: boundedText(analogy, 500, headline),
    whyItMatters,
    socraticQuestion,
    factStatus: "reported",
    confidence: cluster.sourceCount >= 2 ? 0.65 : 0.5,
    sourceIds: selectPromptArticles(cluster).map((article) => article.id),
  });
}

function buildPrompt(
  category: NewsCategory,
  candidates: SummarizableCluster[],
  sources: GroundedSource[],
  context?: PresetEditorialContext,
) {
  const presetPolicy = context
    ? `신문면: ${context.preset.displayName}
분야: ${context.sectionLabel}
독자 맥락: ${context.preset.explanation.readerContext}
유용한 중요성 관점: ${context.preset.explanation.usefulWhy}
금지할 추론: ${context.preset.explanation.avoidInference.join(" / ")}
편집상 중요한 신호: ${context.preset.editorial.importantSignals.join(", ")}
버릴 잡음: ${context.preset.editorial.noiseSignals.join(", ")}`
    : `분야: ${categoryLabel(category)}`;
  return `당신은 한 사람을 위한 한국어 전문 신문 편집자입니다.
${presetPolicy}

아래 후보 사건에서 정말 중요한 사건만 0~2개 고르세요. 많은 사람의 실제 영향, 실질적 변화, 장기 영향, 여러 출처 확인, 결정과 결과를 우선합니다. 말싸움, 유명인, 논란, 자극적 제목, 루머는 제외합니다.

고등학교 상위권 학생부터 대학 교양 입문자가 쉽게 읽되 내용은 얕지 않은 차분한 한국어로 쓰세요. "중요하다"거나 "경쟁력이 높아진다"는 결론만 쓰지 말고, 입력 출처에 근거가 있을 때 왜 그런지 작동 구조를 1~2단계 설명하세요. 숫자·기간·제도·이해관계자·비용·공급망·기술적 제약·정책 조건이 기사에 있다면 우선 활용하되 없는 정보는 만들지 마세요.

overview는 실제 발생 사실과 맥락, keyPoints는 서로 다른 핵심 사실, analogy는 어려운 구조의 쉬운 설명, whyItMatters는 이 사건이 바꾸는 구체적인 행동·조건을 맡습니다. 각 영역이 같은 말을 바꿔 쓰지 않게 하세요. 구체적 근거가 부족하면 범용 안전문구로 채우지 말고 짧게 쓰세요. "기술 변화는", "연구 결과는", "확인할 필요가 있습니다"처럼 다른 사건에도 붙는 category 문장보다 입력의 사람·기관·장소·기간·제도를 사용하세요. 문장을 길이 한도에 맞추려고 중간에서 자르지 마세요.

socraticQuestion은 현재 카드만 읽어도 생각을 시작할 수 있도록 질문 안에 이 사건의 고유 명사나 구체적인 변화 하나를 포함하세요. 선택의 득실, 각 주체의 행동 동기, 뒤따를 영향, 실제 변화 여부 같은 사고법은 내부에서만 사용하고 이름을 번역한 질문 틀로 노출하지 마세요. "누구에게 영향을 줄까요?", "비용과 이익은 누구에게 다를까요?", "카드의 어떤 사실이 근거인가요?"처럼 어떤 기사에도 붙는 질문을 쓰지 마세요. 추가 검색이 필요한 논술 문제가 아니라 이 카드의 사실에서 자연스럽게 이어지는 한 문장 질문이어야 합니다.

사실·주장·전망을 구분하고, 정치적 편향 표현을 피하세요. 과학의 초기 연구·경제 전망·기업 발표는 확정 사실처럼 쓰지 마세요. 같은 분량에서 정보 밀도를 높이고 기존 schema 길이 한도를 지키세요.

반드시 아래 clusterId와 source ID만 그대로 사용하세요. URL은 출력하지 마세요.

후보:
${JSON.stringify(
  candidates.map((cluster) => ({
    clusterId: cluster.id,
    title: cluster.representativeTitle,
    score: cluster.deterministicScore,
    sourceCount: cluster.sourceCount,
  })),
  null,
  2,
)}

출처:
${JSON.stringify(sources, null, 2)}`;
}

function validateGrounding(
  output: unknown,
  category: NewsCategory,
  candidates: SummarizableCluster[],
  sources: GroundedSource[],
) {
  const parsed = AiDigestSelectionSchema.parse(output);
  const clusterIds = new Set(candidates.map((candidate) => candidate.id));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seenClusters = new Set<string>();

  return parsed.items.map((item, index) => {
    if (!clusterIds.has(item.clusterId)) throw new Error("후보 밖 cluster ID입니다.");
    if (seenClusters.has(item.clusterId)) throw new Error("중복 cluster ID입니다.");
    seenClusters.add(item.clusterId);

    const uniqueSourceIds = [...new Set(item.sourceIds)];
    for (const sourceId of uniqueSourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error("입력에 없는 source ID입니다.");
      if (source.clusterId !== item.clusterId) throw new Error("다른 사건의 source ID입니다.");
    }

    const digestItem = DigestItemSchema.parse({
      ...item,
      id: createHash("sha256")
        .update(`${"presetId" in candidates[0]! ? candidates[0].presetId : "legacy"}:${candidates[0]?.targetDate}:${item.clusterId}`)
        .digest("hex")
        .slice(0, 24),
      category,
      rank: index + 1,
      sourceIds: uniqueSourceIds.map((sourceId) => sourceById.get(sourceId)!.articleId),
    });
    assertEditorialQuality(digestItem);
    return digestItem;
  });
}

class FixtureSummaryGenerator implements StructuredGenerator {
  constructor(
    private readonly candidates: SummarizableCluster[],
    private readonly sources: GroundedSource[],
    private readonly context?: PresetEditorialContext,
  ) {}

  async generate() {
    return {
      items: this.candidates.slice(0, 2).map((cluster) => {
        const clusterSources = this.sources.filter((source) => source.clusterId === cluster.id);
        const descriptions = cluster.articles.map((article) => article.description);
        return {
          clusterId: cluster.id,
          headline: cluster.representativeTitle,
          oneLine: descriptions[0] ?? cluster.representativeTitle,
          overview: `${cluster.representativeTitle}와 관련한 결정과 변화가 전날 확인됐습니다. 여러 보도를 함께 보면 발표 자체보다 실제 적용 범위와 다음 단계가 핵심입니다.`,
          keyPoints: [
            descriptions[0] ?? "핵심 결정이 발표됐습니다.",
            descriptions[1] ?? "후속 적용과 검증 과정이 남아 있습니다.",
          ],
          analogy: "쉽게 말해, 발표된 일정이나 지원 내용과 실제로 이행된 결과는 구분해서 봐야 합니다.",
          whyItMatters: descriptions[1] ?? descriptions[0] ?? cluster.representativeTitle,
          socraticQuestion: `“${cluster.representativeTitle}”의 다음 단계에서 가장 먼저 확인할 변화는 무엇일까요?`,
          factStatus: "reported",
          confidence: cluster.sourceCount >= 2 ? 0.86 : 0.68,
          sourceIds: clusterSources.slice(0, Math.max(1, Math.min(3, clusterSources.length))).map((source) => source.id),
        };
      }),
    };
  }
}

export async function summarizeStory(
  category: NewsCategory,
  candidates: SummarizableCluster[],
  generator?: StructuredGenerator,
  context?: PresetEditorialContext,
): Promise<DigestItem[]> {
  const limitedCandidates = candidates
    .filter((candidate) => candidate.category === category)
    .slice(0, 6);
  if (limitedCandidates.length === 0) return [];

  const sources = groundedSources(limitedCandidates);
  const activeGenerator =
    generator ??
    (process.env.DEMO_MODE === "true"
      ? new FixtureSummaryGenerator(limitedCandidates, sources, context)
      : new AiSdkStructuredGenerator());
  const prompt = buildPrompt(category, limitedCandidates, sources, context);
  const summaryStartedAt = Date.now();
  const sourceDate = limitedCandidates[0]!.targetDate;
  const logStage = (stage: string, details: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ stage, sourceDate, category, elapsedMs: Date.now() - summaryStartedAt, ...details }));
  };
  logStage("category_prompt_prepared", {
    candidateCount: limitedCandidates.length,
    groundedSourceCount: sources.length,
    promptChars: prompt.length,
  });

  try {
    let first: unknown;
    try {
      first = await activeGenerator.generate({
        schema: AiDigestSelectionSchema,
        prompt,
      });
      logStage("category_first_ai_call_completed", { result: "success" });
    } catch (firstCallError) {
      logStage("category_first_ai_call_completed", {
        result: "error",
        ...aiErrorLogDetails(firstCallError),
      });
      throw firstCallError;
    }
    return validateGrounding(first, category, limitedCandidates, sources);
  } catch (firstError) {
    if (isExternalAiCallError(firstError)) throw firstError;
    logStage("category_correction_started");
    try {
      const second = await activeGenerator.generate({
        schema: AiDigestSelectionSchema,
        prompt,
        correction: `스키마와 grounding 규칙을 지키세요. 오류: ${firstError instanceof Error ? firstError.message : "invalid response"}`,
      });
      const corrected = validateGrounding(second, category, limitedCandidates, sources);
      logStage("category_correction_completed", { result: "success" });
      return corrected;
    } catch (secondError) {
      logStage("category_correction_completed", {
        result: "error",
        ...aiErrorLogDetails(secondError),
      });
      throw new Error(
        `${categoryLabel(category, context)} 요약/grounding 실패: ${secondError instanceof Error ? secondError.message : "invalid response"}`,
        { cause: secondError },
      );
    }
  }
}
