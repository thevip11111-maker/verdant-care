import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronRight, Droplets, Home, Leaf, LoaderCircle, LogOut, Plus, ScanLine, Sun, Upload, UserRound, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScannerView, TipsHub, loadHistory, loadGuestScans, type HistoryItem } from "@/components/verdant-features";
import { PlantLibrary, PlantThumb, RemindersView, SatelliteCard, ReminderRow, reminderName } from "@/components/garden";
import { useGarden } from "@/hooks/use-garden";
import { useAvatar } from "@/hooks/use-avatar";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Aegis Agria — Plant Care, Diagnosis & Satellite Insights" },
    { name: "description", content: "Diagnose plant disease, manage your plant library and reminders, and get NASA satellite crop advisories." },
    { property: "og:title", content: "Aegis Agria — Plant Care, Diagnosis & Satellite Insights" },
    { property: "og:description", content: "Diagnose plant disease, manage your plant library and reminders, and get NASA satellite crop advisories." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AegisApp,
});

type View = "home" | "plants" | "scan" | "water" | "profile";
type AuthMode = "login" | "signup" | "forgot";


function AegisApp() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [demo, setDemo] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [view, setView] = useState<View>("home");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { url: avatarUrl, upload: uploadAvatar, uploading: avatarUploading, error: avatarError } = useAvatar(signedIn === true);
  const garden = useGarden(signedIn ? "live" : demo ? "demo" : "off");

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

  const signOut = async () => { if (demo) { setDemo(false); setView("home"); return; } await supabase.auth.signOut(); setView("home"); };
  return <AppShell view={view} setView={setView} avatarUrl={avatarUrl} onSignOut={signOut}>
    {view === "home" && <HomeView setView={setView} g={garden} signedIn={signedIn === true} />}
    {view === "plants" && <><PlantLibrary g={garden} /><TipsHub /></>}
    {view === "scan" && <ScannerView />}
    {view === "water" && <RemindersView g={garden} demo={demo && !signedIn} />}
    {view === "profile" && <ProfileView demo={demo} plantCount={garden.plants.length} avatarUrl={avatarUrl} onUpload={uploadAvatar} uploading={avatarUploading} uploadError={avatarError} setView={setView} onSignOut={signOut} />}
  </AppShell>;
}

function AuthScreen({ mode, setMode, message, busy, onSubmit, onDemo }: { mode: AuthMode; setMode: (m: AuthMode) => void; message: string; busy: boolean; onSubmit: (e: FormEvent<HTMLFormElement>) => void; onDemo: () => void }) {
  const title = mode === "signup" ? "Create your garden" : mode === "forgot" ? "Reset your password" : "Welcome back";
  return <main className="min-h-screen bg-surface px-5 py-8"><div className="mx-auto max-w-md">
    <div className="mb-10 flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-brand text-brand-foreground"><Leaf size={18}/></span><div><p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-brand/50">Aegis Agria</p><p className="font-display text-lg font-extrabold leading-none">Plant Intelligence</p></div></div>
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
      {mode !== "forgot" && <><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border"/>or<span className="h-px flex-1 bg-border"/></div><Button variant="outline" size="lg" className="w-full" onClick={async () => { const { error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: window.location.origin }
});
if (error) setMessage(error.message);}}>Continue with Google</Button></>}
      {message && <p className="mt-4 rounded-xl bg-secondary p-3 text-sm" role="status">{message}</p>}
      <div className="mt-6 text-center text-sm text-muted-foreground">{mode === "login" ? <>New to Aegis Agria? <button className="font-semibold text-brand" onClick={() => setMode("signup")}>Create an account</button></> : <button className="font-semibold text-brand" onClick={() => setMode("login")}>Back to sign in</button>}</div>
    </section>
    <button onClick={onDemo} className="mx-auto mt-5 block text-sm font-semibold text-brand/60">Continue as guest (saved on this device)</button>
  </div></main>;
}

