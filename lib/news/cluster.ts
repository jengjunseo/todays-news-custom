import { createHash } from "node:crypto";

import { z } from "zod";

import { NEWS_CATEGORIES, NewsCategorySchema, type SourceArticle } from "@/lib/news/types";

const STOPWORDS = new Set([
  "발표",
  "관련",
  "이번",
  "대한",
  "오늘",
  "어제",
  "밝혀",
  "예정",
  "추진",
  "속보",
  "단독",
  "종합",
  "정부",
  "당국",
]);

const DECISION_GROUPS = [
  new Set(["동결", "인상", "인하"]),
  new Set(["승인", "거부", "보류"]),
  new Set(["확정", "검토", "철회"]),
  new Set(["통과", "부결"]),
];

const IMPACT_SIGNALS = new Set([
  "법",
  "정책",
  "지원",
  "투자",
  "금리",
  "물가",
  "안전",
  "의료",
  "교육",
  "전력",
  "기후",
  "보안",
  "산업",
  "규제",
]);

const GENERIC_EVENT_TOKENS = new Set(["투자", "정책", "산업", "기업", "공급", "계획", "사업"]);

export const StoryClusterSchema = z.object({
  id: z.string().length(24),
  category: NewsCategorySchema,
  targetDate: z.string().date(),
  representativeTitle: z.string().min(1),
  deterministicScore: z.number().min(0).max(100),
  articleCount: z.number().int().positive(),
  sourceCount: z.number().int().positive(),
  queryCount: z.number().int().positive(),
  articles: z.array(z.custom<SourceArticle>()).min(1),
});

export type StoryCluster = z.infer<typeof StoryClusterSchema>;

function tokens(title: string) {
  return new Set(
    title
      .split(/\s+/)
      .map((token) => token.replace(/(에서|에게|으로|부터|까지|에는|은|는|이|가|을|를|에|의|와|과)$/u, ""))
      .map((token) => (token.length > 2 ? token.replace(/책$/u, "") : token))
      .filter(
        (token) =>
          token.length >= 2 &&
          !STOPWORDS.has(token) &&
          !/^\d+(?:\.\d+)?(?:조|억|만|%|명|개)?$/u.test(token),
      ),
  );
}

function numbers(title: string) {
  return new Set(title.match(/\d+(?:\.\d+)?(?:조|억|만|%|명|개)?/g) ?? []);
}

function bigrams(title: string) {
  const compact = title.replace(/\s+/g, "");
  const result = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    result.add(compact.slice(index, index + 2));
  }
  return result;
}

function intersectionSize<T>(left: Set<T>, right: Set<T>) {
  let size = 0;
  for (const item of left) if (right.has(item)) size += 1;
  return size;
}

