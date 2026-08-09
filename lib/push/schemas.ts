import { z } from "zod";

export const PushSubscriptionInputSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export const PushPayloadSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(200),
  deepLink: z.string().regex(/^\/(?!\/)[^\s]*$/),
  nudgeId: z.string().min(1).max(128),
  type: z.enum(["morning", "perspective", "evening", "test"]),
});

export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInputSchema>;
export type PushPayload = z.infer<typeof PushPayloadSchema>;
