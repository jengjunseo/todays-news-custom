import { timingSafeEqual } from "node:crypto";

export function isValidCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const received =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret") ??
    "";
  const left = Buffer.from(received);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}
