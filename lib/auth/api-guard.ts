import { hasValidSession } from "@/lib/auth/session";

export async function rejectUnauthorized() {
  return (await hasValidSession())
    ? null
    : Response.json({ error: "인증이 필요합니다." }, { status: 401 });
}
