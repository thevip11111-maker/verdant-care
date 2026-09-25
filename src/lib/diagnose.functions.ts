import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Diagnosis = {
  plant: string;
  condition: string;
  healthy: boolean;
  confidence: number;
  symptoms: string[];
  treatment: string[];
};

const PROMPT = `You are an expert plant pathologist. Examine the leaf photo and respond with ONLY a JSON object, no prose:
{"plant": string (common plant name), "condition": string (e.g. "Early Blight", "Powdery Mildew", or "Healthy"), "healthy": boolean, "confidence": number 0-100, "symptoms": string[] (3-5 short observed symptoms), "treatment": string[] (3-6 concise step-by-step actions; for healthy plants give care steps)}.
If the image is not a plant, set plant "Unknown", condition "No plant detected", confidence 0.`;

export const diagnoseLeaf = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; result: Diagnosis } | { ok: false; error: string }> => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return { ok: false, error: "AI is not configured." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_image", image_url: data.image }] }],
      }),
    });
    if (!res.ok || !res.body) {
      const msg = res.status === 429 ? "Too many scans right now — try again shortly." : res.status === 402 ? "AI credits are used up for this workspace." : `Analysis failed (${res.status}).`;
      return { ok: false, error: msg };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        const p = l.slice(5).trim();
        if (!p || p === "[DONE]") continue;
        try { const ev = JSON.parse(p); if (ev.type === "response.output_text.delta") text += ev.delta; } catch { /* partial */ }
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "The AI couldn't read this photo. Try a clearer close-up." };
    try {
      const r = JSON.parse(m[0]);
      return { ok: true, result: {
        plant: String(r.plant ?? "Unknown"), condition: String(r.condition ?? "Unknown"), healthy: Boolean(r.healthy),
        confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 0))),
        symptoms: (Array.isArray(r.symptoms) ? r.symptoms : []).map(String).slice(0, 6),
        treatment: (Array.isArray(r.treatment) ? r.treatment : []).map(String).slice(0, 8),
      } };
    } catch { return { ok: false, error: "The AI response was incomplete. Please try again." }; }
  });
