import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { createSupabaseServiceClient } from "@/lib/db/supabase";
import { PushSubscriptionInputSchema } from "@/lib/push/schemas";

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = PushSubscriptionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 Push 구독입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  const { endpoint, keys } = parsed.data;
  const { error } = await createSupabaseServiceClient().from("push_subscriptions").upsert(
    { endpoint, p256dh: keys.p256dh, auth: keys.auth, last_seen_at: new Date().toISOString(), revoked_at: null },
    { onConflict: "endpoint" },
  );
  return error ? Response.json({ error: "Push 구독을 저장하지 못했습니다." }, { status: 500 }) : Response.json({ ok: true });
}

const DeleteInput = z.object({ endpoint: z.string().url().max(4096) });

export async function DELETE(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = DeleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 endpoint입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  const { error } = await createSupabaseServiceClient()
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("endpoint", parsed.data.endpoint);
  return error ? Response.json({ error: "Push 구독을 해제하지 못했습니다." }, { status: 500 }) : Response.json({ ok: true });
}
