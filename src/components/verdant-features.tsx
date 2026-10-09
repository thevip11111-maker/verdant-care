import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CloudSun, Droplets, Leaf, LoaderCircle, MapPin, RotateCcw, Search, Sprout, Sun, Thermometer, Upload, Wind } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diagnoseLeaf, type Diagnosis } from "@/lib/diagnose.functions";
import { supabase } from "@/integrations/supabase/client";

export type HistoryItem = { id: string; created_at: string; image?: string | undefined; r: Diagnosis };

async function dataUrlToBlob(u: string) { return (await fetch(u)).blob(); }

async function saveScan(image: string, r: Diagnosis) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const path = `${auth.user.id}/scans/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from("plant-photos").upload(path, await dataUrlToBlob(image), { contentType: "image/jpeg" });
  await supabase.from("diagnoses").insert({ user_id: auth.user.id, image_url: up.error ? null : path, disease_name: r.condition, certainty: Math.round(r.confidence), status: r.healthy ? "healthy" : "needs_care", recommendations: { plant: r.plant, healthy: r.healthy, symptoms: r.symptoms, treatment: r.treatment } });
}

export const GUEST_SCANS = "aegis-guest-scans";
export function loadGuestScans(): HistoryItem[] { try { return JSON.parse(localStorage.getItem(GUEST_SCANS) ?? "[]"); } catch { return []; } }
export async function loadHistory(): Promise<HistoryItem[]> {
  const { data } = await supabase.from("diagnoses").select("id, created_at, image_url, disease_name, certainty, status, recommendations").order("created_at", { ascending: false }).limit(30);
  if (!data?.length) return [];
  const paths = data.map(d => d.image_url).filter((x): x is string => !!x);
  const signed = paths.length ? (await supabase.storage.from("plant-photos").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls = new Map(signed.map(s => [s.path, s.signedUrl]));
  return data.map(d => {
    const rec = (d.recommendations ?? {}) as Partial<Diagnosis>;
    return { id: d.id, created_at: d.created_at, image: d.image_url ? urls.get(d.image_url) ?? undefined : undefined,
      r: { plant: rec.plant ?? "Plant", condition: d.disease_name, healthy: rec.healthy ?? d.status === "healthy", confidence: d.certainty, symptoms: Array.isArray(rec.symptoms) ? rec.symptoms : [], treatment: Array.isArray(rec.treatment) ? rec.treatment : (Array.isArray(d.recommendations) ? d.recommendations as string[] : []) } };
  });
}

/* ---------------- Scanner ---------------- */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = URL.createObjectURL(file);
  });
}

export function ScannerView() {
  const cam = useRef<HTMLInputElement>(null);
  const up = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(diagnoseLeaf);
  const [image, setImage] = useState<string>();
  const [state, setState] = useState<"idle" | "analyzing" | "result" | "error">("idle");
  const [result, setResult] = useState<Diagnosis>();
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [openId, setOpenId] = useState<string>();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { setSignedIn(!!data.user); if (data.user) loadHistory().then(setHistory); else setHistory(loadGuestScans()); }); }, []);

  async function choose(file?: File) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setImage(url); setState("analyzing"); setResult(undefined);
      const r = await analyze({ data: { image: url } });
      if (r.ok) { setResult(r.result); setState("result"); if (signedIn) { saveScan(url, r.result).then(loadHistory).then(setHistory).catch(() => {}); } else { const next = [{ id: crypto.randomUUID(), created_at: new Date().toISOString(), image: url, r: r.result }, ...history].slice(0, 10); setHistory(next); try { localStorage.setItem(GUEST_SCANS, JSON.stringify(next)); } catch { localStorage.setItem(GUEST_SCANS, JSON.stringify(next.map(h => ({ ...h, image: undefined })))); } } } else { setError(r.error); setState("error"); }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); setState("error"); }
  }

  return <>
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">AI inspection</p><h1 className="font-display text-3xl font-extrabold">Scan a leaf</h1><p className="mt-2 text-sm text-muted-foreground">Use a clear, close photo in natural light.</p></div>
    <div className="relative mt-5 overflow-hidden rounded-[28px] bg-brand p-3">
      <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl bg-moss/15">
        {image ? <img src={image} alt="Selected plant leaf" className="absolute inset-0 h-full w-full object-cover" /> : <div className="text-center text-brand-foreground"><Camera className="mx-auto" size={34} /><p className="mt-3 font-display font-bold">Center the affected leaf</p><p className="mt-1 text-xs text-brand-foreground/60">Keep the whole area in focus</p></div>}
        {state === "analyzing" && <><div className="absolute inset-0 bg-brand/20" /><div className="scan-line absolute inset-x-5 top-5 h-0.5 bg-moss shadow-md" /><div className="absolute inset-x-0 bottom-0 bg-brand/90 p-4 text-brand-foreground"><div className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle className="animate-spin" size={16} />Analyzing leaf tissue…</div><p className="mt-1 text-xs text-brand-foreground/60">Checking color, lesions and texture patterns</p></div></>}
        <span className="absolute left-4 top-4 size-7 border-l-2 border-t-2 border-brand-foreground/70" /><span className="absolute right-4 top-4 size-7 border-r-2 border-t-2 border-brand-foreground/70" /><span className="absolute bottom-4 left-4 size-7 border-b-2 border-l-2 border-brand-foreground/70" /><span className="absolute bottom-4 right-4 size-7 border-b-2 border-r-2 border-brand-foreground/70" />
      </div>
    </div>
    <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
    <input ref={up} type="file" accept="image/*" className="hidden" onChange={e => { choose(e.target.files?.[0]); e.target.value = ""; }} />
    <div className="mt-3 grid grid-cols-2 gap-3"><Button disabled={state === "analyzing"} onClick={() => cam.current?.click()}><Camera /> Take photo</Button><Button disabled={state === "analyzing"} variant="outline" onClick={() => up.current?.click()}><Upload /> Upload</Button></div>
    {state === "error" && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><AlertTriangle size={18} className="shrink-0 text-destructive" />{error}</div>}
    {state === "result" && result && <DiagnosisResult r={result} onReset={() => { setImage(undefined); setState("idle"); }} />}
    <section className="mt-8"><h2 className="font-display text-xl font-extrabold">Scan history</h2>
      {!signedIn ? <p className="mt-2 text-sm text-muted-foreground">Sign in to keep a history of your scans.</p>
      : !history.length ? <p className="mt-2 text-sm text-muted-foreground">Your past diagnoses and treatment plans will appear here.</p>
      : <div className="mt-3 space-y-2.5">{history.map(h => <article key={h.id} className="overflow-hidden rounded-2xl border border-border bg-card">
          <button className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setOpenId(openId === h.id ? undefined : h.id)} aria-expanded={openId === h.id}>
            {h.image ? <img src={h.image} alt={h.r.condition} loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-moss/20"><Leaf size={18} /></span>}
            <div className="min-w-0 flex-1"><p className="truncate font-display text-sm font-bold">{h.r.condition}</p><p className="truncate text-xs text-brand/50">{h.r.plant} · {h.r.confidence}% · {new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${h.r.healthy ? "bg-moss/30" : "bg-warning/15 text-warning"}`}>{h.r.healthy ? "Healthy" : "Needs care"}</span>
          </button>
          {openId === h.id && <div className="border-t border-border p-4">
            {h.r.symptoms.length > 0 && <ul className="mb-3 flex flex-wrap gap-1.5">{h.r.symptoms.map(s => <li key={s} className="rounded-full bg-secondary px-2.5 py-1 text-[11px]">{s}</li>)}</ul>}
            <ol className="space-y-2 text-sm">{h.r.treatment.map((x, i) => <li key={x} className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-moss/30 text-[11px] font-bold">{i + 1}</span>{x}</li>)}</ol>
            <button className="mt-3 text-xs font-semibold text-destructive" onClick={async () => { const next = history.filter(x => x.id !== h.id); if (signedIn) await supabase.from("diagnoses").delete().eq("id", h.id); else localStorage.setItem(GUEST_SCANS, JSON.stringify(next)); setHistory(next); }}>Delete from history</button>
          </div>}
        </article>)}</div>}
    </section>
  </>;
}

