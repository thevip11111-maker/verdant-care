import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset Password — Verdant" },
    { name: "description", content: "Choose a new password for your Verdant account." },
    { property: "og:title", content: "Reset Password — Verdant" },
    { property: "og:description", content: "Choose a new password for your Verdant account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [message,setMessage] = useState("");
  const [validRecovery, setValidRecovery] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setValidRecovery(params.get("type") === "recovery" || Boolean(params.get("access_token")));
  }, []);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const password=String(new FormData(event.currentTarget).get("password")??"");const {error}=await supabase.auth.updateUser({password});if(error){setMessage(error.message);return;}setMessage("Password updated. You can return to your garden.");}
  return <main className="grid min-h-screen place-items-center bg-surface px-5"><section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground"><Leaf/></span><h1 className="mt-6 font-display text-3xl font-extrabold">Choose a new password</h1><p className="mt-2 text-sm text-muted-foreground">{validRecovery ? "Use at least eight characters." : "Open the secure recovery link from your email to continue."}</p>{validRecovery && <form onSubmit={submit} className="mt-6 space-y-4"><Input name="password" type="password" minLength={8} required placeholder="New password"/><Button size="lg" className="w-full">Update password</Button></form>}{message&&<p className="mt-4 text-sm" role="status">{message}</p>}<Button variant="ghost" className="mt-2 w-full" onClick={()=>navigate({to:"/"})}>Back to Verdant</Button></section></main>;
}