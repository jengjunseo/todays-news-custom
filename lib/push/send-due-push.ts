import { getPostgres } from "@/lib/db/postgres";
import type { PushPayload, PushSubscriptionInput } from "@/lib/push/schemas";
import { isExpiredPushError, sendWebPush } from "@/lib/push/send";
import { toKstDateKey } from "@/lib/time/kst";

type NudgeType = "morning" | "perspective" | "evening";

export type DueNudge = {
  id: string;
  presetId?: string;
  sourceDate: string;
  type: NudgeType;
  title: string;
  notificationBody: string;
  scheduledFor: string;
};

export type NotificationSettings = {
  morning_enabled: boolean;
  morning_time: string;
  perspective_enabled: boolean;
  perspective_time: string;
  evening_enabled: boolean;
  evening_time: string;
};

export type StoredSubscription = PushSubscriptionInput & { id: string };

export interface DuePushStore {
  getSettings(): Promise<NotificationSettings>;
  listPendingNudges(now: Date): Promise<DueNudge[]>;
  listActiveSubscriptions(): Promise<StoredSubscription[]>;
  claimDelivery(input: { nudgeId: string; subscriptionId: string; idempotencyKey: string }): Promise<boolean>;
  completeDelivery(idempotencyKey: string, status: "sent" | "failed" | "revoked", error?: string): Promise<void>;
  revokeSubscription(subscriptionId: string): Promise<void>;
  completeNudge(nudgeId: string, status: "sent" | "skipped" | "failed"): Promise<void>;
}

export type PushSender = (subscription: PushSubscriptionInput, payload: PushPayload) => Promise<unknown>;

function minutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function kstClock(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function nudgeSetting(
  type: NudgeType,
  settings: NotificationSettings,
) {
  if (type === "morning") return { enabled: settings.morning_enabled, time: settings.morning_time };
  if (type === "perspective") return { enabled: settings.perspective_enabled, time: settings.perspective_time };
  return { enabled: settings.evening_enabled, time: settings.evening_time };
}

export function isNudgeDue(nudge: DueNudge, settings: NotificationSettings, now: Date) {
  const setting = nudgeSetting(nudge.type, settings);
  return (
    setting.enabled &&
    toKstDateKey(new Date(nudge.scheduledFor)) === toKstDateKey(now) &&
    kstClock(now) >= minutes(setting.time)
  );
}

export function pushIdempotencyKey(nudge: DueNudge, subscriptionId: string) {
  return `push:${nudge.presetId ?? "legacy"}:${nudge.sourceDate}:${nudge.type}:${subscriptionId}`;
}

export async function sendDuePush(options: {
  now?: Date;
  store?: DuePushStore;
  sender?: PushSender;
} = {}) {
  const now = options.now ?? new Date();
  const store = options.store ?? new PostgresDuePushStore();
  const sender = options.sender ?? sendWebPush;
  const [settings, nudges, subscriptions] = await Promise.all([
    store.getSettings(),
    store.listPendingNudges(now),
    store.listActiveSubscriptions(),
  ]);
  const metrics = { sent: 0, duplicate: 0, skipped: 0, failed: 0, revoked: 0 };

  for (const nudge of nudges) {
    const setting = nudgeSetting(nudge.type, settings);
    if (!setting.enabled) {
      await store.completeNudge(nudge.id, "skipped");
      metrics.skipped += 1;
      continue;
    }
    if (!isNudgeDue(nudge, settings, now)) continue;
    if (subscriptions.length === 0) {
      await store.completeNudge(nudge.id, "skipped");
      metrics.skipped += 1;
      continue;
    }

    let sentForNudge = 0;
    for (const subscription of subscriptions) {
      const key = pushIdempotencyKey(nudge, subscription.id);
      if (!(await store.claimDelivery({ nudgeId: nudge.id, subscriptionId: subscription.id, idempotencyKey: key }))) {
        metrics.duplicate += 1;
        continue;
      }
      try {
        await sender(subscription, {
          title: nudge.title,
          body: nudge.notificationBody,
          deepLink: `/insights?paper=${encodeURIComponent(nudge.presetId ?? "girls-band-cry")}&focus=${nudge.type}`,
          nudgeId: nudge.id,
          type: nudge.type,
        });
        await store.completeDelivery(key, "sent");
        sentForNudge += 1;
        metrics.sent += 1;
      } catch (error) {
        if (isExpiredPushError(error)) {
          await store.revokeSubscription(subscription.id);
          await store.completeDelivery(key, "revoked", "expired subscription");
          metrics.revoked += 1;
        } else {
          await store.completeDelivery(key, "failed", error instanceof Error ? error.message : "push failed");
          metrics.failed += 1;
        }
      }
    }
    await store.completeNudge(nudge.id, sentForNudge > 0 ? "sent" : metrics.failed > 0 ? "failed" : "skipped");
  }
  return metrics;
}

export class PostgresDuePushStore implements DuePushStore {
  private readonly sql = getPostgres();

  async getSettings() {
    const rows = await this.sql<NotificationSettings[]>`
      select morning_enabled, morning_time::text, perspective_enabled,
        perspective_time::text, evening_enabled, evening_time::text
      from notification_settings where singleton = true
    `;
    if (!rows[0]) throw new Error("notification_settings가 없습니다.");
    return rows[0];
  }

  async listPendingNudges(now: Date) {
    const rows = await this.sql<DueNudge[]>`
      select n.id, d.preset_id as "presetId", d.source_date::text as "sourceDate", n.type,
        n.title, n.notification_body as "notificationBody",
        n.scheduled_for::text as "scheduledFor"
      from daily_nudges n
      join daily_digests d on d.id = n.digest_id
      where n.status = 'pending'
        and n.scheduled_for >= ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
        and n.scheduled_for <= ${new Date(now.getTime() + 24 * 60 * 60 * 1000)}
    `;
    return rows;
  }

  async listActiveSubscriptions() {
    const rows = await this.sql<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>`
      select id::text, endpoint, p256dh, auth from push_subscriptions where revoked_at is null
    `;
    return rows.map((row) => ({ id: row.id, endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }));
  }

  async claimDelivery(input: { nudgeId: string; subscriptionId: string; idempotencyKey: string }) {
    const rows = await this.sql`
      insert into push_deliveries (nudge_id, subscription_id, idempotency_key, status)
      values (${input.nudgeId}, ${input.subscriptionId}, ${input.idempotencyKey}, 'pending')
      on conflict (idempotency_key) do nothing
      returning id
    `;
    return rows.length === 1;
  }

  async completeDelivery(idempotencyKey: string, status: "sent" | "failed" | "revoked", error?: string) {
    await this.sql`
      update push_deliveries set status = ${status}, sent_at = ${status === "sent" ? new Date() : null}, error_message = ${error ?? null}
      where idempotency_key = ${idempotencyKey}
    `;
  }

  async revokeSubscription(subscriptionId: string) {
    await this.sql`update push_subscriptions set revoked_at = now() where id = ${subscriptionId}`;
  }

  async completeNudge(nudgeId: string, status: "sent" | "skipped" | "failed") {
    await this.sql`
      update daily_nudges set status = ${status}, sent_at = ${status === "sent" ? new Date() : null}
      where id = ${nudgeId}
    `;
  }
}
