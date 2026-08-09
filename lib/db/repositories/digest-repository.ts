import type { SupabaseClient } from "@supabase/supabase-js";
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
  constructor(private readonly client: SupabaseClient) {}

  async findPublishedByDate(presetIdOrSourceDate: string, maybeSourceDate?: string) {
    const presetId = maybeSourceDate ? presetIdOrSourceDate : DEFAULT_PRESET_ID;
    const sourceDate = maybeSourceDate ?? presetIdOrSourceDate;
    const { data, error } = await this.client
      .from("daily_digests")
      .select("id,preset_id,preset_name,source_date,status,item_count,reading_minutes,generated_at,published_at")
      .eq("preset_id", presetId)
      .eq("source_date", sourceDate)
      .eq("status", "published")
      .maybeSingle();

    if (error) throw error;
    return data as DigestRecord | null;
  }

  async listPublished(presetId = DEFAULT_PRESET_ID) {
    const { data, error } = await this.client
      .from("daily_digests")
      .select("id,preset_id,preset_name,source_date,status,item_count,reading_minutes,generated_at,published_at")
      .eq("preset_id", presetId)
      .eq("status", "published")
      .order("source_date", { ascending: false });

    if (error) throw error;
    return (data ?? []) as DigestRecord[];
  }
}
