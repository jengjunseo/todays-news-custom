import { beforeEach, describe, expect, it } from "vitest";

import {
  completesDigest,
  completionStorageKey,
  loadScopedReadIds,
  readStorageKey,
} from "@/components/digest-view";

describe("daily reading experience", () => {
  beforeEach(() => localStorage.clear());

  it("separates progress by sourceDate and filters IDs outside the current digest", () => {
    localStorage.setItem("yesterday-core:read", JSON.stringify(["today-1", "old-1"]));

    const today = loadScopedReadIds(localStorage, "2026-08-04", ["today-1", "today-2"]);
    const nextDay = loadScopedReadIds(localStorage, "2026-08-05", ["next-1", "next-2"]);

    expect([...today]).toEqual(["today-1"]);
    expect([...nextDay]).toEqual([]);
    expect(localStorage.getItem(readStorageKey("2026-08-04"))).toBe('["today-1"]');
    expect(localStorage.getItem(readStorageKey("2026-08-05"))).toBe("[]");
  });

  it("restores the same date without including stale IDs", () => {
    localStorage.setItem(readStorageKey("2026-08-04"), JSON.stringify(["item-1", "stale-id"]));

    const restored = loadScopedReadIds(localStorage, "2026-08-04", ["item-1", "item-2"]);

    expect([...restored]).toEqual(["item-1"]);
  });

  it("recognizes only the transition caused by opening the last unread item", () => {
    const read = new Set(["item-1", "item-2"]);
    expect(completesDigest(read, "item-3", ["item-1", "item-2", "item-3"])).toBe(true);
    expect(completesDigest(new Set([...read, "item-3"]), "item-3", ["item-1", "item-2", "item-3"])).toBe(false);
    expect(completionStorageKey("2026-08-04")).not.toBe(completionStorageKey("2026-08-05"));
  });
});