function AppShell({ children, view, setView, onSignOut, avatarUrl }: { children: React.ReactNode; view: View; setView: (v: View) => void; onSignOut: () => void; avatarUrl?: string | undefined }) {
  const nav = [{id:"home" as View, label:"Home", icon:Home},{id:"plants" as View,label:"Plants",icon:Leaf},{id:"scan" as View,label:"Scan",icon:ScanLine},{id:"water" as View,label:"Reminders",icon:Droplets},{id:"profile" as View,label:"You",icon:UserRound}];
  return <div className="min-h-screen bg-surface text-brand"><div className="mx-auto max-w-[460px] px-5 pb-28 pt-6">
    <header className="flex items-center justify-between"><button onClick={() => setView("home")} className="text-left"><p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-brand/50">Plant Intelligence</p><p className="font-display text-[22px] font-extrabold leading-none">Aegis Agria</p></button><button onClick={() => setView("profile")} className="relative"><Avatar url={avatarUrl} className="size-10" label="Your profile"/><span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-moss ring-2 ring-surface"/></button></header>
    <div className="mt-5">{children}</div>
    <button onClick={onSignOut} className="mt-8 flex items-center gap-2 text-xs font-semibold text-brand/50"><LogOut size={14}/> Sign out</button>
  </div><nav className="fixed inset-x-0 bottom-0 z-20"><div className="mx-auto flex max-w-[460px] items-center justify-between border-t border-brand/10 bg-background/95 px-5 pb-5 pt-3 shadow-sm">{nav.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setView(id)} aria-label={label} className={`flex min-w-12 flex-col items-center gap-1 text-[10px] font-semibold ${view === id ? "text-brand" : "text-brand/40"}`}><span className={`grid place-items-center ${id === "scan" ? "-mt-6 size-12 rounded-full bg-brand text-brand-foreground shadow-md" : `size-8 rounded-xl ${view === id ? "bg-brand text-brand-foreground" : "bg-moss/20"}`}`}><Icon size={id === "scan" ? 20 : 16}/></span>{label}</button>)}</div></nav></div>;
}

function HomeView({ setView, g, signedIn }: { setView: (v: View) => void; g: ReturnType<typeof useGarden>; signedIn: boolean }) {
  const endOfDay = new Date().setHours(23, 59, 59, 999);
  const today = g.reminders.filter(r => new Date(r.next_due_at).getTime() <= endOfDay);
  const attention = g.plants.filter(p => p.health_status !== "healthy").length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  const summary = !g.plants.length ? "Add your plants to get tailored care reminders." : `${g.plants.length} plant${g.plants.length > 1 ? "s" : ""} in your library${attention ? ` · ${attention} need${attention > 1 ? "" : "s"} attention` : ", all healthy"}. ${today.length ? `${today.length} task${today.length > 1 ? "s" : ""} due today.` : "Nothing due today."}`;
  return <><section className="relative overflow-hidden rounded-[28px] bg-brand p-6 text-brand-foreground"><div className="absolute -right-24 -top-16 h-48 w-48 rotate-[24deg] rounded-3xl bg-moss/20"/><div className="absolute -right-10 bottom-2 h-24 w-56 rotate-[-18deg] rounded-full bg-moss/10"/><div className="relative"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">Aegis Agria</p><h1 className="mt-1 font-display text-[40px] font-black leading-[0.9]">{greet}</h1><p className="mt-3 max-w-72 text-sm leading-snug text-brand-foreground/70">{summary}</p><Button variant="secondary" className="mt-5 bg-moss text-brand hover:bg-moss/90" onClick={() => setView("scan")}>Scan a leaf <ChevronRight/></Button></div></section>
  <section className="mt-6"><div className="flex items-end justify-between"><h2 className="font-display text-lg font-bold">Your garden</h2><button onClick={() => setView("plants")} className="text-xs font-semibold text-brand/50">{g.plants.length ? "See all" : "Add plants"}</button></div>
    <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-2">{g.plants.map(p => <button key={p.id} onClick={() => setView("plants")} className="w-[132px] shrink-0 text-left"><PlantThumb src={g.photos[p.id]} name={p.name} className="aspect-square w-full rounded-2xl ring-1 ring-brand/10"/><div className="mt-2 flex items-center justify-between gap-1"><h3 className="truncate font-display text-sm font-semibold">{p.name}</h3>{p.health_status !== "healthy" && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">Watch</span>}</div><p className="mt-1 truncate text-[11px] text-brand/50">{p.variety ?? p.location ?? ""}</p></button>)}
      <button onClick={() => setView("plants")} className="grid aspect-square w-[132px] shrink-0 place-items-center rounded-2xl border border-dashed border-brand/20 text-xs font-semibold text-brand/60"><span className="flex flex-col items-center gap-1"><Plus size={18}/>Add plant</span></button></div></section>
  <SatelliteCard />
  <section className="mt-6"><div className="flex items-end justify-between"><h2 className="font-display text-lg font-bold">Due today</h2><button onClick={() => setView("water")} className="text-xs font-semibold text-brand/50">All reminders</button></div><div className="mt-3 space-y-2.5">{today.length ? today.map(r => <ReminderRow key={r.id} r={r} plants={g.plants} onDone={() => g.completeReminder(r)} onEdit={() => setView("water")} onDelete={() => g.deleteReminder(r.id)} />) : <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{g.reminders[0] ? `You're all caught up. Next: ${reminderName(g.reminders[0], g.plants)}.` : "No reminders yet."}</p>}</div></section>
  <DiagnosisCard signedIn={signedIn} onScan={() => setView("scan")} /></>;
}

