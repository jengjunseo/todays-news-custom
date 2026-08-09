import { isValidCronRequest } from "@/lib/jobs/cron-auth";
import { runAllPresetPapers } from "@/lib/pipeline/run-daily-digest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isValidCronRequest(request)) {
    return Response.json({ error: "유효하지 않은 scheduler 요청입니다." }, { status: 401 });
  }
  try {
    return Response.json({ papers: await runAllPresetPapers() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "뉴스 생성 실패" },
      { status: 500 },
    );
  }
}
