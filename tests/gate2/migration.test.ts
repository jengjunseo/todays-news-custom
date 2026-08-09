import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DataType, newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

function createDatabase() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
    impure: true,
  });
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/202608020001_initial_schema.sql"),
    "utf8",
  )
    .replace("create extension if not exists pgcrypto;", "")
    // pg-mem does not implement PostgreSQL RLS syntax. The committed SQL is
    // separately asserted below so the product security contract is retained.
    .replace(/alter table \w+ enable row level security;/g, "");
  database.public.none(sql);
  return database;
}

describe("initial Supabase schema", () => {
  it("parses and creates the required tables", () => {
    const database = createDatabase();
    const tables = database.public.many(
      "select table_name from information_schema.tables where table_schema = 'public'",
    ) as Array<{ table_name: string }>;
    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "source_articles",
        "story_clusters",
        "daily_digests",
        "digest_items",
        "daily_nudges",
        "reflections",
        "read_states",
        "notification_settings",
        "push_subscriptions",
        "push_deliveries",
        "pipeline_runs",
      ]),
    );
  });

  it("isolates one digest per preset and date", () => {
    const database = createDatabase();
    database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('girls-band-cry', '걸즈 밴드 크라이', '2026-08-01', 'published')");
    database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('wonju', '원주', '2026-08-01', 'published')");
    expect(() =>
      database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('girls-band-cry', '걸즈 밴드 크라이', '2026-08-01', 'published')"),
    ).toThrow();
  });

  it("keeps every server table behind RLS", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202608020001_initial_schema.sql"), "utf8");
    for (const table of ["source_articles", "story_clusters", "daily_digests", "digest_items", "reflections", "read_states"]) {
      expect(sql).toContain(`alter table ${table} enable row level security;`);
    }
  });
});