function DiagnosisCard({ signedIn, onScan }: { signedIn: boolean; onScan: () => void }) {
  const [item, setItem] = useState<HistoryItem | null | undefined>();
  useEffect(() => { if (signedIn) loadHistory().then(h => setItem(h[0] ?? null)).catch(() => setItem(null)); else setItem(loadGuestScans()[0] ?? null); }, [signedIn]);
  if (item === undefined) return null;
  if (!item) return <section className="mt-6"><h2 className="font-display text-lg font-bold">Latest diagnosis</h2><div className="mt-3 rounded-3xl border border-dashed border-brand/20 bg-card p-6 text-center"><ScanLine className="mx-auto text-moss" size={28}/><h3 className="mt-2 font-display text-base font-bold">No scans yet</h3><p className="mt-1 text-sm text-muted-foreground">Scan a leaf to get a diagnosis and treatment plan.</p><Button className="mt-4" onClick={onScan}><Camera/> Scan a leaf</Button></div></section>;
  const r = item.r;
  return <section className="mt-6"><h2 className="font-display text-lg font-bold">Latest diagnosis</h2><div className="mt-3 rounded-3xl border border-brand/5 bg-card p-5 shadow-sm"><div className="flex items-center gap-3">{item.image ? <img src={item.image} alt={r.condition} loading="lazy" className="size-14 rounded-2xl object-cover ring-1 ring-brand/10"/> : <span className="grid size-14 place-items-center rounded-2xl bg-moss/20"><Leaf/></span>}<div><h3 className="font-display text-base font-bold">{r.condition}</h3><p className="text-xs text-brand/50">{r.plant} · {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p></div></div><div className="mt-4 flex justify-between text-xs font-semibold"><span className="text-brand/50">Certainty</span><span>{Math.round(r.confidence)}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-moss/25"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(r.confidence)}%` }}/></div><ol className="mt-4 space-y-2 text-xs">{r.treatment.slice(0, 3).map((x,i)=><li key={x} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-moss/30 font-bold">{i+1}</span>{x}</li>)}</ol><Button className="mt-5 w-full" onClick={onScan}>View full treatment</Button></div></section>;
}

const PREFS_KEY = "aegis-preferences";
type Prefs = { name: string; units: "metric" | "imperial"; experience: "beginner" | "experienced" };
function usePrefs(signedIn: boolean) {
  const [prefs, setPrefs] = useState<Prefs>({ name: "", units: "metric", experience: "beginner" });
  useEffect(() => {
    const key = signedIn ? null : PREFS_KEY;
    if (key) { try { const v = JSON.parse(localStorage.getItem(key) ?? ""); setPrefs(p => ({ ...p, ...v })); } catch { /* none saved */ } return; }
    supabase.auth.getUser().then(async ({ data: u }) => {
      if (!u.user) return;
      try { const v = JSON.parse(localStorage.getItem(`${PREFS_KEY}-${u.user.id}`) ?? ""); setPrefs(p => ({ ...p, ...v })); } catch { /* none saved */ }
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      if (data?.display_name) setPrefs(p => ({ ...p, name: data.display_name }));
    });
  }, [signedIn]);
  const save = async (next: Prefs) => {
    setPrefs(next);
    if (!signedIn) { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); return; }
    const { data } = await supabase.auth.getUser();
    if (data.user) { localStorage.setItem(`${PREFS_KEY}-${data.user.id}`, JSON.stringify(next)); await supabase.from("profiles").update({ display_name: next.name }).eq("id", data.user.id); }
  };
  return { prefs, save };
}

