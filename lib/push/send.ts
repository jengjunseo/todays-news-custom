import webpush from "web-push";

import { PushPayloadSchema, type PushPayload, type PushSubscriptionInput } from "@/lib/push/schemas";

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID 공개키, 비밀키, subject가 필요합니다.");
  }
  if (!/^mailto:|^https:\/\//.test(subject)) {
    throw new Error("VAPID_SUBJECT는 mailto: 또는 https:// 형식이어야 합니다.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function isExpiredPushError(error: unknown) {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendWebPush(subscription: PushSubscriptionInput, payload: PushPayload) {
  configureWebPush();
  const validPayload = PushPayloadSchema.parse(payload);
  return webpush.sendNotification(subscription, JSON.stringify(validPayload), { TTL: 60 * 60 });
}
