import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPostgresMock } = vi.hoisted(() => ({ getPostgresMock: vi.fn() }));

vi.mock("@/lib/db/postgres", () => ({ getPostgres: getPostgresMock }));

import { getSetupDiagnostics } from "@/lib/diagnostics/setup";

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  getPostgresMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database setup diagnostics", () => {
  it("reports demo persistence without exposing configured values", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "postgres://do-not-expose@database.example/app");
    vi.stubEnv("VAPID_PRIVATE_KEY", "do-not-expose-vapid-secret");

    const diagnostics = await getSetupDiagnostics();

    expect(diagnostics.database).toBe("로컬 데모 저장소");
    expect(JSON.stringify(diagnostics)).not.toContain("do-not-expose");
    expect(getPostgresMock).not.toHaveBeenCalled();
  });

  it("distinguishes an absent DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    expect((await getSetupDiagnostics()).database).toBe("PostgreSQL 미설정");
    expect(getPostgresMock).not.toHaveBeenCalled();
  });

  it("reports a healthy PostgreSQL query without exposing the connection string", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://do-not-expose@database.example/app");
    let query = 0;
    getPostgresMock.mockReturnValue((() => {
      query += 1;
      if (query === 1) return Promise.resolve([]);
      if (query === 2) return Promise.resolve([]);
      return Promise.resolve([{ count: 0 }]);
    }) as never);

    const diagnostics = await getSetupDiagnostics();

    expect(diagnostics.database).toBe("PostgreSQL 연결됨");
    expect(JSON.stringify(diagnostics)).not.toContain("do-not-expose");
  });

  it("distinguishes a PostgreSQL connection or query error", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://do-not-expose@database.example/app");
    getPostgresMock.mockReturnValue((() => Promise.reject(new Error("database unavailable"))) as never);

    const diagnostics = await getSetupDiagnostics();

    expect(diagnostics.database).toBe("PostgreSQL 연결 오류");
    expect(JSON.stringify(diagnostics)).not.toContain("do-not-expose");
  });
});

describe("production AI setup diagnostics", () => {
  it("recognizes OpenRouter authentication", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b:free");
    vi.stubEnv("OPENROUTER_API_KEY", "do-not-expose-openrouter-secret");
    vi.stubEnv("VERCEL", "1");

    const diagnostics = await getSetupDiagnostics();

    expect(diagnostics.ai).toBe("설정됨");
    expect(JSON.stringify(diagnostics)).not.toContain("do-not-expose");
  });

  it("recognizes Gemini authentication", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("AI_MODEL", "gemini-3.5-flash");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "do-not-expose-google-secret");
    vi.stubEnv("VERCEL", "1");

    const diagnostics = await getSetupDiagnostics();

    expect(diagnostics.ai).toBe("설정됨");
    expect(JSON.stringify(diagnostics)).not.toContain("do-not-expose");
  });
});
