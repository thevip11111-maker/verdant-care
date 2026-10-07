import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, CalendarClock, Camera, Droplets, Flame, LoaderCircle, MapPin, Pencil, Plus, Satellite, Scissors, Sprout, Sun, Thermometer, Trash2, Wind, CloudRain, Leaf, FlaskConical, Shovel, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Plant, PlantInput, Reminder, ReminderInput, useGarden } from "@/hooks/use-garden";
import { getSatelliteData, type SatelliteData } from "@/lib/nasa.functions";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";
import { sendTestPush } from "@/lib/push.functions";

type Garden = ReturnType<typeof useGarden>;

export const KINDS: Record<string, { label: string; icon: typeof Droplets }> = {
  water: { label: "Water", icon: Droplets }, fertilize: { label: "Fertilize", icon: FlaskConical }, mist: { label: "Mist", icon: Wind },
  prune: { label: "Prune", icon: Scissors }, repot: { label: "Repot", icon: Shovel }, custom: { label: "Custom", icon: CalendarClock },
};
const HEALTH: Record<string, string> = { healthy: "Healthy", watch: "Watch", sick: "Needs care" };
const field = "mt-1.5 flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function dueLabel(iso: string) {
  const d = new Date(iso), diff = d.getTime() - Date.now();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff < 0) return `Overdue · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const days = Math.floor((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  return days === 0 ? `Today · ${time}` : days === 1 ? `Tomorrow · ${time}` : `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}
export const reminderName = (r: Reminder, plants: Plant[]) => r.title || `${KINDS[r.kind]?.label ?? "Care"} ${plants.find((p) => p.id === r.plant_id)?.name ?? ""}`.trim();

export function PlantThumb({ src, name, className }: { src?: string | undefined; name: string; className: string }) {
  return src ? <img src={src} alt={name} loading="lazy" className={`${className} object-cover`} /> : <div className={`${className} grid place-items-center bg-moss/20 text-brand/60`} aria-label={name}><Sprout size={22} /></div>;
}

