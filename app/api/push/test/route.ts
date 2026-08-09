import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { createSupabaseServiceClient } from "@/lib/db/supabase";
import { isExpiredPushError, sendWebPush } from "@/lib/push/send";

const Input = z.object({ endpoint: z.string().url().max(4096) });

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success || process.env.DEMO_MODE === "true") {
    return Response.json({ error: "서버 Push 구독이 필요합니다." }, { status: 400 });
  }

  const client = createSupabaseServiceClient();
  const { data, error } = await client
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("endpoint", parsed.data.endpoint)
    .is("revoked_at", null)
    .single();
  if (error || !data) return Response.json({ error: "활성 구독을 찾을 수 없습니다." }, { status: 404 });

  try {
    await sendWebPush(
      { endpoint: data.endpoint, keys: { p256dh: data.p256dh, auth: data.auth } },
      {
        title: "어제의 편집국 테스트",
        body: "알림이 정상적으로 연결됐습니다.",
        deepLink: "/insights?focus=morning",
        nudgeId: `test-${Date.now()}`,
        type: "test",
      },
    );
    return Response.json({ ok: true });
  } catch (pushError) {
    if (isExpiredPushError(pushError)) {
      await client.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("endpoint", data.endpoint);
      return Response.json({ error: "만료된 구독입니다. 알림을 다시 켜 주세요." }, { status: 410 });
    }
    return Response.json({ error: "테스트 Push를 보내지 못했습니다." }, { status: 502 });
  }
}
