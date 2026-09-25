import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronRight, Droplets, Home, Leaf, LoaderCircle, LogOut, Plus, ScanLine, Sun, Upload, UserRound, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import monstera from "@/assets/monstera-spots.jpg";
import ficus from "@/assets/fiddle-leaf.jpg";
import snakePlant from "@/assets/snake-plant.jpg";
import lesion from "@/assets/leaf-spot.jpg";
import avatar from "@/assets/gardener-avatar.jpg";
import { ScannerView, WeatherCard, CareHub } from "@/components/verdant-features";
import { useAvatar } from "@/hooks/use-avatar";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Verdant — Plant Care & Diagnosis" },
    { name: "description", content: "Scan plant health issues, track treatment, and stay ahead of watering." },
    { property: "og:title", content: "Verdant — Plant Care & Diagnosis" },
    { property: "og:description", content: "Scan plant health issues, track treatment, and stay ahead of watering." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: VerdantApp,
});

type View = "home" | "plants" | "scan" | "water" | "profile";
type AuthMode = "login" | "signup" | "forgot";

const plants = [
  { name: "Monstera", image: monstera, status: "Watch", water: "Water in 2 days", light: "Bright, indirect", soil: "Chunky aroid mix", humidity: "60–70%" },
  { name: "Ficus", image: ficus, status: "Healthy", water: "Water in 12 days", light: "Bright, some direct sun", soil: "Well-draining loam", humidity: "40–60%" },
  { name: "Snake Plant", image: snakePlant, status: "Healthy", water: "Water in 21 days", light: "Low to bright", soil: "Cactus/succulent mix", humidity: "30–50%" },
];

function VerdantApp() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [view, setView] = useState<View>("home");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const { url: avatarUrl, upload: uploadAvatar, uploading: avatarUploading, error: avatarError } = useAvatar(signedIn === true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setSignedIn(true);
      if (event === "SIGNED_OUT") setSignedIn(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("name") ?? "");
    setBusy(true); setMessage("");
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setMessage(error ? error.message : "Check your email for a secure reset link.");
    } else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { display_name: displayName } } });
      setMessage(error ? error.message : data.session ? "Account created." : "Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    }
    setBusy(false);
  }

  if (signedIn === null) return <div className="grid min-h-screen place-items-center bg-surface"><LoaderCircle className="animate-spin text-brand" /></div>;
  if (!signedIn && !demo) return <AuthScreen mode={mode} setMode={setMode} message={message} busy={busy} onSubmit={handleAuth} onDemo={() => setDemo(true)} />;

  return <AppShell view={view} setView={setView} avatarUrl={avatarUrl} onSignOut={async () => { if (demo) { setDemo(false); return; } await supabase.auth.signOut(); }}>
    {view === "home" && <HomeView setView={setView} completed={completed} setCompleted={setCompleted} />}
    {view === "plants" && <CareHub plants={plants} />}
    {view === "scan" && <ScannerView />}
    {view === "water" && <WaterView completed={completed} setCompleted={setCompleted} />}
    {view === "profile" && <ProfileView demo={demo} avatarUrl={avatarUrl} onUpload={uploadAvatar} uploading={avatarUploading} uploadError={avatarError} />}
  </AppShell>;
}

function AuthScreen({ mode, setMode, message, busy, onSubmit, onDemo }: { mode: AuthMode; setMode: (m: AuthMode) => void; message: string; busy: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void; onDemo: () => void }) {
  const title = mode === "signup" ? "Create your garden" : mode === "forgot" ? "Reset your password" : "Welcome back";
  return <main className="min-h-screen bg-surface px-5 py-8"><div className="mx-auto max-w-md">
    <div className="mb-10 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-foreground"><Leaf size={18}/></span><div><p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-brand/50">Verdant</p><p className="font-display text-lg font-extrabold leading-none">Grow Diagnostics</p></div></div>
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">Plant care, precisely</p><h1 className="mt-2 font-display text-3xl font-extrabold leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{mode === "forgot" ? "We’ll send a secure link to your inbox." : "Health insights and care schedules for every plant."}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "signup" && <label className="block text-sm font-semibold">Name<Input name="name" required className="mt-1.5" placeholder="Your name" /></label>}
        <label className="block text-sm font-semibold">Email<Input name="email" required type="email" className="mt-1.5" placeholder="you@example.com" /></label>
        {mode !== "forgot" && <label className="block text-sm font-semibold">Password<Input name="password" required minLength={8} type="password" className="mt-1.5" placeholder="At least 8 characters" /></label>}
        {mode === "login" && <button type="button" onClick={() => setMode("forgot")} className="text-sm font-semibold text-brand/70">Forgot password?</button>}
        <Button size="lg" className="w-full" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</Button>
      </form>
      {mode !== "forgot" && <><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>or<span className="h-px flex-1 bg-border"/></div><Button variant="outline" size="lg" className="w-full" onClick={async () => { const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin }); if (result.error) setMode("login"); }}>Continue with Google</Button></>}
      {message && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm" role="status">{message}</p>}
      <div className="mt-6 text-center text-sm text-muted-foreground">{mode === "login" ? <>New to Verdant? <button className="font-semibold text-brand" onClick={() => setMode("signup")}>Create an account</button></> : <button className="font-semibold text-brand" onClick={() => setMode("login")}>Back to sign in</button>}</div>
    </section>
    <button onClick={onDemo} className="mx-auto mt-5 block text-sm font-semibold text-brand/60">Explore the demo dashboard</button>
  </div></main>;
}