function ProfileView({demo, plantCount, avatarUrl, onUpload, uploading, uploadError, setView, onSignOut}:{demo:boolean; plantCount:number; avatarUrl?:string | undefined; onUpload:(f:File)=>void; uploading:boolean; uploadError:string; setView:(v:View)=>void; onSignOut:()=>void}) {
  const picker = useRef<HTMLInputElement>(null);
  const { prefs, save } = usePrefs(!demo);
  const [panel, setPanel] = useState<"prefs" | "privacy" | null>(null);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState(prefs);
  useEffect(() => setDraft(prefs), [prefs]);
  async function resetPassword() {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email) { setNote("Sign in with email to reset your password."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(data.user.email, { redirectTo: `${window.location.origin}/reset-password` });
    setNote(error ? error.message : "Password reset link sent to your email.");
  }
  function clearLocal() { Object.keys(localStorage).filter(k => k.startsWith("aegis-")).forEach(k => localStorage.removeItem(k)); window.location.reload(); }
  return <><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand/50">Account</p><h1 className="font-display text-3xl font-extrabold">Your profile</h1></div>
  <div className="mt-5 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
    <div className="relative shrink-0">
      <Avatar url={avatarUrl} className="size-16" label="Profile"/>
      {uploading && <span className="absolute inset-0 grid place-items-center rounded-full bg-brand/60 text-brand-foreground"><LoaderCircle className="animate-spin" size={18}/></span>}
      <button type="button" aria-label="Change profile picture" disabled={uploading || demo} onClick={() => picker.current?.click()} className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-brand text-brand-foreground shadow-md ring-2 ring-card disabled:opacity-60"><Camera size={13}/></button>
      <input ref={picker} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(f); }}/>
    </div>
    <div><h2 className="font-display text-lg font-bold">{prefs.name || (demo ? "Guest" : "New gardener")}</h2><p className="text-sm text-muted-foreground">{plantCount} plant{plantCount === 1 ? "" : "s"} in your library</p><button type="button" disabled={uploading || demo} onClick={() => picker.current?.click()} className="mt-1 text-xs font-semibold text-brand/60 disabled:opacity-60">{uploading ? "Uploading…" : "Change picture"}</button></div>
  </div>
  {demo && <p className="mt-2 text-xs text-muted-foreground">You're browsing as a guest — your plants and settings are saved on this device only. Sign in to upload a picture.</p>}
  {uploadError && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm" role="status">{uploadError}</p>}
  <div className="mt-4 rounded-xl border border-border bg-card divide-y divide-border">
    <button onClick={() => { setNote(""); setPanel(panel === "prefs" ? null : "prefs"); }} aria-expanded={panel === "prefs"} className="flex w-full items-center justify-between p-4 text-sm font-semibold">Care preferences<ChevronRight size={16} className={panel === "prefs" ? "rotate-90" : ""}/></button>
    {panel === "prefs" && <form className="space-y-3 p-4" onSubmit={async e => { e.preventDefault(); await save(draft); setNote("Preferences saved."); }}>
      <label className="block text-xs font-semibold">Display name<Input className="mt-1" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Your name"/></label>
      <div className="text-xs font-semibold">Units<div className="mt-1 flex gap-2">{(["metric","imperial"] as const).map(u => <button type="button" key={u} aria-pressed={draft.units === u} onClick={() => setDraft({ ...draft, units: u })} className={`flex-1 rounded-lg border py-2 capitalize ${draft.units === u ? "border-brand bg-brand text-brand-foreground" : "border-border"}`}>{u}</button>)}</div></div>
      <div className="text-xs font-semibold">Experience<div className="mt-1 flex gap-2">{(["beginner","experienced"] as const).map(u => <button type="button" key={u} aria-pressed={draft.experience === u} onClick={() => setDraft({ ...draft, experience: u })} className={`flex-1 rounded-lg border py-2 capitalize ${draft.experience === u ? "border-brand bg-brand text-brand-foreground" : "border-border"}`}>{u}</button>)}</div></div>
      <Button size="sm" className="w-full">Save preferences</Button>
    </form>}
    <button onClick={() => setView("water")} className="flex w-full items-center justify-between p-4 text-sm font-semibold">Notification schedule<ChevronRight size={16}/></button>
    <button onClick={() => { setNote(""); setPanel(panel === "privacy" ? null : "privacy"); }} aria-expanded={panel === "privacy"} className="flex w-full items-center justify-between p-4 text-sm font-semibold">Privacy & security<ChevronRight size={16} className={panel === "privacy" ? "rotate-90" : ""}/></button>
    {panel === "privacy" && <div className="space-y-2 p-4">
      {!demo && <Button size="sm" variant="outline" className="w-full" onClick={resetPassword}>Send password reset email</Button>}
      <Button size="sm" variant="outline" className="w-full" onClick={clearLocal}>Clear data saved on this device</Button>
      <Button size="sm" variant="outline" className="w-full" onClick={onSignOut}><LogOut/> {demo ? "Leave guest mode" : "Sign out"}</Button>
    </div>}
  </div>
  {note && <p className="mt-2 rounded-xl bg-secondary p-3 text-sm" role="status">{note}</p>}</>;
}
function Avatar({ url, className, label }: { url?: string | undefined; className: string; label: string }) {
  return url ? <img src={url} alt={label} className={`${className} rounded-full object-cover ring-1 ring-brand/10`}/> : <span role="img" aria-label={label} className={`${className} grid place-items-end justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border`}><svg viewBox="0 0 64 64" className="h-[88%] w-[88%] text-muted-foreground/60" fill="currentColor" aria-hidden="true"><circle cx="32" cy="22" r="12"/><path d="M8 64c0-14 10.7-24 24-24s24 10 24 24z"/></svg></span>;
}
