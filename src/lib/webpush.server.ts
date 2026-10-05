import { buildPushPayload } from "@block65/webcrypto-web-push";
import { VAPID_PUBLIC_KEY } from "./vapid";

export type StoredSub = { endpoint: string; p256dh: string; auth: string };

/** Sends one encrypted web push. Returns the push service HTTP status. */
export async function sendPush(sub: StoredSub, message: { title: string; body: string; tag?: string; url?: string }) {
  const vapid = { subject: "mailto:alerts@aegisagria.app", publicKey: VAPID_PUBLIC_KEY, privateKey: process.env["VAPID_PRIVATE_KEY"]! };
  const payload = await buildPushPayload(
    { data: JSON.stringify(message), options: { ttl: 3600, urgency: "normal" } },
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    vapid,
  );
  const res = await fetch(sub.endpoint, payload);
  return res.status;
}