/* ---------------- Plant form ---------------- */
function PlantDialog({ open, onOpenChange, plant, photo, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; plant?: Plant | undefined; photo?: string | undefined; onSave: (i: PlantInput, f?: File) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setFile(undefined); setPreview(photo); setErr(""); } }, [open, photo]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
    const name = s("name");
    if (!name) { setErr("Please give your plant a name."); return; }
    setBusy(true); setErr("");
    try { await onSave({ name, variety: s("variety"), location: s("location"), health_status: s("health_status") ?? "healthy", sunlight: s("sunlight"), soil: s("soil"), humidity: s("humidity"), watering_advice: s("watering_advice"), care_notes: s("care_notes") }, file); onOpenChange(false); }
    catch (x) { setErr(x instanceof Error ? x.message : "Something went wrong."); }
    setBusy(false);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-md">
    <DialogHeader><DialogTitle className="font-display text-xl">{plant ? "Edit plant" : "Add a plant"}</DialogTitle><DialogDescription>Photo, species and the care it needs.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-3.5">
      <button type="button" onClick={() => fileRef.current?.click()} className="relative block w-full overflow-hidden rounded-2xl border border-dashed border-brand/20 bg-secondary">
        {preview ? <img src={preview} alt="Plant photo preview" className="aspect-[16/10] w-full object-cover" /> : <div className="grid aspect-[16/10] place-items-center text-sm text-brand/60"><span className="flex flex-col items-center gap-2"><Camera size={22} />Add a photo</span></div>}
        {preview && <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">Change photo</span>}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } e.target.value = ""; }} />
      <label className="block text-sm font-semibold">Name<Input name="name" defaultValue={plant?.name ?? ""} required className="mt-1.5" placeholder="e.g. Kitchen basil" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">Species<Input name="variety" defaultValue={plant?.variety ?? ""} className="mt-1.5" placeholder="Ocimum basilicum" /></label>
        <label className="block text-sm font-semibold">Location<Input name="location" defaultValue={plant?.location ?? ""} className="mt-1.5" placeholder="Windowsill" /></label>
      </div>
      <label className="block text-sm font-semibold">Health<select name="health_status" defaultValue={plant?.health_status ?? "healthy"} className={field}>{Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <p className="pt-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Care settings</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">Watering<Input name="watering_advice" defaultValue={plant?.watering_advice ?? ""} className="mt-1.5" placeholder="Every 7 days" /></label>
        <label className="block text-sm font-semibold">Light<Input name="sunlight" defaultValue={plant?.sunlight ?? ""} className="mt-1.5" placeholder="Bright, indirect" /></label>
        <label className="block text-sm font-semibold">Soil<Input name="soil" defaultValue={plant?.soil ?? ""} className="mt-1.5" placeholder="Well-draining" /></label>
        <label className="block text-sm font-semibold">Humidity<Input name="humidity" defaultValue={plant?.humidity ?? ""} className="mt-1.5" placeholder="40–60%" /></label>
      </div>
      <label className="block text-sm font-semibold">Notes<textarea name="care_notes" defaultValue={plant?.care_notes ?? ""} rows={2} className={`${field} h-auto py-2`} placeholder="Anything worth remembering" /></label>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" size="lg" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{plant ? "Save changes" : "Add plant"}</Button>
    </form>
  </DialogContent></Dialog>;
}

/* ---------------- Reminder form ---------------- */
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function ReminderDialog({ open, onOpenChange, reminder, plants, defaultPlantId, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; reminder?: Reminder | undefined; plants: Plant[]; defaultPlantId?: string | undefined; onSave: (i: ReminderInput) => Promise<void> }) {
  const [kind, setKind] = useState("water");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setKind(reminder?.kind ?? "water"); setErr(""); } }, [open, reminder]);
  const defaultDue = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d.toISOString(); }, [open]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const due = new Date(String(f.get("due")));
    const freq = Number(f.get("frequency"));
    if (Number.isNaN(due.getTime())) { setErr("Please pick a date and time."); return; }
    if (!(freq >= 1 && freq <= 365)) { setErr("Repeat every 1–365 days."); return; }
    const ml = Number(f.get("amount"));
    setBusy(true); setErr("");
    try {
      await onSave({ kind, plant_id: String(f.get("plant") || "") || null, title: String(f.get("title") ?? "").trim(), next_due_at: due.toISOString(), frequency_days: Math.round(freq), amount_ml: kind === "water" && ml > 0 ? Math.round(ml) : null, enabled: f.get("enabled") === "on" });
      onOpenChange(false);
    } catch (x) { setErr(x instanceof Error ? x.message : "Something went wrong."); }
    setBusy(false);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-md">
    <DialogHeader><DialogTitle className="font-display text-xl">{reminder ? "Edit reminder" : "New reminder"}</DialogTitle><DialogDescription>We'll send a notification when it's due.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-3.5">
      <div className="grid grid-cols-3 gap-2">{Object.entries(KINDS).map(([k, { label, icon: I }]) => <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold ${kind === k ? "border-brand bg-brand text-brand-foreground" : "border-border bg-card text-brand/70"}`}><I size={16} />{label}</button>)}</div>
      <label className="block text-sm font-semibold">Plant<select name="plant" defaultValue={reminder?.plant_id ?? defaultPlantId ?? ""} className={field}><option value="">No specific plant</option>{plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Label <span className="font-normal text-muted-foreground">(optional)</span><Input name="title" defaultValue={reminder?.title ?? ""} className="mt-1.5" placeholder={kind === "custom" ? "e.g. Check for pests" : "Uses the type and plant name"} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block text-sm font-semibold">First reminder<Input name="due" type="datetime-local" required defaultValue={toLocalInput(reminder?.next_due_at ?? defaultDue)} className="mt-1.5" /></label>
        <label className="block text-sm font-semibold">Repeat every (days)<Input name="frequency" type="number" min={1} max={365} required defaultValue={reminder?.frequency_days ?? 7} className="mt-1.5" /></label>
        {kind === "water" && <label className="block text-sm font-semibold">Amount (ml)<Input name="amount" type="number" min={0} max={20000} defaultValue={reminder?.amount_ml ?? ""} className="mt-1.5" placeholder="250" /></label>}
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={reminder?.enabled ?? true} className="size-4 accent-[var(--brand)]" />Send notifications</label>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button className="w-full" size="lg" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{reminder ? "Save reminder" : "Create reminder"}</Button>
    </form>
  </DialogContent></Dialog>;
}

export function ReminderRow({ r, plants, onDone, onEdit, onDelete }: { r: Reminder; plants: Plant[]; onDone: () => void; onEdit: () => void; onDelete: () => void }) {
  const K = KINDS[r.kind] ?? KINDS["custom"]!;
  const overdue = new Date(r.next_due_at).getTime() < Date.now();
  return <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${overdue ? "bg-warning/15 text-warning" : "bg-moss/25 text-brand"}`}><K.icon size={17} /></span>
    <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-semibold">{reminderName(r, plants)}</p><p className={`text-xs ${overdue ? "font-semibold text-warning" : "text-brand/50"}`}>{dueLabel(r.next_due_at)}{r.amount_ml ? ` · ${r.amount_ml} ml` : ""} · every {r.frequency_days}d{!r.enabled && " · muted"}</p></div>
    <button onClick={onEdit} aria-label="Edit reminder" className="grid size-8 place-items-center rounded-lg text-brand/50 hover:bg-secondary"><Pencil size={14} /></button>
    <button onClick={onDelete} aria-label="Delete reminder" className="grid size-8 place-items-center rounded-lg text-brand/50 hover:bg-secondary"><Trash2 size={14} /></button>
    <Button size="sm" onClick={onDone} aria-label="Mark done"><Check /></Button>
  </div>;
}

