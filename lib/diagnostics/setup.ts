import { getPostgres } from "@/lib/db/postgres";
import { isDemoMode } from "@/lib/config/mode";
import { isAiRuntimeConfigured } from "@/lib/ai/structured-generator";

export type SetupDiagnostics = {
  database: string;
  newsApi: string;
  ai: string;
  push: string;
  scheduler: string;
  lastDigest: string;
};

export async function getSetupDiagnostics(): Promise<SetupDiagnostics> {
  const startedAt = Date.now();
  if (isDemoMode()) {
    const diagnostics = {
      database: "로컬 데모 저장소",
      newsApi: "데모 fixture",
      ai: "데모 출력",
      push: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "VAPID 설정됨" : "VAPID 안됨",
      scheduler: "시뮬레이션 가능",
      lastDigest: "데모 생성됨",
    };
    console.log(JSON.stringify({ stage: "settings_diagnostics_total_ms", elapsedMs: Date.now() - startedAt, rowCount: 0 }));
    return diagnostics;
  }

  const base: SetupDiagnostics = {
    database: process.env.DATABASE_URL ? "PostgreSQL 확인 중" : "PostgreSQL 미설정",
    newsApi:
      process.env.NAVER_API_HUB_CLIENT_ID && process.env.NAVER_API_HUB_CLIENT_SECRET
        ? "설정됨"
        : "설정 안됨",
    ai: isAiRuntimeConfigured() ? "설정됨" : "설정 안됨",
    push:
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
        ? "확인 중"
        : "설정 안됨",
    scheduler: "실행 기록 없음",
    lastDigest: "없음",
  };
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ stage: "settings_diagnostics_total_ms", elapsedMs: Date.now() - startedAt, rowCount: 0 }));
    return base;
  }

  try {
    const sql = getPostgres();
    const [runs, digests, subscriptions] = await Promise.all([
      sql<Array<{ completedAt: string | null; status: string }>>`
        select completed_at::text as "completedAt", status from pipeline_runs
        order by started_at desc limit 1
      `,
      sql<Array<{ publishedAt: string | null }>>`
        select published_at::text as "publishedAt" from daily_digests
        where status = 'published' order by source_date desc limit 1
      `,
      sql<Array<{ count: number }>>`
        select count(*)::int as count from push_subscriptions where revoked_at is null
      `,
    ]);
    const diagnostics = {
      ...base,
      database: "PostgreSQL 연결됨",
      push: subscriptions[0]?.count ? "구독됨" : "구독 안됨",
      scheduler: runs[0]
        ? `${runs[0].status} · ${runs[0].completedAt ?? "실행 중"}`
        : "실행 기록 없음",
      lastDigest: digests[0]?.publishedAt ?? "없음",
    };
    console.log(JSON.stringify({ stage: "settings_diagnostics_total_ms", elapsedMs: Date.now() - startedAt, rowCount: 3 }));
    return diagnostics;
  } catch {
    console.log(JSON.stringify({ stage: "settings_diagnostics_total_ms", elapsedMs: Date.now() - startedAt, rowCount: 0 }));
    return { ...base, database: "PostgreSQL 연결 오류", push: "확인 불가" };
  }
}
