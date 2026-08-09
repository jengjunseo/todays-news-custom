import { z } from "zod";

import { passwordMatches } from "@/lib/auth/password";
import {
  getPersonalAccessConfig,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/auth/session";

const LoginInput = z.object({ password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  const parsed = LoginInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const config = getPersonalAccessConfig();
  if (!config.password || !passwordMatches(parsed.data.password, config.password)) {
    return Response.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${signSession(config.secret)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}
