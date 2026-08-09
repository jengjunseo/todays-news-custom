import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "custom-newspaper-session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(
  secret: string,
  now = Date.now(),
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
) {
  if (secret.length < 16) {
    throw new Error("AUTH_SECRET은 16자 이상이어야 합니다.");
  }

  const expiresAt = Math.floor(now / 1000) + maxAgeSeconds;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySession(token: string, secret: string, now = Date.now()) {
  const [version, expiresAtText, receivedSignature, extra] = token.split(".");
  if (version !== "v1" || extra || !expiresAtText || !receivedSignature) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) {
    return false;
  }

  const payload = `${version}.${expiresAtText}`;
  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(receivedSignature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function getPersonalAccessConfig() {
  const demoMode = process.env.DEMO_MODE === "true";
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (process.env.NODE_ENV === "production" && !demoMode && !password) {
    throw new Error("APP_PASSWORD가 설정되지 않았습니다.");
  }
  if (process.env.NODE_ENV === "production" && !demoMode && !secret) {
    throw new Error("AUTH_SECRET이 설정되지 않았습니다.");
  }

  return {
    demoMode,
    password: password ?? (demoMode ? "demo" : ""),
    secret: secret ?? (demoMode ? "demo-auth-secret-change-me" : ""),
  };
}

export async function hasValidSession() {
  const config = getPersonalAccessConfig();
  if (config.demoMode) return true;
  if (!config.secret) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token, config.secret) : false;
}