/* ---------------- Plant library ---------------- */
export function PlantLibrary({ g }: { g: Garden }) {
  const [editing, setEditing] = useState<Plant | null | undefined>(undefined);
  const [open, setOpen] = useState<string>();
  const [rem, setRem] = useState<{ r?: Reminder; plantId?: string } | undefined>();
  const [confirm, setConfirm] = useState<Plant>();

  return <>
    <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Plant library</p><h1 className="font-display text-3xl font-extrabold">Your plants</h1></div><Button size="sm" onClick={() => setEditing(null)}><Plus /> Add plant</Button></div>
    {g.loading ? <div className="mt-8 flex justify-center"><LoaderCircle className="animate-spin text-brand" /></div>
      : !g.plants.length ? <div className="mt-5 rounded-3xl border border-dashed border-brand/20 bg-card p-8 text-center"><Sprout className="mx-auto text-moss" size={30} /><h2 className="mt-3 font-display text-lg font-bold">Start your library</h2><p className="mt-1 text-sm text-muted-foreground">Add your first plant with a photo and care settings.</p><Button className="mt-4" onClick={() => setEditing(null)}><Plus /> Add a plant</Button></div>
      : <div className="mt-5 space-y-4">{g.plants.map((p) => {
        const mine = g.reminders.filter((r) => r.plant_id === p.id);
        const expanded = open === p.id;
        return <article key={p.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <button onClick={() => setOpen(expanded ? undefined : p.id)} className="flex w-full gap-4 p-4 text-left" aria-expanded={expanded}>
            <PlantThumb src={g.photos[p.id]} name={p.name} className="size-20 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h2 className="truncate font-display text-lg font-bold">{p.name}</h2><span className={`h-fit shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${p.health_status === "healthy" ? "bg-moss/25" : "bg-warning/15 text-warning"}`}>{HEALTH[p.health_status] ?? p.health_status}</span></div>
              {p.variety && <p className="truncate text-xs italic text-brand/60">{p.variety}</p>}
              <p className="mt-1 flex items-center gap-1 text-xs text-brand/50">{p.location && <><MapPin size={11} />{p.location} · </>}{mine[0] ? `Next: ${dueLabel(mine[0].next_due_at)}` : "No reminders"}</p></div>
          </button>
          <div className="grid grid-cols-2 gap-px bg-border">{([[Droplets, "Watering", p.watering_advice], [Sun, "Light", p.sunlight], [Sprout, "Soil", p.soil], [Wind, "Humidity", p.humidity]] as const).map(([I, k, v]) => <div key={k} className="bg-card p-3"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand/50"><I size={12} />{k}</p><p className="mt-1 text-xs font-medium">{v || "—"}</p></div>)}</div>
          {expanded && <div className="space-y-3 border-t border-border p-4">
            {p.care_notes && <p className="text-sm text-muted-foreground">{p.care_notes}</p>}
            <div className="flex items-center justify-between"><h3 className="font-display text-sm font-bold">Care reminders</h3><button onClick={() => setRem({ plantId: p.id })} className="flex items-center gap-1 text-xs font-semibold text-brand"><Plus size={13} />Add reminder</button></div>
            {mine.length ? mine.map((r) => <ReminderRow key={r.id} r={r} plants={g.plants} onDone={() => g.completeReminder(r)} onEdit={() => setRem({ r })} onDelete={() => g.deleteReminder(r.id)} />) : <p className="text-xs text-muted-foreground">No reminders yet for this plant.</p>}
            <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(p)}><Pencil /> Edit</Button><Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => setConfirm(p)}><Trash2 /> Delete</Button></div>
          </div>}
        </article>;
      })}</div>}
    <PlantDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} plant={editing ?? undefined} photo={editing ? g.photos[editing.id] : undefined} onSave={(i, f) => g.savePlant(i, editing?.id, f)} />
    <ReminderDialog open={!!rem} onOpenChange={(o) => !o && setRem(undefined)} reminder={rem?.r} plants={g.plants} defaultPlantId={rem?.plantId} onSave={(i) => g.saveReminder(i, rem?.r?.id)} />
    <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(undefined)}><DialogContent className="rounded-3xl sm:max-w-sm"><DialogHeader><DialogTitle>Delete {confirm?.name}?</DialogTitle><DialogDescription>This removes the plant, its photo and its reminders.</DialogDescription></DialogHeader><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setConfirm(undefined)}>Cancel</Button><Button variant="destructive" className="flex-1" onClick={async () => { if (confirm) await g.deletePlant(confirm.id); setConfirm(undefined); }}>Delete</Button></div></DialogContent></Dialog>
  </>;
}

