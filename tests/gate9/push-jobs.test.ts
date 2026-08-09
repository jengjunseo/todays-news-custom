import { describe, expect, it, vi } from "vitest";

import {
  isNudgeDue,
  pushIdempotencyKey,
  sendDuePush,
  type DueNudge,
  type DuePushStore,
  type NotificationSettings,
  type StoredSubscription,
} from "@/lib/push/send-due-push";

const settings: NotificationSettings = {
  morning_enabled: true,
  morning_time: "07:30",
  perspective_enabled: true,
  perspective_time: "12:40",
  evening_enabled: true,
  evening_time: "18:30",
};

const nudge: DueNudge = {
  id: "nudge-1",
  sourceDate: "2026-08-01",
  type: "morning",
  title: "어제의 핵심",
  notificationBody: "오늘 알아둘 변화입니다.",
  scheduledFor: "2026-08-01T22:30:00.000Z",
};

class MemoryPushStore implements DuePushStore {
  claimed = new Set<string>();
  completedNudges: string[] = [];
  deliveries: string[] = [];
  constructor(
    readonly currentSettings = settings,
    readonly nudges = [nudge],
    readonly subscriptions: StoredSubscription[] = [
      { id: "sub-1", endpoint: "https://push.example/sub", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } },
    ],
  ) {}
  async getSettings() { return this.currentSettings; }
  async listPendingNudges() { return this.nudges; }
  async listActiveSubscriptions() { return this.subscriptions; }
  async claimDelivery({ idempotencyKey }: { idempotencyKey: string }) {
    if (this.claimed.has(idempotencyKey)) return false;
    this.claimed.add(idempotencyKey);
    return true;
  }
  async completeDelivery(key: string) { this.deliveries.push(key); }
  async revokeSubscription() {}
  async completeNudge(id: string, status: "sent" | "skipped" | "failed") { this.completedNudges.push(`${id}:${status}`); }
}

describe("due Push scheduler", () => {
  it("detects due time in Asia/Seoul and respects disabled settings", () => {
    const now = new Date("2026-08-01T22:31:00.000Z");
    expect(isNudgeDue(nudge, settings, now)).toBe(true);
    expect(isNudgeDue(nudge, { ...settings, morning_enabled: false }, now)).toBe(false);
  });

  it("uses the documented idempotency key", () => {
    expect(pushIdempotencyKey(nudge, "sub-1")).toBe("push:legacy:2026-08-01:morning:sub-1");
  });

  it("does not deliver the same Push twice", async () => {
    const store = new MemoryPushStore();
    const sender = vi.fn(async () => undefined);
    const now = new Date("2026-08-01T22:31:00.000Z");
    await sendDuePush({ now, store, sender });
    await sendDuePush({ now, store, sender });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("a Push failure does not change or invalidate digest state", async () => {
    const store = new MemoryPushStore();
    await sendDuePush({
      now: new Date("2026-08-01T22:31:00.000Z"),
      store,
      sender: vi.fn(async () => { throw new Error("push unavailable"); }),
    });
    expect(store.completedNudges).toContain("nudge-1:failed");
  });
});
