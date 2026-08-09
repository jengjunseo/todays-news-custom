import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { isValidCronRequest } from "@/lib/jobs/cron-auth";

describe("Supabase Cron contract", () => {
  it("protects job endpoints with a bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "scheduler-secret");
    expect(isValidCronRequest(new Request("https://app.example/api/jobs", { headers: { Authorization: "Bearer scheduler-secret" } }))).toBe(true);
    expect(isValidCronRequest(new Request("https://app.example/api/jobs", { headers: { Authorization: "Bearer wrong" } }))).toBe(false);
  });

  it("schedules 06:45 KST generation in UTC and due checks every ten minutes", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608020002_scheduler.sql"), "utf8");
    expect(sql).toContain("'45 21 * * *'");
    expect(sql).toContain("'*/10 * * * *'");
    expect(sql).toContain("vault.decrypted_secrets");
  });
});
