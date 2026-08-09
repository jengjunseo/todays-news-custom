import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DigestRepository } from "@/lib/db/repositories/digest-repository";

function fakeClient(data: unknown) {
  const calls: Array<[string, unknown]> = [];
  const builder = {
    select(value: string) {
      calls.push(["select", value]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push([`eq:${column}`, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push([`order:${column}`, options]);
      return Promise.resolve({ data, error: null });
    },
    maybeSingle() {
      calls.push(["maybeSingle", true]);
      return Promise.resolve({ data, error: null });
    },
  };
  return {
    calls,
    client: { from: () => builder } as unknown as SupabaseClient,
  };
}

describe("digest repository", () => {
  it("only returns a published digest for the requested date", async () => {
    const row = {
      id: "digest-1",
      source_date: "2026-08-01",
      status: "published",
      item_count: 5,
      reading_minutes: 8,
      generated_at: null,
      published_at: null,
    };
    const { client, calls } = fakeClient(row);
    const result = await new DigestRepository(client).findPublishedByDate("2026-08-01");
    expect(result).toEqual(row);
    expect(calls).toContainEqual(["eq:source_date", "2026-08-01"]);
    expect(calls).toContainEqual(["eq:status", "published"]);
  });

  it("lists published digests newest first", async () => {
    const { client, calls } = fakeClient([]);
    await new DigestRepository(client).listPublished();
    expect(calls).toContainEqual(["eq:status", "published"]);
    expect(calls).toContainEqual(["order:source_date", { ascending: false }]);
  });
});