/* ---------------- Reminders screen ---------------- */
function NotificationsCard({ demo }: { demo: boolean }) {
  const [state, setState] = useState<PushState>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const test = useServerFn(sendTestPush);
  useEffect(() => { getPushState().then(setState).catch(() => setState("unsupported")); }, []);
  async function toggle() {
    setBusy(true); setMsg("");
    try {
      if (state === "on") { await disablePush(); setState("off"); }
      else { const e = await enablePush(); if (e) setMsg(e); setState(await getPushState()); }
    } catch { setMsg("Couldn't change notifications in this browser. Try opening the app in its own tab."); }
    setBusy(false);
  }
  return <div className="mt-5 rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-moss/25">{state === "on" ? <Bell size={17} /> : <BellOff size={17} />}</span>
      <div className="flex-1"><p className="font-display text-sm font-bold">Push notifications</p><p className="text-xs text-muted-foreground">{demo ? "Sign in to get reminders on this device." : state === "on" ? "On for this device — even when the app is closed." : state === "denied" ? "Blocked in your browser settings." : state === "unsupported" ? "Not supported in this browser." : "Get alerted when care is due."}</p></div>
      {!demo && state !== "unsupported" && state !== "denied" && <Button size="sm" variant={state === "on" ? "outline" : "default"} disabled={busy || !state} onClick={toggle}>{busy && <LoaderCircle className="animate-spin" />}{state === "on" ? "Turn off" : "Turn on"}</Button>}
    </div>
    {state === "on" && !demo && <button className="mt-3 text-xs font-semibold text-brand/70" onClick={async () => { const r = await test(); setMsg(r.ok ? "Test notification sent." : r.error); }}>Send a test notification</button>}
    {msg && <p className="mt-2 text-xs text-brand/70" role="status">{msg}</p>}
  </div>;
}