function DiagnosisResult({ r, onReset }: { r: Diagnosis; onReset: () => void }) {
  return <section className="mt-5 rounded-3xl border border-brand/5 bg-card p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">{r.plant}</p>
    <div className="mt-1 flex items-center justify-between gap-2"><h2 className="font-display text-2xl font-extrabold">{r.condition}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.healthy ? "bg-moss/30 text-brand" : "bg-warning/15 text-warning"}`}>{r.healthy ? "Healthy" : "Needs care"}</span></div>
    <div className="mt-4 flex justify-between text-xs font-semibold"><span className="text-brand/50">Confidence</span><span>{r.confidence}%</span></div>
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-moss/25"><div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${r.confidence}%` }} /></div>
    {r.symptoms.length > 0 && <><h3 className="mt-5 font-display text-sm font-bold">Symptoms observed</h3><ul className="mt-2 flex flex-wrap gap-2">{r.symptoms.map(s => <li key={s} className="rounded-full bg-secondary px-3 py-1 text-xs">{s}</li>)}</ul></>}
    <h3 className="mt-5 font-display text-sm font-bold">{r.healthy ? "Care plan" : "Treatment plan"}</h3>
    <ol className="mt-2 space-y-2.5 text-sm">{r.treatment.map((x, i) => <li key={x} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss/30 text-xs font-bold">{i + 1}</span><span className="pt-0.5">{x}</span></li>)}</ol>
    <Button variant="outline" className="mt-5 w-full" onClick={onReset}><RotateCcw /> Scan another leaf</Button>
  </section>;
}

/* ---------------- Care hub ---------------- */
const tips = [
  { cat: "Care", title: "Water by soil, not schedule", body: "Push a finger 2–3 cm into the soil. Water only when it feels dry at that depth." },
  { cat: "Care", title: "Rotate for even growth", body: "Turn pots a quarter turn weekly so every side gets light." },
  { cat: "Care", title: "Wipe dusty leaves", body: "Dust blocks light. Wipe broad leaves with a damp cloth monthly." },
  { cat: "Mistakes", title: "Overwatering", body: "The #1 killer of houseplants. Yellow, soft leaves and damp soil mean cut back." },
  { cat: "Mistakes", title: "Pots without drainage", body: "Standing water rots roots. Always use a pot with a drainage hole." },
  { cat: "Mistakes", title: "Too much fertilizer", body: "Brown, crispy leaf tips can signal salt build-up. Flush soil and feed at half strength." },
  { cat: "Seasonal", title: "Spring: repot & feed", body: "Repot root-bound plants and resume monthly feeding as growth starts." },
  { cat: "Seasonal", title: "Summer: shade & humidity", body: "Shield from harsh afternoon sun and mist or group plants to raise humidity." },
  { cat: "Seasonal", title: "Autumn: bring plants in", body: "Move tropicals indoors before night temps fall below 10°C. Check for pests first." },
  { cat: "Seasonal", title: "Winter: water less", body: "Growth slows — reduce watering by about half and stop fertilizing." },
];

export function TipsHub() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const shown = tips.filter(t => (cat === "All" || t.cat === cat) && `${t.title} ${t.body}`.toLowerCase().includes(q.toLowerCase()));
  return <section className="mt-8"><h2 className="font-display text-xl font-extrabold">Tips & guidance</h2>
      <div className="relative mt-3"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand/40" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search tips, e.g. yellow leaves" className="pl-9" aria-label="Search tips" /></div>
      <div className="mt-3 flex gap-2">{["All", "Care", "Mistakes", "Seasonal"].map(c => <button key={c} onClick={() => setCat(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${cat === c ? "bg-brand text-brand-foreground" : "bg-secondary text-brand/70"}`}>{c}</button>)}</div>
      <div className="mt-4 space-y-2.5">{shown.map(t => <article key={t.title} className="rounded-2xl border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-moss">{t.cat}</p><h3 className="mt-0.5 font-display font-bold">{t.title}</h3><p className="mt-1 text-sm text-muted-foreground">{t.body}</p></article>)}{!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">No tips match “{q}”.</p>}</div>
    </section>;
}
