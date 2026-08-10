import { z } from "zod";

import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { PersonalStateRepository } from "@/lib/db/repositories/personal-state-repository";

const Input = z.object({ digestItemId: z.string().min(1).max(128), content: z.string().max(5000) });

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "생각은 5000자까지 저장할 수 있습니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ ok: true });
  try {
    await new PersonalStateRepository().upsertReflection(
      parsed.data.digestItemId,
      parsed.data.content,
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "생각을 저장하지 못했습니다." }, { status: 500 });
  }
}
