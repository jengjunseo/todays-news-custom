import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DataType, newDb, type IMemoryDb } from "pg-mem";

import type { PostgresClient } from "@/lib/db/postgres";

export function createSchemaDatabase() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => crypto.randomUUID(),
    impure: true,
  });
  database.public.none(
    readFileSync(
      resolve(process.cwd(), "db/migrations/202608020001_initial_schema.sql"),
      "utf8",
    ),
  );
  return database;
}

function sqlLiteral(value: unknown) {
  if (value === null) return "null";
  if (value instanceof Date) {
    return `'${value.toISOString().replaceAll("'", "''")}'::timestamptz`;
  }
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new TypeError(`Unsupported pg-mem SQL parameter: ${String(value)}`);
}

export function createPgMemSql(database: IMemoryDb) {
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const statement = strings.reduce(
      (result, part, index) => result + part + (index < values.length ? sqlLiteral(values[index]) : ""),
      "",
    // pg-mem cannot cast date/timestamptz to text. The production PostgreSQL
    // query keeps those casts; this adapter mirrors the postgres driver's text
    // result for the isolated test database.
    ).replaceAll("::text", "");
    const rows = database.public.query(statement).rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? key.includes("date")
            ? value.toISOString().slice(0, 10)
            : value.toISOString()
          : value,
      ])),
    );
    return Promise.resolve(rows);
  };
  return tag as unknown as PostgresClient;
}

export function seedDigestItem(database: IMemoryDb) {
  database.public.none(`
    insert into story_clusters (
      id, preset_id, section_id, target_date, representative_title,
      deterministic_score, article_count, source_count
    ) values ('cluster-1', 'wonju', 'civic', '2026-08-01', '원주 정책 변화', 80, 1, 1);

    insert into daily_digests (
      id, preset_id, preset_name, source_date, status, item_count, reading_minutes
    ) values (
      '11111111-1111-4111-8111-111111111111', 'wonju', '원주',
      '2026-08-01', 'published', 1, 2
    );

    insert into digest_items (
      id, digest_id, cluster_id, section_id, rank, headline, one_line,
      overview, key_points_json, analogy, why_it_matters,
      socratic_question, fact_status, confidence, source_ids_json
    ) values (
      'item-1', '11111111-1111-4111-8111-111111111111', 'cluster-1',
      'civic', 1, '원주 정책 변화', '핵심 한 줄', '무슨 일이 있었나',
      '["핵심"]'::jsonb, '쉽게 보면', '왜 중요할까', '생각해보기',
      'confirmed', 0.9, '[]'::jsonb
    );
  `);
}
