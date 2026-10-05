import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLIC_KEY } from "./vapid";

export type PushState = "unsupported" | "denied" | "on" | "off";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function getPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(): Promise<string | null> {
  if (!supported()) return "This browser doesn't support notifications. On iPhone, add the app to your Home Screen first.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications are blocked. Allow them in your browser settings.";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "Sign in to turn on reminders.";
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: auth.user.id, endpoint: sub.endpoint, p256dh: json.keys?.["p256dh"] ?? "", auth: json.keys?.["auth"] ?? "" },
    { onConflict: "endpoint" },
  );
  return error ? "Couldn't save this device. Please try again." : null;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
}
