import { describe, expect, it } from "vitest";

import { DigestRepository } from "@/lib/db/repositories/digest-repository";
import { createPgMemSql, createSchemaDatabase } from "@/tests/helpers/pg-mem";

describe("direct PostgreSQL digest repository", () => {
  it("returns only the published digest for the requested preset and date", async () => {
    const database = createSchemaDatabase();
    database.public.none(`
      insert into daily_digests (preset_id, preset_name, source_date, status)
      values ('wonju', '원주', '2026-08-01', 'published');
      insert into daily_digests (preset_id, preset_name, source_date, status)
      values ('girls-band-cry', '걸즈 밴드 크라이', '2026-08-01', 'published');
    `);
    const repository = new DigestRepository(createPgMemSql(database));

    const result = await repository.findPublishedByDate("wonju", "2026-08-01");

    expect(result).toEqual(expect.objectContaining({
      preset_id: "wonju",
      source_date: "2026-08-01",
      status: "published",
    }));
  });

  it("lists published digests newest first", async () => {
    const database = createSchemaDatabase();
    database.public.none(`
      insert into daily_digests (preset_id, preset_name, source_date, status)
      values ('wonju', '원주', '2026-07-31', 'published');
      insert into daily_digests (preset_id, preset_name, source_date, status)
      values ('wonju', '원주', '2026-08-01', 'published');
    `);
    const repository = new DigestRepository(createPgMemSql(database));

    const result = await repository.listPublished("wonju");

    expect(result.map((row) => row.source_date)).toEqual(["2026-08-01", "2026-07-31"]);
  });
});
