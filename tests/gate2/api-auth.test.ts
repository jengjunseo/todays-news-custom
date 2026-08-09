import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

describe("protected APIs", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("rejects an unauthenticated digest request", async () => {
    const { GET } = await import("@/app/api/digest/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("rejects an unauthenticated settings request", async () => {
    const { GET } = await import("@/app/api/settings/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
