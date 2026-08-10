import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createSchemaDatabase } from "@/tests/helpers/pg-mem";

const migrationPath = resolve(
  process.cwd(),
  "db/migrations/202608020001_initial_schema.sql",
);

describe("provider-neutral PostgreSQL schema", () => {
  it("applies to an empty PostgreSQL-compatible database and creates every table", () => {
    const database = createSchemaDatabase();
    const tables = database.public.many(
      "select table_name from information_schema.tables where table_schema = 'public'",
    ) as Array<{ table_name: string }>;

    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "source_articles",
        "story_clusters",
        "cluster_articles",
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
    const database = createSchemaDatabase();
    database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('girls-band-cry', '걸즈 밴드 크라이', '2026-08-01', 'published')");
    database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('wonju', '원주', '2026-08-01', 'published')");
    expect(() => database.public.none("insert into daily_digests (preset_id, preset_name, source_date, status) values ('girls-band-cry', '걸즈 밴드 크라이', '2026-08-01', 'published')")).toThrow();
  });

  it("contains no database-host scheduling, Vault, Data API role, or RLS requirement", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const forbidden of ["supabase", "service_role", "pg_net", "pg_cron", "vault.", "enable row level security"]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
