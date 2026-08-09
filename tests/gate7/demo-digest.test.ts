import { describe, expect, it } from "vitest";

import { getDemoDigest } from "@/lib/demo/digest";
import { NEWSPAPER_PRESETS } from "@/lib/presets";

describe("preset demo papers", () => {
  it.each(NEWSPAPER_PRESETS)("builds $id through the same grounded core", async (preset) => {
    const digest = await getDemoDigest(preset.id);
    expect(digest.presetId).toBe(preset.id);
    expect(digest.items).toHaveLength(preset.editorial.desiredItemCount);
    expect(digest.nudges).toHaveLength(3);
    expect(new Set(digest.items.map((item) => item.category))).toEqual(
      new Set(preset.sections.map((section) => section.id)),
    );
    expect(digest.items.every((item) => item.sources.length >= 1)).toBe(true);
    expect(digest.items.flatMap((item) => item.sources).every((source) => source.url.startsWith("https://"))).toBe(true);
  });
});
