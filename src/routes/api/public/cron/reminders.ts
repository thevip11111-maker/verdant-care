import { createFileRoute } from "@tanstack/react-router";

const KIND_LABEL: Record<string, string> = { water: "Water", fertilize: "Fertilize", mist: "Mist", prune: "Prune", repot: "Repot", custom: "Care" };

export const Route = createFileRoute("/api/public/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: valid } = await supabaseAdmin.rpc("verify_reminder_cron_token", { _token: token });
        if (!valid) return new Response("Unauthorized", { status: 401 });
        const { sendPush } = await import("@/lib/webpush.server");

        const { data: due } = await supabaseAdmin
          .from("care_reminders")
          .select("id, user_id, kind, title, amount_ml, next_due_at, last_notified_at, plants(name)")
          .eq("enabled", true)
          .lte("next_due_at", new Date().toISOString())
          .limit(200);

        let sent = 0;
        for (const r of due ?? []) {
          if (r.last_notified_at && r.last_notified_at >= r.next_due_at) continue;
          // Claim atomically so concurrent sweeps never double-notify.
          const { data: claimed } = await supabaseAdmin
            .from("care_reminders")
            .update({ last_notified_at: new Date().toISOString() })
            .eq("id", r.id)
            .eq("next_due_at", r.next_due_at)
            .or(r.last_notified_at ? `last_notified_at.lt.${r.next_due_at}` : "last_notified_at.is.null")
            .select("id");
          if (!claimed?.length) continue;
          const plant = (r.plants as { name: string } | null)?.name;
          const what = r.title || `${KIND_LABEL[r.kind] ?? "Care"}${plant ? ` ${plant}` : ""}`;
          const body = r.kind === "water" && r.amount_ml ? `${what} · ${r.amount_ml} ml` : what;
          const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", r.user_id);
          for (const s of subs ?? []) {
            try {
              const status = await sendPush(s, { title: "Plant care is due", body, tag: r.id, url: "/" });
              if (status === 404 || status === 410) await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
              else if (status < 300) sent++;
            } catch (e) { console.error("push failed", e); }
          }
        }
        return Response.json({ ok: true, sent });
      },
    },
  },
});