function AppShell({ children, view, setView, onSignOut }: { children: React.ReactNode; view: View; setView: (v: View) => void; onSignOut: () => void }) {
  const nav = [{id:"home" as View, label:"Home", icon:Home},{id:"plants" as View,label:"Plants",icon:Leaf},{id:"scan" as View,label:"Scan",icon:ScanLine},{id:"water" as View,label:"Water",icon:Droplets},{id:"profile" as View,label:"You",icon:UserRound}];
  return <div className="min-h-screen bg-surface text-brand"><div className="mx-auto max-w-[460px] px-5 pb-28 pt-6">
    <header className="flex items-center justify-between"><button onClick={() => setView("home")} className="text-left"><p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/50">Verdant</p><p className="font-display text-[22px] font-extrabold leading-none">Grow Diagnostics</p></button><button onClick={() => setView("profile")} className="relative"><img src={avatar} alt="Your profile" width={512} height={512} className="size-10 rounded-full object-cover ring-1 ring-brand/10"/><span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-moss ring-2 ring-surface"/></button></header>
    <div className="mt-5">{children}</div>
    <button onClick={onSignOut} className="mt-8 flex items-center gap-2 text-xs font-semibold text-brand/50"><LogOut size={14}/> Sign out</button>
  </div><nav className="fixed inset-x-0 bottom-0 z-20"><div className="mx-auto flex max-w-[460px] items-center justify-between border-t border-brand/10 bg-background/95 px-5 pb-5 pt-3 shadow-sm">{nav.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setView(id)} aria-label={label} className={`flex min-w-12 flex-col items-center gap-1 text-[10px] font-semibold ${view === id ? "text-brand" : "text-brand/40"}`}><span className={`grid place-items-center ${id === "scan" ? "-mt-6 size-12 rounded-full bg-brand text-brand-foreground shadow-md" : `size-8 rounded-xl ${view === id ? "bg-brand text-brand-foreground" : "bg-moss/20"}`}`}><Icon size={id === "scan" ? 20 : 16}/></span>{label}</button>)}</div></nav></div>;
}

function HomeView({ setView, completed, setCompleted }: { setView: (v: View) => void; completed: string[]; setCompleted: (v: string[]) => void }) {
  const wateringTasks: Array<[string, string]> = [["Monstera", "80 ml · morning"], ["Pothos", "120 ml · evening"]];
  return <><section className="relative overflow-hidden rounded-[28px] bg-brand p-6 text-brand-foreground"><div className="absolute -right-24 -top-16 h-48 w-48 rotate-[24deg] rounded-3xl bg-moss/20"/><div className="absolute -right-10 bottom-2 h-24 w-56 rotate-[-18deg] rounded-full bg-moss/10"/><div className="relative"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">Scan a leaf</p><h1 className="mt-1 font-display text-[40px] font-black leading-[0.9]">Good morning.</h1><p className="mt-3 max-w-64 text-sm leading-snug text-brand-foreground/70">Three plants are thriving. One needs your attention today.</p><Button variant="secondary" className="mt-5 bg-moss text-brand hover:bg-moss/90" onClick={() => setView("scan")}>Scan now <ChevronRight/></Button></div></section>
  <section className="mt-6"><div className="flex items-end justify-between"><h2 className="font-display text-lg font-bold">Your garden</h2><button onClick={() => setView("plants")} className="text-xs font-semibold text-brand/50">See all</button></div><div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-2">{plants.map(p => <article key={p.name} className="w-[132px] shrink-0"><img src={p.image} alt={p.name} loading="lazy" width={512} height={512} className="aspect-square rounded-2xl object-cover ring-1 ring-brand/10"/><div className="mt-2 flex items-center justify-between gap-1"><h3 className="truncate font-display text-sm font-semibold">{p.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.status === "Watch" ? "bg-warning/15 text-warning" : "bg-moss/30 text-brand"}`}>{p.status}</span></div><p className="mt-1 text-[11px] text-brand/50">{p.water}</p></article>)}</div></section>
  <WeatherCard />
  <DiagnosisCard />
  <section className="mt-6"><h2 className="font-display text-lg font-bold">Watering today</h2><div className="mt-3 space-y-2.5">{wateringTasks.map(([name,detail]) => <div key={name} className="flex items-center gap-3 rounded-2xl border border-brand/5 bg-card p-3"><span className="grid size-10 place-items-center rounded-xl bg-moss/25 font-display text-xs font-bold">{name.slice(0,2)}</span><div className="flex-1"><p className="font-display text-sm font-semibold">{name}</p><p className="text-xs text-brand/50">{detail}</p></div><Button size="sm" variant={completed.includes(name) ? "secondary" : "default"} onClick={() => setCompleted(completed.includes(name) ? completed.filter(x=>x!==name) : [...completed,name])}>{completed.includes(name) ? "Done ✓" : "Mark done"}</Button></div>)}</div></section></>;
}

