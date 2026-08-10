import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { PersonalStateRepository } from "@/lib/db/repositories/personal-state-repository";
import { PushSubscriptionInputSchema } from "@/lib/push/schemas";

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = PushSubscriptionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 Push 구독입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  const { endpoint, keys } = parsed.data;
  try {
    await new PersonalStateRepository().upsertPushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Push 구독을 저장하지 못했습니다." }, { status: 500 });
  }
}

const DeleteInput = z.object({ endpoint: z.string().url().max(4096) });

export async function DELETE(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = DeleteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 endpoint입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  try {
    await new PersonalStateRepository().revokePushSubscription(parsed.data.endpoint);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Push 구독을 해제하지 못했습니다." }, { status: 500 });
  }
}