export function RemindersView({ g, demo }: { g: Garden; demo: boolean }) {
  const [rem, setRem] = useState<{ r?: Reminder } | undefined>();
  const due = g.reminders.filter((r) => new Date(r.next_due_at).getTime() <= Date.now() + 86400000 - (Date.now() % 86400000));
  const overdue = g.reminders.filter((r) => new Date(r.next_due_at).getTime() < Date.now()).length;
  return <>
    <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Care schedule</p><h1 className="font-display text-3xl font-extrabold">Reminders</h1></div><Button size="sm" onClick={() => setRem({})}><Plus /> New</Button></div>
    <div className="mt-5 rounded-[28px] bg-brand p-6 text-brand-foreground"><Droplets size={24} className="text-moss" /><p className="mt-3 font-display text-4xl font-black">{due.length} due today</p><p className="mt-1 text-sm text-brand-foreground/65">{overdue ? `${overdue} overdue — catch up when you can.` : g.reminders[0] ? `Next: ${reminderName(g.reminders[0], g.plants)} · ${dueLabel(g.reminders[0].next_due_at)}` : "Set your first reminder to stay on track."}</p></div>
    <NotificationsCard demo={demo} />
    <div className="mt-5 space-y-2.5">{g.reminders.length ? g.reminders.map((r) => <ReminderRow key={r.id} r={r} plants={g.plants} onDone={() => g.completeReminder(r)} onEdit={() => setRem({ r })} onDelete={() => g.deleteReminder(r.id)} />)
      : <div className="rounded-2xl border border-dashed border-brand/20 p-6 text-center text-sm text-muted-foreground">No reminders yet. Tap “New” to add watering or care tasks.</div>}</div>
    <ReminderDialog open={!!rem} onOpenChange={(o) => !o && setRem(undefined)} reminder={rem?.r} plants={g.plants} onSave={(i) => g.saveReminder(i, rem?.r?.id)} />
  </>;
}

