import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_NOTIFICATION_SETTINGS = {
  morning_enabled: true,
  morning_time: "07:30",
  perspective_enabled: true,
  perspective_time: "12:40",
  evening_enabled: true,
  evening_time: "18:30",
  timezone: "Asia/Seoul",
} as const;

export class NotificationSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async get() {
    const { data, error } = await this.client
      .from("notification_settings")
      .select("morning_enabled,morning_time,perspective_enabled,perspective_time,evening_enabled,evening_time,timezone,updated_at")
      .eq("singleton", true)
      .single();

    if (error) throw error;
    return data;
  }
}
