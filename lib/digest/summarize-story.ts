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

const FALLBACK_WHY_IT_MATTERS: Partial<Record<NewsCategory, string>> = {
  politics: "정책과 공공 결정은 시민이 이용하는 제도와 자원 배분에 영향을 줄 수 있어 실제 적용 범위를 확인할 필요가 있습니다.",
  society: "사회 제도와 안전·복지의 변화는 일상에서 이용할 수 있는 지원과 책임의 범위를 바꿀 수 있어 후속 결과가 중요합니다.",
  science: "연구 결과는 후속 검증을 거쳐야 지식이나 기술의 근거가 되므로 재현 여부와 적용 범위를 함께 봐야 합니다.",
  technology: "기술 변화는 서비스 선택, 비용, 개인정보와 연결될 수 있어 실제 제공 범위와 이용 조건을 확인할 필요가 있습니다.",
  economy: "경제 결정은 물가, 일자리, 대출과 소비 여건에 이어질 수 있어 발표 뒤 실제 수치가 어떻게 움직이는지 살펴봐야 합니다.",
};

export function createFallbackDigestItem(
  category: NewsCategory,
  cluster: SummarizableCluster,
  context?: PresetEditorialContext,
): DigestItem {
  const articles = [...cluster.articles].sort((left, right) => left.id.localeCompare(right.id));
  const headline =
    distinctTexts([cluster.representativeTitle, ...articles.map((article) => article.title)])
      .find((title) => title.length <= 120 && isCompleteSourceText(title)) ?? "확인된 주요 보도";
  const facts = distinctTexts(
    articles.flatMap((article) => completeSourceSentences(article.description)),
  ).filter((text) => textKey(text) !== textKey(headline));
  const oneLine = boundedText(
    facts[0] ?? "관련 보도가 나왔으며 구체적인 내용은 후속 보도로 확인해야 합니다.",
    180,
    "관련 보도가 나왔으며 구체적인 내용은 후속 보도로 확인해야 합니다.",
  );
  const remainingFacts = facts.filter((text) => textKey(text) !== textKey(oneLine));
  const overview = boundedText(
    remainingFacts[0] ?? `${headline}와 관련한 보도가 나왔습니다. 구체적인 범위와 결과는 후속 보도로 확인해야 합니다.`,
    1200,
    headline,
  );
  const keyPoints = distinctTexts(remainingFacts.slice(1)).slice(0, 3);
  const verificationPoints = [
    "현재 확인된 사실은 기사 제목과 공개된 보도 내용의 범위로 제한됩니다.",
    "구체적인 적용 범위와 실제 결과는 후속 보도로 확인해야 합니다.",
  ];
  for (const point of verificationPoints) {
    if (keyPoints.length >= 2) break;
    if (!keyPoints.some((existing) => textKey(existing) === textKey(point))) keyPoints.push(point);
  }
  const analogyFact = remainingFacts.find(
    (fact) => !keyPoints.some((point) => textKey(point) === textKey(fact)),
  );
  const analogy = analogyFact
    ? `쉽게 말해, ${boundedText(analogyFact, 470, "보도된 내용과 실제로 나타난 결과는 구분해서 봐야 합니다.")}`
    : "쉽게 말해, 보도된 발표와 실제로 나타난 결과는 구분해서 봐야 합니다.";

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
      boundedText(point, 240, verificationPoints[index % verificationPoints.length]!),
    ),
    analogy: boundedText(analogy, 500, headline),
    whyItMatters:
      context?.preset.explanation.usefulWhy ??
      FALLBACK_WHY_IT_MATTERS[category] ??
      "이 변화가 독자에게 실제로 어떤 선택과 조건을 바꾸는지 후속 근거를 확인할 필요가 있습니다.",
    socraticQuestion: boundedText(
      `“${oneLine}” 상황에서 실제 영향을 먼저 받는 사람이나 조직은 누구일까요? 카드의 어떤 사실이 그 판단을 뒷받침하나요?`,
      300,
      `“${headline}”의 실제 영향을 판단할 때 카드에서 어떤 사실을 근거로 삼을 수 있을까요?`,
    ),
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

overview는 무슨 일이 있었는지와 그 의미가 생기는 구조를 함께 설명하세요. keyPoints는 overview를 반복하지 말고 결정/사실, 작동 조건, 다음 확인 변수처럼 서로 다른 역할을 갖게 하세요. 필요한 전문용어 1~2개는 처음에 짧게 뜻을 붙일 수 있습니다. analogy는 억지 비유 대신 실제 구조를 쉬운 말로 다시 설명해도 됩니다. whyItMatters는 실제 관련된 개인·기업·정부·시장·과학기술 주체 중 누구의 무엇이 달라질 수 있는지 구체화하세요. 각 필드에서 같은 문장을 반복하거나 길이 한도에 맞추려고 문장을 중간에서 자르지 마세요.

socraticQuestion은 현재 카드만 읽어도 생각을 시작할 수 있도록 질문 안에 핵심 사실이나 상황을 짧게 포함하세요. 선택의 득실, 각 주체의 행동 동기, 뒤따를 영향, 실제 변화 여부 중 하나를 구체적으로 묻되 trade-off, incentive, second-order effect, verification 같은 영어 메타어를 질문에 그대로 쓰지 마세요. 추가 검색이 필요한 논술 문제가 아니라 카드의 사실을 근거로 답할 수 있는 한두 문장 질문이어야 합니다.

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

    return DigestItemSchema.parse({
      ...item,
      id: createHash("sha256")
        .update(`${"presetId" in candidates[0]! ? candidates[0].presetId : "legacy"}:${candidates[0]?.targetDate}:${item.clusterId}`)
        .digest("hex")
        .slice(0, 24),
      category,
      rank: index + 1,
      sourceIds: uniqueSourceIds.map((sourceId) => sourceById.get(sourceId)!.articleId),
    });
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
          whyItMatters: this.context?.preset.explanation.usefulWhy ?? "이 변화가 실제 선택과 이용 조건을 어떻게 바꾸는지 확인할 필요가 있습니다.",
          socraticQuestion: this.context
            ? `${this.context.preset.displayName} 독자에게 실제 변화가 생겼다고 판단하려면 어떤 후속 사실을 확인해야 할까요?`
            : "이 변화가 실제로 일어났다고 판단하려면 어떤 후속 사실을 확인해야 할까요?",
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
