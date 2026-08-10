import { getPostgres, type PostgresClient } from "@/lib/db/postgres";
import { DEFAULT_PRESET_ID } from "@/lib/presets";

export type DigestRecord = {
  id: string;
  preset_id: string;
  preset_name: string;
  source_date: string;
  status: "generating" | "published" | "failed";
  item_count: number;
  reading_minutes: number;
  generated_at: string | null;
  published_at: string | null;
};

export class DigestRepository {
  constructor(private readonly sql: PostgresClient = getPostgres()) {}

  async findPublishedByDate(presetIdOrSourceDate: string, maybeSourceDate?: string) {
    const presetId = maybeSourceDate ? presetIdOrSourceDate : DEFAULT_PRESET_ID;
    const sourceDate = maybeSourceDate ?? presetIdOrSourceDate;
    const rows = await this.sql<DigestRecord[]>`
      select id::text, preset_id, preset_name, source_date::text, status,
        item_count, reading_minutes, generated_at::text, published_at::text
      from daily_digests
      where preset_id = ${presetId}
        and source_date = ${sourceDate}
        and status = 'published'
      limit 1
    `;
    return rows[0] ?? null;
  }

  async listPublished(presetId = DEFAULT_PRESET_ID) {
    return this.sql<DigestRecord[]>`
      select id::text, preset_id, preset_name, source_date::text, status,
        item_count, reading_minutes, generated_at::text, published_at::text
      from daily_digests
      where preset_id = ${presetId} and status = 'published'
      order by source_date desc
    `;
  }
}
