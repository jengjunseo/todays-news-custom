import { describe, expect, it } from "vitest";

import { NotificationSettingsRepository } from "@/lib/db/repositories/notification-settings-repository";
import { PersonalStateRepository } from "@/lib/db/repositories/personal-state-repository";
import type { NotificationSettings } from "@/lib/settings/notification-settings";
import {
  createPgMemSql,
  createSchemaDatabase,
  seedDigestItem,
} from "@/tests/helpers/pg-mem";

describe("direct PostgreSQL personal persistence", () => {
  it("upserts one reflection per digest item and updates its content", async () => {
    const database = createSchemaDatabase();
    seedDigestItem(database);
    const repository = new PersonalStateRepository(createPgMemSql(database));

    await repository.upsertReflection("item-1", "처음 생각", new Date("2026-08-01T01:00:00Z"));
    await repository.upsertReflection("item-1", "고친 생각", new Date("2026-08-01T02:00:00Z"));

    expect(database.public.one("select count(*)::int as count, max(content) as content from reflections")).toEqual({
      count: 1,
      content: "고친 생각",
    });
  });

  it("idempotently updates read state for the same digest item", async () => {
    const database = createSchemaDatabase();
    seedDigestItem(database);
    const repository = new PersonalStateRepository(createPgMemSql(database));

    await repository.markRead("item-1", new Date("2026-08-01T01:00:00Z"));
    await repository.markRead("item-1", new Date("2026-08-01T02:00:00Z"));

    expect(database.public.one("select count(*)::int as count from read_states")).toEqual({ count: 1 });
    expect(new Date(database.public.one("select read_at from read_states").read_at).toISOString()).toBe("2026-08-01T02:00:00.000Z");
  });

  it("reads and upserts the singleton notification settings row", async () => {
    const database = createSchemaDatabase();
    const repository = new NotificationSettingsRepository(createPgMemSql(database));
    const settings: NotificationSettings = {
      morning_enabled: false,
      morning_time: "08:15",
      perspective_enabled: true,
      perspective_time: "13:20",
      evening_enabled: false,
      evening_time: "19:10",
      timezone: "Asia/Seoul",
    };

    expect((await repository.get()).morning_time).toBe("07:30");
    const saved = await repository.upsert(settings, new Date("2026-08-01T03:00:00Z"));

    expect(saved).toEqual(expect.objectContaining(settings));
    expect(await repository.get()).toEqual(expect.objectContaining(settings));
    expect(database.public.one("select count(*)::int as count from notification_settings")).toEqual({ count: 1 });
  });

  it("upserts, revives, and revokes a unique push endpoint", async () => {
    const database = createSchemaDatabase();
    const repository = new PersonalStateRepository(createPgMemSql(database));
    const endpoint = "https://push.example/subscription";

    await repository.upsertPushSubscription({ endpoint, p256dh: "old-key", auth: "old-auth" });
    await repository.revokePushSubscription(endpoint, new Date("2026-08-01T04:00:00Z"));
    expect(await repository.findActivePushSubscription(endpoint)).toBeNull();

    await repository.upsertPushSubscription({ endpoint, p256dh: "new-key", auth: "new-auth" });

    expect(await repository.findActivePushSubscription(endpoint)).toEqual({
      endpoint,
      p256dh: "new-key",
      auth: "new-auth",
    });
    expect(database.public.one("select count(*)::int as count from push_subscriptions")).toEqual({ count: 1 });
  });
});
