import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { PersonalStateRepository } from "@/lib/db/repositories/personal-state-repository";

const Input = z.object({ digestItemId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 뉴스 ID입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  try {
    await new PersonalStateRepository().markRead(parsed.data.digestItemId);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "읽음 상태를 저장하지 못했습니다." }, { status: 500 });
  }
}
