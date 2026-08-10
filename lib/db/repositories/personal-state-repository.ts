import { getPostgres, type PostgresClient } from "@/lib/db/postgres";

export type ActivePushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export class PersonalStateRepository {
  constructor(private readonly sql: PostgresClient = getPostgres()) {}

  async upsertReflection(digestItemId: string, content: string, updatedAt = new Date()) {
    await this.sql`
      insert into reflections (digest_item_id, content, updated_at)
      values (${digestItemId}, ${content}, ${updatedAt})
      on conflict (digest_item_id) do update set
        content = excluded.content,
        updated_at = excluded.updated_at
    `;
  }

  async markRead(digestItemId: string, readAt = new Date()) {
    await this.sql`
      insert into read_states (digest_item_id, read_at)
      values (${digestItemId}, ${readAt})
      on conflict (digest_item_id) do update set
        read_at = excluded.read_at
    `;
  }

  async upsertPushSubscription(
    subscription: ActivePushSubscription,
    lastSeenAt = new Date(),
  ) {
    await this.sql`
      insert into push_subscriptions (endpoint, p256dh, auth, last_seen_at, revoked_at)
      values (
        ${subscription.endpoint}, ${subscription.p256dh}, ${subscription.auth},
        ${lastSeenAt}, null
      )
      on conflict (endpoint) do update set
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_seen_at = excluded.last_seen_at,
        revoked_at = null
    `;
  }

  async revokePushSubscription(endpoint: string, revokedAt = new Date()) {
    await this.sql`
      update push_subscriptions
      set revoked_at = ${revokedAt}
      where endpoint = ${endpoint}
    `;
  }

  async findActivePushSubscription(endpoint: string) {
    const rows = await this.sql<ActivePushSubscription[]>`
      select endpoint, p256dh, auth
      from push_subscriptions
      where endpoint = ${endpoint} and revoked_at is null
      limit 1
    `;
    return rows[0] ?? null;
  }
}
