import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import monstera from "@/assets/monstera-spots.jpg";
import ficus from "@/assets/fiddle-leaf.jpg";

export type Plant = Tables<"plants">;
export type Reminder = Tables<"care_reminders">;
export type PlantInput = Pick<Plant, "name" | "variety" | "location" | "health_status" | "sunlight" | "soil" | "humidity" | "watering_advice" | "care_notes">;
export type ReminderInput = Pick<Reminder, "plant_id" | "kind" | "title" | "next_due_at" | "frequency_days" | "amount_ml" | "enabled">;

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

function demoData(): { plants: Plant[]; reminders: Reminder[] } {
  const now = Date.now(), base = { user_id: "demo", created_at: iso(now), updated_at: iso(now) };
  const plants: Plant[] = [
    { ...base, id: "d1", name: "Monstera", variety: "Monstera deliciosa", location: "Living room", image_url: monstera, health_status: "watch", sunlight: "Bright, indirect", soil: "Chunky aroid mix", humidity: "60–70%", watering_advice: "When top 3 cm are dry", care_notes: null },
    { ...base, id: "d2", name: "Fiddle Leaf Fig", variety: "Ficus lyrata", location: "Bedroom", image_url: ficus, health_status: "healthy", sunlight: "Bright, some direct sun", soil: "Well-draining loam", humidity: "40–60%", watering_advice: "Every 10–12 days", care_notes: null },
  ];
  const reminders: Reminder[] = [
    { ...base, id: "r1", plant_id: "d1", kind: "water", title: "", next_due_at: iso(now - 3600000), frequency_days: 7, amount_ml: 250, enabled: true, last_completed_at: null, last_notified_at: null },
    { ...base, id: "r2", plant_id: "d2", kind: "fertilize", title: "", next_due_at: iso(now + 3 * DAY), frequency_days: 30, amount_ml: null, enabled: true, last_completed_at: null, last_notified_at: null },
  ];
  return { plants, reminders };
}

async function compress(file: File): Promise<Blob> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that image."))), "image/jpeg", 0.85));
}

const isDirect = (u: string) => /^(https?:|data:|blob:|\/)/.test(u);

export function useGarden(mode: "live" | "demo" | "off") {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const resolvePhotos = useCallback(async (list: Plant[]) => {
    const out: Record<string, string> = {};
    const paths = list.filter((p) => p.image_url && !isDirect(p.image_url));
    list.forEach((p) => { if (p.image_url && isDirect(p.image_url)) out[p.id] = p.image_url; });
    if (paths.length) {
      const { data } = await supabase.storage.from("plant-photos").createSignedUrls(paths.map((p) => p.image_url!), 3600);
      data?.forEach((d, i) => { if (d.signedUrl) out[paths[i]!.id] = d.signedUrl; });
    }
    setPhotos(out);
  }, []);

  const reload = useCallback(async () => {
    if (mode !== "live") return;
    const [p, r] = await Promise.all([
      supabase.from("plants").select("*").order("created_at"),
      supabase.from("care_reminders").select("*").order("next_due_at"),
    ]);
    if (p.error || r.error) setError("Couldn't load your garden. Please refresh.");
    setPlants(p.data ?? []); setReminders(r.data ?? []);
    await resolvePhotos(p.data ?? []);
    setLoading(false);
  }, [mode, resolvePhotos]);

  useEffect(() => {
    if (mode === "off") return;
    if (mode === "demo") { const d = demoData(); setPlants(d.plants); setReminders(d.reminders); resolvePhotos(d.plants); setLoading(false); return; }
    reload();
  }, [mode, reload, resolvePhotos]);

  async function uid() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Please sign in again.");
    return data.user.id;
  }

  const savePlant = async (input: PlantInput, id?: string, photo?: File) => {
    if (mode === "demo") {
      const img = photo ? URL.createObjectURL(photo) : undefined;
      const now = new Date().toISOString();
      const next = id
        ? plants.map((p) => (p.id === id ? { ...p, ...input, image_url: img ?? p.image_url } : p))
        : [...plants, { ...input, id: crypto.randomUUID(), user_id: "demo", image_url: img ?? null, created_at: now, updated_at: now }];
      setPlants(next); await resolvePhotos(next); return;
    }
    const user = await uid();
    let image_url: string | undefined;
    if (photo) {
      const path = `${user}/${crypto.randomUUID()}.jpg`;
      const { error: e } = await supabase.storage.from("plant-photos").upload(path, await compress(photo), { contentType: "image/jpeg" });
      if (e) throw new Error("Photo upload failed. Please try again.");
      image_url = path;
    }
    const row = { ...input, ...(image_url ? { image_url } : {}) };
    const { error: e } = id
      ? await supabase.from("plants").update(row).eq("id", id)
      : await supabase.from("plants").insert({ ...row, user_id: user });
    if (e) throw new Error("Couldn't save this plant.");
    await reload();
  };

  const deletePlant = async (id: string) => {
    if (mode === "demo") { setPlants(plants.filter((p) => p.id !== id)); setReminders(reminders.filter((r) => r.plant_id !== id)); return; }
    const p = plants.find((x) => x.id === id);
    await supabase.from("diagnoses").update({ plant_id: null }).eq("plant_id", id);
    await supabase.from("watering_schedules").delete().eq("plant_id", id);
    const { error: e } = await supabase.from("plants").delete().eq("id", id);
    if (e) throw new Error("Couldn't delete this plant.");
    if (p?.image_url && !isDirect(p.image_url)) await supabase.storage.from("plant-photos").remove([p.image_url]);
    await reload();
  };

  const saveReminder = async (input: ReminderInput, id?: string) => {
    if (mode === "demo") {
      const now = new Date().toISOString();
      setReminders((id ? reminders.map((r) => (r.id === id ? { ...r, ...input, last_notified_at: null } : r))
        : [...reminders, { ...input, id: crypto.randomUUID(), user_id: "demo", created_at: now, updated_at: now, last_completed_at: null, last_notified_at: null }])
        .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at)));
      return;
    }
    const user = await uid();
    const { error: e } = id
      ? await supabase.from("care_reminders").update({ ...input, last_notified_at: null }).eq("id", id)
      : await supabase.from("care_reminders").insert({ ...input, user_id: user });
    if (e) throw new Error("Couldn't save this reminder.");
    await reload();
  };

  const deleteReminder = async (id: string) => {
    if (mode === "demo") { setReminders(reminders.filter((r) => r.id !== id)); return; }
    await supabase.from("care_reminders").delete().eq("id", id);
    await reload();
  };

  const completeReminder = async (r: Reminder) => {
    const now = Date.now();
    const next = iso(Math.max(new Date(r.next_due_at).getTime(), now - r.frequency_days * DAY) + r.frequency_days * DAY > now
      ? Math.max(new Date(r.next_due_at).getTime(), now) + r.frequency_days * DAY - (new Date(r.next_due_at).getTime() > now ? 0 : 0)
      : now + r.frequency_days * DAY);
    const patch = { last_completed_at: iso(now), next_due_at: next, last_notified_at: null };
    if (mode === "demo") { setReminders(reminders.map((x) => (x.id === r.id ? { ...x, ...patch } : x))); return; }
    await supabase.from("care_reminders").update(patch).eq("id", r.id);
    await reload();
  };

  return { plants, reminders, photos, loading, error, savePlant, deletePlant, saveReminder, deleteReminder, completeReminder };
}
