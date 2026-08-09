import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "@/lib/auth/session";

const secret = "a-secure-test-secret-with-enough-length";

describe("signed personal session", () => {
  it("accepts a valid unexpired token", () => {
    const now = Date.UTC(2026, 7, 2);
    expect(verifySession(signSession(secret, now, 60), secret, now + 30_000)).toBe(true);
  });

  it("rejects expiration and tampering", () => {
    const now = Date.UTC(2026, 7, 2);
    const token = signSession(secret, now, 60);
    expect(verifySession(token, secret, now + 61_000)).toBe(false);
    expect(verifySession(`${token}x`, secret, now)).toBe(false);
  });
});
