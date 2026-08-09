import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";

const Input = z.object({ digestItemId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 뉴스 ID입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  const { createSupabaseServiceClient } = await import("@/lib/db/supabase");
  const { error } = await createSupabaseServiceClient().from("read_states").upsert({ digest_item_id: parsed.data.digestItemId, read_at: new Date().toISOString() });
  return error ? Response.json({ error: "읽음 상태를 저장하지 못했습니다." }, { status: 500 }) : Response.json({ ok: true });
}
