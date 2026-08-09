import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { z } from "zod";
import { getDemoSettings, setDemoSettings } from "@/lib/demo/state";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const SettingsInput = z.object({
  morning_enabled: z.boolean(),
  morning_time: Time,
  perspective_enabled: z.boolean(),
  perspective_time: Time,
  evening_enabled: z.boolean(),
  evening_time: Time,
  timezone: z.literal("Asia/Seoul"),
});

export async function GET() {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  if (process.env.DEMO_MODE === "true") return Response.json({ settings: getDemoSettings() });
  const { createSupabaseServiceClient } = await import("@/lib/db/supabase");
  const { data, error } = await createSupabaseServiceClient()
    .from("notification_settings")
    .select("morning_enabled,morning_time,perspective_enabled,perspective_time,evening_enabled,evening_time,timezone")
    .eq("singleton", true)
    .single();
  return error ? Response.json({ error: "설정을 읽을 수 없습니다." }, { status: 500 }) : Response.json({ settings: data });
}

export async function POST(request: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const parsed = SettingsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "유효하지 않은 설정입니다." }, { status: 400 });
  if (process.env.DEMO_MODE === "true") return Response.json({ settings: setDemoSettings(parsed.data) });
  const { createSupabaseServiceClient } = await import("@/lib/db/supabase");
  const { data, error } = await createSupabaseServiceClient()
    .from("notification_settings")
    .upsert({ singleton: true, ...parsed.data, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return Response.json({ error: "설정을 저장할 수 없습니다." }, { status: 500 });
  return Response.json({ settings: data });
}
