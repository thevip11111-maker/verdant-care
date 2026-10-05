import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPush } = await import("./webpush.server");
    const { data: subs } = await context.supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", context.userId);
    if (!subs?.length) return { ok: false, error: "Notifications aren't turned on for this device yet." };
    let sent = 0;
    for (const s of subs) {
      try {
        const status = await sendPush(s, { title: "Aegis Agria", body: "Notifications are working. We'll remind you when plant care is due.", tag: "test" });
        if (status === 404 || status === 410) await context.supabase.from("push_subscriptions").delete().eq("id", s.id);
        else if (status < 300) sent++;
      } catch (e) { console.error("test push failed", e); }
    }
    return sent ? { ok: true as const } : { ok: false, error: "Couldn't reach this device. Try turning notifications off and on again." };
  });