function jaccard<T>(left: Set<T>, right: Set<T>) {
  const intersection = intersectionSize(left, right);
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasConflictingDecision(left: Set<string>, right: Set<string>) {
  return DECISION_GROUPS.some((group) => {
    const leftDecision = [...left].find((token) => group.has(token));
    const rightDecision = [...right].find((token) => group.has(token));
    return Boolean(leftDecision && rightDecision && leftDecision !== rightDecision);
  });
}

function hasSharedNumber(articles: SourceArticle[]) {
  if (articles.length < 2) return false;
  const shared = new Set(numbers(articles[0]!.normalizedTitle));
  for (const article of articles.slice(1)) {
    for (const value of shared) {
      if (!numbers(article.normalizedTitle).has(value)) shared.delete(value);
    }
  }
  return shared.size > 0;
}

function canJoinGroup(group: SourceArticle[], article: SourceArticle) {
  const matches = group.map((item) => sameStory(item, article));
  return matches.every(Boolean) || (hasSharedNumber(group) && matches.some(Boolean));
}

export function sameStory(left: SourceArticle, right: SourceArticle) {
  if (left.category !== right.category || left.targetDate !== right.targetDate) return false;
  if (left.canonicalUrl === right.canonicalUrl) return true;

  const leftTokens = tokens(left.normalizedTitle);
  const rightTokens = tokens(right.normalizedTitle);
  if (hasConflictingDecision(leftTokens, rightTokens)) return false;

  const leftNumbers = numbers(left.normalizedTitle);
  const rightNumbers = numbers(right.normalizedTitle);
  if (leftNumbers.size > 0 && rightNumbers.size > 0 && intersectionSize(leftNumbers, rightNumbers) === 0) {
    return false;
  }

  const commonTokens = intersectionSize(leftTokens, rightTokens);
  const commonDistinctiveToken = [...leftTokens].some(
    (token) => rightTokens.has(token) && !GENERIC_EVENT_TOKENS.has(token),
  );
  const tokenScore = jaccard(leftTokens, rightTokens);
  const bigramScore = jaccard(bigrams(left.normalizedTitle), bigrams(right.normalizedTitle));
  const sameNumber = intersectionSize(leftNumbers, rightNumbers) > 0;

  return (
    (tokenScore >= 0.36 && bigramScore >= 0.2) ||
    (commonTokens >= 2 && bigramScore >= 0.15) ||
    (commonDistinctiveToken && sameNumber && bigramScore >= 0.1)
  );
}

function scoreCluster(articles: SourceArticle[]) {
  const sourceCount = new Set(articles.map((article) => article.sourceDomain)).size;
  const queryCount = new Set(articles.map((article) => article.query)).size;
  const combinedTokens = new Set(articles.flatMap((article) => [...tokens(article.normalizedTitle)]));
  const impactCount = [...combinedTokens].filter((token) =>
    [...IMPACT_SIGNALS].some((signal) => token.includes(signal)),
  ).length;
  const latestHour = Math.max(
    ...articles.map((article) => {
      const date = new Date(article.publishedAt);
      return Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Seoul",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(date),
      );
    }),
  );

  return Math.min(
    100,
    articles.length * 7 +
      Math.min(sourceCount * 13, 32) +
      Math.min(queryCount * 7, 18) +
      Math.min(impactCount * 4, 18) +
      Math.round((latestHour / 23) * 8),
  );
}

function makeCluster(articles: SourceArticle[]): StoryCluster {
  const sorted = [...articles].sort((left, right) => left.id.localeCompare(right.id));
  const representativeTitle = [...articles]
    .sort(
      (left, right) =>
        left.title.length - right.title.length || left.title.localeCompare(right.title),
    )[0]!.title;
  const id = createHash("sha256")
    .update(sorted.map((article) => article.id).join(":"))
    .digest("hex")
    .slice(0, 24);
  return StoryClusterSchema.parse({
    id,
    category: sorted[0]!.category,
    targetDate: sorted[0]!.targetDate,
    representativeTitle,
    deterministicScore: scoreCluster(sorted),
    articleCount: sorted.length,
    sourceCount: new Set(sorted.map((article) => article.sourceDomain)).size,
    queryCount: new Set(sorted.map((article) => article.query)).size,
    articles: sorted,
  });
}

export function clusterAndRank(input: SourceArticle[]) {
  const byUrl = [...new Map(input.map((article) => [article.canonicalUrl, article])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const clusters: StoryCluster[] = [];

  for (const category of NEWS_CATEGORIES) {
    const categoryArticles = byUrl
      .filter((article) => article.category === category)
      .sort(
        (left, right) =>
          left.normalizedTitle.localeCompare(right.normalizedTitle, "ko-KR") ||
          left.id.localeCompare(right.id),
      );
    const groups: SourceArticle[][] = [];
    for (const article of categoryArticles) {
      const matchingGroups = groups.filter((group) => canJoinGroup(group, article));
      if (matchingGroups.length === 0) {
        groups.push([article]);
        continue;
      }
      const primary = matchingGroups[0]!;
      primary.push(article);
    }
    clusters.push(...groups.map(makeCluster));
  }

  const categoryOrder = new Map<string, number>(NEWS_CATEGORIES.map((category, index) => [category, index]));
  return clusters.sort(
    (left, right) =>
      categoryOrder.get(left.category)! - categoryOrder.get(right.category)! ||
      right.deterministicScore - left.deterministicScore ||
      left.id.localeCompare(right.id),
  );
}

export function topCandidatesByCategory(clusters: StoryCluster[], limit = 6) {
  return Object.fromEntries(
    NEWS_CATEGORIES.map((category) => [
      category,
      clusters.filter((cluster) => cluster.category === category).slice(0, limit),
    ]),
  );
}
