import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CloudSun, Droplets, Leaf, LoaderCircle, MapPin, RotateCcw, Search, Sprout, Sun, Thermometer, Upload, Wind } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diagnoseLeaf, type Diagnosis } from "@/lib/diagnose.functions";

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

  async function choose(file?: File) {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setImage(url); setState("analyzing"); setResult(undefined);
      const r = await analyze({ data: { image: url } });
      if (r.ok) { setResult(r.result); setState("result"); } else { setError(r.error); setState("error"); }
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

/* ---------------- Weather ---------------- */
type Wx = { temp: number; humidity: number; uv: number; wind: number; code: number; days: { d: string; max: number; min: number; rain: number; code: number }[]; place: string };
const codeLabel = (c: number) => c === 0 ? "Clear" : c <= 3 ? "Partly cloudy" : c <= 48 ? "Foggy" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : c <= 82 ? "Showers" : "Storms";

export function WeatherCard() {
  const [wx, setWx] = useState<Wx>();
  const [err, setErr] = useState("");
  useEffect(() => {
    const load = async (lat: number, lon: number, place: string) => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=4`);
        const j = await r.json();
        setWx({ temp: j.current.temperature_2m, humidity: j.current.relative_humidity_2m, uv: j.current.uv_index ?? 0, wind: j.current.wind_speed_10m, code: j.current.weather_code, place,
          days: j.daily.time.slice(1).map((d: string, i: number) => ({ d: new Date(d).toLocaleDateString(undefined, { weekday: "short" }), max: j.daily.temperature_2m_max[i + 1], min: j.daily.temperature_2m_min[i + 1], rain: j.daily.precipitation_probability_max[i + 1], code: j.daily.weather_code[i + 1] })) });
      } catch { setErr("Weather is unavailable right now."); }
    };
    if (!navigator.geolocation) { load(40.71, -74.01, "New York"); return; }
    navigator.geolocation.getCurrentPosition(p => load(p.coords.latitude, p.coords.longitude, "Your location"), () => load(40.71, -74.01, "New York (default)"), { timeout: 6000 });
  }, []);

  const advisories = useMemo(() => {
    if (!wx) return [];
    const a: { icon: typeof Sun; text: string; tone: "warn" | "ok" }[] = [];
    if (wx.temp >= 30 && wx.humidity < 40) a.push({ icon: Droplets, text: "Dry heatwave — water outdoor pots early morning and check soil twice today.", tone: "warn" });
    else if (wx.temp >= 28) a.push({ icon: Thermometer, text: "Warm day — soil will dry faster than usual.", tone: "warn" });
    if (wx.uv >= 6) a.push({ icon: Sun, text: `High UV (${Math.round(wx.uv)}) — move tender plants into shade during midday.`, tone: "warn" });
    if (wx.humidity > 80) a.push({ icon: Wind, text: "Very humid — improve airflow to prevent fungal spots.", tone: "warn" });
    if (wx.temp <= 5) a.push({ icon: Thermometer, text: "Cold snap — bring tropical plants indoors tonight.", tone: "warn" });
    if ((wx.days[0]?.rain ?? 0) >= 60) a.push({ icon: CloudSun, text: "Rain expected tomorrow — skip watering outdoor beds.", tone: "ok" });
    if (!a.length) a.push({ icon: Leaf, text: "Mild conditions — a great day for repotting or pruning.", tone: "ok" });
    return a;
  }, [wx]);

  return <section className="mt-6"><h2 className="font-display text-lg font-bold">Local weather</h2>
    <div className="mt-3 rounded-3xl border border-brand/5 bg-card p-5 shadow-sm">
      {!wx ? <div className="flex items-center gap-2 text-sm text-muted-foreground">{err || <><LoaderCircle className="animate-spin" size={16} /> Loading local weather…</>}</div> : <>
        <div className="flex items-start justify-between"><div><p className="flex items-center gap-1 text-xs text-brand/50"><MapPin size={12} />{wx.place}</p><p className="mt-1 font-display text-5xl font-black leading-none">{Math.round(wx.temp)}°</p><p className="mt-1 text-sm font-semibold">{codeLabel(wx.code)}</p></div><CloudSun size={40} className="text-moss" /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">{[["Humidity", `${wx.humidity}%`], ["UV index", Math.round(wx.uv)], ["Wind", `${Math.round(wx.wind)} km/h`]].map(([k, v]) => <div key={k} className="rounded-xl bg-secondary py-2"><p className="text-brand/50">{k}</p><p className="font-display font-bold">{v}</p></div>)}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center text-xs">{wx.days.map(d => <div key={d.d}><p className="font-semibold">{d.d}</p><p className="text-brand/50">{codeLabel(d.code)}</p><p className="mt-0.5 font-display font-bold">{Math.round(d.max)}° <span className="font-normal text-brand/50">{Math.round(d.min)}°</span></p></div>)}</div>
        <div className="mt-4 space-y-2">{advisories.map(({ icon: I, text, tone }) => <div key={text} className={`flex gap-2.5 rounded-xl p-3 text-xs ${tone === "warn" ? "bg-warning/10" : "bg-moss/20"}`}><I size={15} className={`shrink-0 ${tone === "warn" ? "text-warning" : "text-brand"}`} />{text}</div>)}</div>
      </>}
    </div>
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
