import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { isValidCronRequest } from "@/lib/jobs/cron-auth";

describe("external scheduler contract", () => {
  it("protects job endpoints with a bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "scheduler-secret");
    expect(isValidCronRequest(new Request("https://app.example/api/jobs", { headers: { Authorization: "Bearer scheduler-secret" } }))).toBe(true);
    expect(isValidCronRequest(new Request("https://app.example/api/jobs", { headers: { Authorization: "Bearer wrong" } }))).toBe(false);
  });

  it("documents provider-neutral authenticated HTTP endpoints", () => {
    const documentation = readFileSync(resolve(process.cwd(), "db/README.md"), "utf8");
    expect(documentation).toContain("POST /api/jobs/generate-daily");
    expect(documentation).toContain("POST /api/jobs/send-due");
    expect(documentation).toContain("Authorization: Bearer <CRON_SECRET>");
    expect(documentation).toContain("Scheduling is deliberately outside the database");
  });
});
