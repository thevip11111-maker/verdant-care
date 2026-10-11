import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ScanStatus = "healthy" | "needs_attention" | "unclear";
export type Diagnosis = {
  plant: string;
  condition: string;
  healthy: boolean;
  confidence: number;
  symptoms: string[]; // possible issues
  treatment: string[]; // what to do
  status?: ScanStatus;
  summary?: string;
  retakeTip?: string | null;
};

const MODEL = "gemini-flash-latest";

// Replace with the user's system prompt when provided. The JSON shape below must stay the same.
const SYSTEM_PROMPT = `You are an expert plant pathologist helping home gardeners. Look at the leaf or plant photo and reply with ONLY JSON in this shape:
{"status": "healthy" | "needs_attention" | "unclear", "plant": string, "summary": string (1-2 friendly sentences), "possible_issues": string[] (0-4 short items), "what_to_do": string[] (2-6 short practical steps), "confidence": number 0-100, "retake_tip": string | null}
Use "unclear" when the photo is blurry, too dark, too far away or doesn't show a plant, and give a short retake_tip. Otherwise retake_tip is null.`;

export const diagnoseLeaf = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: Diagnosis } | { ok: false; error: string }> => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { ok: false, error: "The Gemini key hasn't been added yet." };
    const m = data.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!m) return { ok: false, error: "Couldn't read that photo." };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: "Analyze this plant photo." }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Gemini failed [${res.status}]: ${body}`);
      const msg = res.status === 429 ? "Too many scans right now — try again shortly." : res.status === 400 || res.status === 403 ? "Gemini rejected the request. Check that your Gemini key is valid." : `Analysis failed (${res.status}).`;
      return { ok: false, error: msg };
    }
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) return { ok: false, error: "Gemini couldn't read this photo. Try a clearer close-up." };
    try {
      const r = JSON.parse(jm[0]);
      const status: ScanStatus = ["healthy", "needs_attention", "unclear"].includes(r.status) ? r.status : "unclear";
      const issues = (Array.isArray(r.possible_issues) ? r.possible_issues : []).map(String).slice(0, 6);
      const conf = Number(r.confidence) || 0;
      return { ok: true, result: {
        status, plant: String(r.plant || "Plant"), summary: String(r.summary ?? ""),
        condition: status === "healthy" ? "Healthy" : status === "unclear" ? "Photo unclear" : issues[0] ?? "Needs attention",
        healthy: status === "healthy",
        confidence: Math.max(0, Math.min(100, Math.round(conf <= 1 ? conf * 100 : conf))),
        symptoms: issues,
        treatment: (Array.isArray(r.what_to_do) ? r.what_to_do : []).map(String).slice(0, 8),
        retakeTip: r.retake_tip ? String(r.retake_tip) : null,
      } };
    } catch { return { ok: false, error: "Gemini's answer was incomplete. Please try again." }; }
  });