/* ---------------- NASA satellite card ---------------- */
export function SatelliteCard() {
  const fetchSat = useServerFn(getSatelliteData);
  const [data, setData] = useState<SatelliteData>();
  const [place, setPlace] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    const load = (lat: number, lon: number, label: string) => { setPlace(label); fetchSat({ data: { lat, lon } }).then(setData).catch(() => setErr("Satellite data is unavailable right now.")); };
    if (!navigator.geolocation) { load(40.71, -74.01, "New York (default)"); return; }
    navigator.geolocation.getCurrentPosition((p) => load(p.coords.latitude, p.coords.longitude, `${p.coords.latitude.toFixed(2)}°, ${p.coords.longitude.toFixed(2)}°`), () => load(40.71, -74.01, "New York (default)"), { timeout: 6000 });
  }, [fetchSat]);

  const advisories = useMemo(() => {
    if (!data) return [];
    const a: { icon: typeof Sun; text: string; tone: "warn" | "ok" | "alert" }[] = [];
    const f = data.fires, l = data.power.latest, days = data.power.days;
    if (f.available && f.count > 0) a.push({ icon: Flame, tone: (f.nearestKm ?? 999) < 25 ? "alert" : "warn", text: `${f.count} active fire hotspot${f.count > 1 ? "s" : ""} detected within ${f.radiusKm} km (nearest ~${f.nearestKm} km). Watch air quality, keep outdoor plants watered and protect them from ash.` });
    if (l) {
      const weekRain = days.reduce((s, d) => s + (d.rain ?? 0), 0);
      if ((l.tmax ?? 0) >= 32 && (l.humidity ?? 100) < 40) a.push({ icon: Droplets, tone: "warn", text: "Hot and dry — water outdoor plants early morning and mulch to hold moisture." });
      else if ((l.tmax ?? 0) >= 29) a.push({ icon: Thermometer, tone: "warn", text: "Warm temperatures — soil will dry faster than usual." });
      if ((l.solar ?? 0) >= 6.5) a.push({ icon: Sun, tone: "warn", text: `Strong sunlight (${l.solar?.toFixed(1)} kWh/m²) — shade tender leaves at midday.` });
      if ((l.humidity ?? 0) > 85) a.push({ icon: Wind, tone: "warn", text: "Very humid — improve airflow to prevent fungal leaf spots." });
      if ((l.tmin ?? 10) <= 3) a.push({ icon: Thermometer, tone: "warn", text: "Frost risk — cover outdoor beds and bring tropicals inside overnight." });
      if (weekRain >= 25) a.push({ icon: CloudRain, tone: "ok", text: `${Math.round(weekRain)} mm of rain this week — skip watering outdoor beds and check drainage.` });
      else if (weekRain < 3 && (l.tmax ?? 0) > 18) a.push({ icon: CloudRain, tone: "warn", text: "Almost no rain this week — outdoor plants need regular watering." });
    }
    if (!a.length) a.push({ icon: Leaf, tone: "ok", text: "Calm conditions and no fire hotspots nearby — a good time for repotting or pruning." });
    return a;
  }, [data]);

  const l = data?.power.latest;
  const tone = { warn: "bg-warning/10", ok: "bg-moss/20", alert: "bg-destructive/10" };
  return <section className="mt-6"><div className="flex items-end justify-between"><h2 className="font-display text-lg font-bold">Satellite conditions</h2><span className="flex items-center gap-1 text-[11px] font-semibold text-brand/50"><Satellite size={12} />NASA POWER · FIRMS</span></div>
    <div className="mt-3 rounded-3xl border border-brand/5 bg-card p-5 shadow-sm">
      {!data ? <div className="flex items-center gap-2 text-sm text-muted-foreground">{err || <><LoaderCircle className="animate-spin" size={16} /> Reading satellite data…</>}</div> : <>
        <div className="flex items-start justify-between"><div><p className="flex items-center gap-1 text-xs text-brand/50"><MapPin size={12} />{place}</p>
          {l ? <><p className="mt-1 font-display text-5xl font-black leading-none">{Math.round(l.temp ?? 0)}°</p><p className="mt-1 text-sm font-semibold">{Math.round(l.tmin ?? 0)}° – {Math.round(l.tmax ?? 0)}° · {new Date(l.date + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></> : <p className="mt-2 text-sm text-muted-foreground">Climate readings unavailable.</p>}</div>
          <div className={`rounded-2xl px-3 py-2 text-center ${!data.fires.available ? "bg-secondary" : data.fires.count ? "bg-destructive/10 text-destructive" : "bg-moss/25"}`}><Flame size={18} className="mx-auto" /><p className="mt-1 text-[11px] font-bold">{!data.fires.available ? "Fire data off" : data.fires.count ? `${data.fires.count} hotspots` : "No fires"}</p><p className="text-[10px] opacity-70">{data.fires.radiusKm} km · 48h</p></div></div>
        {l && <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">{[["Solar", l.solar != null ? `${l.solar.toFixed(1)} kWh` : "—"], ["Humidity", l.humidity != null ? `${Math.round(l.humidity)}%` : "—"], ["Rain", l.rain != null ? `${l.rain.toFixed(1)} mm` : "—"]].map(([k, v]) => <div key={k} className="rounded-xl bg-secondary py-2"><p className="text-brand/50">{k}</p><p className="font-display font-bold">{v}</p></div>)}</div>}
        {data.power.days.length > 1 && <div className="mt-4 border-t border-border pt-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-brand/50">Last {data.power.days.length} days · solar & rain</p>
          <div className="mt-2 flex h-16 items-end gap-1.5">{data.power.days.map((d) => <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.solar?.toFixed(1)} kWh/m², ${d.rain?.toFixed(1)} mm`}><div className="flex h-12 w-full items-end gap-0.5"><div className="flex-1 rounded-t bg-moss" style={{ height: `${Math.min(100, ((d.solar ?? 0) / 8) * 100)}%` }} /><div className="flex-1 rounded-t bg-brand/60" style={{ height: `${Math.min(100, ((d.rain ?? 0) / 20) * 100)}%` }} /></div><span className="text-[9px] text-brand/50">{new Date(d.date + "T12:00").toLocaleDateString(undefined, { weekday: "narrow" })}</span></div>)}</div></div>}
        <div className="mt-4 space-y-2">{advisories.map(({ icon: I, text, tone: t }) => <div key={text} className={`flex gap-2.5 rounded-xl p-3 text-xs ${tone[t]}`}><I size={15} className={`shrink-0 ${t === "alert" ? "text-destructive" : t === "warn" ? "text-warning" : "text-brand"}`} />{text}</div>)}</div>
      </>}
    </div>
  </section>;
}
