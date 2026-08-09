import { describe, expect, it } from "vitest";

import { isDigestStale, isValidKstDateKey } from "@/lib/time/kst";

describe("V1.0 digest freshness", () => {
  const now = new Date("2026-08-04T03:00:00.000Z");

  it("does not mark the expected previous KST date as stale", () => {
    expect(isDigestStale("2026-08-03", now)).toBe(false);
  });

  it("marks a digest one or more days behind as stale", () => {
    expect(isDigestStale("2026-08-02", now)).toBe(true);
  });

  it("leaves the existing empty state unchanged when no digest exists", () => {
    expect(isDigestStale(null, now)).toBe(false);
  });
});

describe("V1.0 archive date validation", () => {
  it("accepts only real YYYY-MM-DD dates", () => {
    expect(isValidKstDateKey("2026-08-03")).toBe(true);
    expect(isValidKstDateKey("2026-8-3")).toBe(false);
    expect(isValidKstDateKey("2026-02-30")).toBe(false);
  });
});
