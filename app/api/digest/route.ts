import { rejectUnauthorized } from "@/lib/auth/api-guard";
import { getCurrentDigest } from "@/lib/digest/read-digest";
import { getPresetOrDefault } from "@/lib/presets";

export async function GET(request?: Request) {
  const unauthorized = await rejectUnauthorized();
  if (unauthorized) return unauthorized;
  const preset = getPresetOrDefault(request ? new URL(request.url).searchParams.get("paper") : null);
  return Response.json({ digest: await getCurrentDigest(preset.id) });
}
