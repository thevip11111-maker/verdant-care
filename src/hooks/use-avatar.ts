import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

async function signedUrl(path: string) {
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  return data?.signedUrl;
}

export function useAvatar(enabled: boolean) {
  const [url, setUrl] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("avatar_url").eq("id", auth.user.id).maybeSingle();
      const stored = data?.avatar_url;
      if (!stored || !active) return;
      if (/^https?:\/\//.test(stored)) setUrl(stored);
      else {
        const fresh = await signedUrl(stored);
        if (active && fresh) setUrl(fresh);
      }
    })();
    return () => { active = false; };
  }, [enabled]);

  const upload = useCallback(async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Please choose an image under 5 MB."); return; }
    setUploading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in to change your picture.");
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${auth.user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", auth.user.id);
      if (dbErr) throw dbErr;
      const fresh = await signedUrl(path);
      if (fresh) setUrl(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your picture.");
    } finally {
      setUploading(false);
    }
  }, []);

  return { url, upload, uploading, error };
}
