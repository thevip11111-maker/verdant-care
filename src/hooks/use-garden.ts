import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Plant = Tables<"plants">;
export type Reminder = Tables<"care_reminders">;
export type PlantInput = Pick<Plant, "name" | "variety" | "location" | "health_status" | "sunlight" | "soil" | "humidity" | "watering_advice" | "care_notes">;
export type ReminderInput = Pick<Reminder, "plant_id" | "kind" | "title" | "next_due_at" | "frequency_days" | "amount_ml" | "enabled">;

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

const DEMO_KEY = "aegis-guest-garden";
function loadGuest(): { plants: Plant[]; reminders: Reminder[] } {
  try { const v = JSON.parse(localStorage.getItem(DEMO_KEY) ?? ""); return { plants: v.plants ?? [], reminders: v.reminders ?? [] }; } catch { return { plants: [], reminders: [] }; }
}
const toDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });

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
    if (mode === "demo") { const d = loadGuest(); setPlants(d.plants); setReminders(d.reminders); resolvePhotos(d.plants); setLoading(false); return; }
    reload();
  }, [mode, reload, resolvePhotos]);

  useEffect(() => {
    if (mode === "demo" && !loading) localStorage.setItem(DEMO_KEY, JSON.stringify({ plants, reminders }));
  }, [mode, loading, plants, reminders]);

  async function uid() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Please sign in again.");
    return data.user.id;
  }

  const savePlant = async (input: PlantInput, id?: string, photo?: File) => {
    if (mode === "demo") {
      const img = photo ? await toDataUrl(await compress(photo)) : undefined;
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
    const next = iso(Math.max(new Date(r.next_due_at).getTime(), now) + r.frequency_days * DAY);
    const patch = { last_completed_at: iso(now), next_due_at: next, last_notified_at: null };
    if (mode === "demo") { setReminders(reminders.map((x) => (x.id === r.id ? { ...x, ...patch } : x))); return; }
    await supabase.from("care_reminders").update(patch).eq("id", r.id);
    await reload();
  };

  return { plants, reminders, photos, loading, error, savePlant, deletePlant, saveReminder, deleteReminder, completeReminder };
}
