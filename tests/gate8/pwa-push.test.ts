import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { isExpiredPushError } from "@/lib/push/send";
import { PushPayloadSchema, PushSubscriptionInputSchema } from "@/lib/push/schemas";

describe("PWA and Web Push contracts", () => {
  it("provides standalone manifest icons including maskable", () => {
    const value = manifest();
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/");
    expect(value.icons).toEqual(expect.arrayContaining([expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512" }), expect.objectContaining({ purpose: "maskable" })]));
  });

  it("service worker handles offline, push and deep-link clicks", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain("clients.openWindow");
    expect(worker).toContain("client.focus");
    expect(worker).toContain("/offline");
  });

  it("validates subscriptions and same-origin deep links", () => {
    expect(PushSubscriptionInputSchema.safeParse({ endpoint: "https://push.example/sub", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } }).success).toBe(true);
    expect(PushPayloadSchema.safeParse({ title: "테스트", body: "본문", deepLink: "//evil.example", nudgeId: "n1", type: "test" }).success).toBe(false);
  });

  it("revokes only 404 and 410 subscriptions", () => {
    expect(isExpiredPushError({ statusCode: 404 })).toBe(true);
    expect(isExpiredPushError({ statusCode: 410 })).toBe(true);
    expect(isExpiredPushError({ statusCode: 500 })).toBe(false);
  });
});