function DiagnosisCard() { return <section className="mt-6"><h2 className="font-display text-lg font-bold">Latest diagnosis</h2><div className="mt-3 rounded-3xl border border-brand/5 bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><img src={lesion} alt="Leaf with a small brown spot" loading="lazy" width={512} height={512} className="size-14 rounded-2xl object-cover ring-1 ring-brand/10"/><div><h3 className="font-display text-base font-bold">Leaf spot fungus</h3><p className="text-xs text-brand/50">Monstera · scanned 2h ago</p></div></div><div className="mt-4 flex justify-between text-xs font-semibold"><span className="text-brand/50">Certainty</span><span>94%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-moss/25"><div className="h-full w-[94%] rounded-full bg-brand"/></div><ol className="mt-4 space-y-2 text-xs">{["Prune and remove affected leaves","Apply copper fungicide weekly","Improve airflow and reduce humidity"].map((x,i)=><li key={x} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-moss/30 font-bold">{i+1}</span>{x}</li>)}</ol><Button className="mt-5 w-full">View full treatment</Button></div></section>; }



function WaterView({completed,setCompleted}:{completed:string[];setCompleted:(v:string[])=>void}) { const tasks: Array<[string, string, string]> = [["Monstera","Today · 8:00 AM","80 ml"],["Pothos","Today · 6:00 PM","120 ml"],["Ficus","Jun 18 · 8:00 AM","100 ml"]]; return <><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Care schedule</p><h1 className="font-display text-3xl font-extrabold">Watering</h1></div><div className="mt-5 rounded-[28px] bg-brand p-6 text-brand-foreground"><Droplets size={24} className="text-moss"/><p className="mt-3 font-display text-4xl font-black">2 due</p><p className="mt-1 text-sm text-brand-foreground/65">Your next care window starts at 6:00 PM.</p></div><div className="mt-5 space-y-3">{tasks.map(([name,time,amount])=><div key={name} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><h2 className="font-display font-bold">{name}</h2><p className="text-xs text-muted-foreground">{time} · {amount}</p></div><Button size="sm" variant={completed.includes(name)?"secondary":"default"} onClick={()=>setCompleted(completed.includes(name)?completed.filter(x=>x!==name):[...completed,name])}>{completed.includes(name)?"Completed":"Mark done"}</Button></div></div>)}</div><div className="mt-5 rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><p className="font-display font-bold">Reminder notifications</p><p className="text-xs text-muted-foreground">Daily care digest at 8:00 AM</p></div><span className="flex h-6 w-11 items-center justify-end rounded-full bg-brand p-0.5"><span className="size-5 rounded-full bg-background"/></span></div></div></>; }

function ProfileView({demo, avatarUrl, onUpload, uploading, uploadError}:{demo:boolean; avatarUrl?:string; onUpload:(f:File)=>void; uploading:boolean; uploadError:string}) {
  const picker = useRef<HTMLInputElement>(null);
  return <><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Account</p><h1 className="font-display text-3xl font-extrabold">Your profile</h1></div>
  <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
    <div className="relative shrink-0">
      <img src={avatarUrl ?? avatar} alt="Profile" width={512} height={512} className="size-16 rounded-full object-cover ring-1 ring-brand/10"/>
      {uploading && <span className="absolute inset-0 grid place-items-center rounded-full bg-brand/60 text-brand-foreground"><LoaderCircle className="animate-spin" size={18}/></span>}
      <button type="button" aria-label="Change profile picture" disabled={uploading || demo} onClick={() => picker.current?.click()} className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-brand text-brand-foreground shadow-md ring-2 ring-card disabled:opacity-60"><Camera size={13}/></button>
      <input ref={picker} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }}/>
    </div>
    <div><h2 className="font-display text-lg font-bold">{demo?"Elena Voss":"Plant keeper"}</h2><p className="text-sm text-muted-foreground">12 plants · 9.1 health score</p><button type="button" disabled={uploading || demo} onClick={() => picker.current?.click()} className="mt-1 text-xs font-semibold text-brand/60 disabled:opacity-60">{uploading ? "Uploading…" : "Change picture"}</button></div>
  </div>
  {demo && <p className="mt-2 text-xs text-muted-foreground">Sign in to save your own picture.</p>}
  {uploadError && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm" role="status">{uploadError}</p>}
  <div className="mt-4 rounded-xl border border-border bg-card divide-y divide-border">{["Care preferences","Notification schedule","Privacy & security"].map(x=><button key={x} className="flex w-full items-center justify-between p-4 text-sm font-semibold">{x}<ChevronRight size={16}/></button>)}</div></>;
}