import { isValidCronRequest } from "@/lib/jobs/cron-auth";
import { sendDuePush } from "@/lib/push/send-due-push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isValidCronRequest(request)) {
    return Response.json({ error: "유효하지 않은 scheduler 요청입니다." }, { status: 401 });
  }
  try {
    return Response.json(await sendDuePush());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Push 작업 실패" },
      { status: 500 },
    );
  }
}
