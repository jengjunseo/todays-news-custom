import { describe, expect, it } from "vitest";

import { NAV_ITEMS } from "@/components/bottom-navigation";

describe("mobile navigation contract", () => {
  it("keeps one canonical destination for each primary area", () => {
    expect(NAV_ITEMS).toEqual([
      { href: "/", label: "오늘" },
      { href: "/archive", label: "지난 신문" },
      { href: "/insights", label: "생각" },
      { href: "/settings", label: "설정" },
    ]);
  });
});
