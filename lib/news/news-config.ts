import type { NewsCategory } from "@/lib/news/types";

export const NEWS_CONFIG: Record<NewsCategory, readonly string[]> = {
  politics: ["정부 정책", "국회 법안", "외교 안보", "행정 제도"],
  society: ["사회 제도", "교육 정책", "보건 복지", "노동 안전"],
  science: ["과학 연구", "우주 기후", "의학 연구", "에너지 연구"],
  technology: ["인공지능 기술", "반도체 산업", "정보 보안", "디지털 정책"],
  economy: ["한국 경제", "금리 물가", "산업 투자", "무역 금융"],
};

export const NAVER_PAGE_SIZE = 100;
export const NAVER_MAX_PAGES_PER_QUERY = 3;
