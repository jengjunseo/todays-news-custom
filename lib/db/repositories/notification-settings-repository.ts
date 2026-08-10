import { getPostgres, type PostgresClient } from "@/lib/db/postgres";
import type { NotificationSettings } from "@/lib/settings/notification-settings";

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function normalizeSettings(row: NotificationSettings): NotificationSettings {
  return {
    ...row,
    morning_time: normalizeTime(row.morning_time),
    perspective_time: normalizeTime(row.perspective_time),
    evening_time: normalizeTime(row.evening_time),
  };
}

export class NotificationSettingsRepository {
  constructor(private readonly sql: PostgresClient = getPostgres()) {}

  async get() {
    const rows = await this.sql<NotificationSettings[]>`
      select morning_enabled, morning_time::text, perspective_enabled,
        perspective_time::text, evening_enabled, evening_time::text,
        timezone
      from notification_settings
      where singleton = true
      limit 1
    `;
    if (!rows[0]) throw new Error("notification_settings row is missing");
    return normalizeSettings(rows[0]);
  }

  async upsert(settings: NotificationSettings, updatedAt = new Date()) {
    const rows = await this.sql<NotificationSettings[]>`
      insert into notification_settings (
        singleton, morning_enabled, morning_time, perspective_enabled,
        perspective_time, evening_enabled, evening_time, timezone, updated_at
      ) values (
        true, ${settings.morning_enabled}, ${settings.morning_time},
        ${settings.perspective_enabled}, ${settings.perspective_time},
        ${settings.evening_enabled}, ${settings.evening_time},
        ${settings.timezone}, ${updatedAt}
      )
      on conflict (singleton) do update set
        morning_enabled = excluded.morning_enabled,
        morning_time = excluded.morning_time,
        perspective_enabled = excluded.perspective_enabled,
        perspective_time = excluded.perspective_time,
        evening_enabled = excluded.evening_enabled,
        evening_time = excluded.evening_time,
        timezone = excluded.timezone,
        updated_at = excluded.updated_at
      returning morning_enabled, morning_time::text, perspective_enabled,
        perspective_time::text, evening_enabled, evening_time::text,
        timezone
    `;
    return normalizeSettings(rows[0]!);
  }
}
