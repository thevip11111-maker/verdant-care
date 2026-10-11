import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ScanStatus = "healthy" | "needs_care" | "unhealthy" | "unclear";
export type Issue = { name: string; confidence: "high" | "medium" | "low"; why: string };
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
  issues?: Issue[];
};

const MODEL = "gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are the plant buddy inside AgroCheck, a friendly app that helps anyone grow plants, even beginners who aren't serious about it.

The user sends a photo of a plant or leaf. Look carefully and tell them how the plant is doing.

Rules:
- Be warm, simple and encouraging. No scary jargon. Never make the user feel bad about a struggling plant.
- If the photo is not a plant, or is too blurry, dark or far away, set "status" to "unclear" and ask for a clearer, closer photo in natural light.
- Never be overconfident. If you are not sure, say so. Give up to 3 possible causes, most likely first, each with a confidence of "high", "medium" or "low".
- Think about common causes: underwatering, overwatering, too little or too much sun, nutrient problems, pests, fungus, bacteria, virus.
- Give simple steps a beginner can do today with things they probably have at home.
- Do not claim to be a doctor or give a final diagnosis. Use words like "looks like" or "possibly".

Reply ONLY with valid JSON, no extra text and no markdown fences, in this shape:
{
  "plant": "name of the plant, or 'unknown'",
  "status": "healthy | needs_care | unhealthy | unclear",
  "summary": "one friendly sentence about how the plant looks",
  "possible_issues": [
    { "name": "", "confidence": "high | medium | low", "why": "what in the photo suggests this" }
  ],
  "what_to_do": ["step 1", "step 2", "step 3"],
  "retake_tip": "only if status is unclear, otherwise empty"
}`;

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
      const status: ScanStatus = ["healthy", "needs_care", "unhealthy", "unclear"].includes(r.status) ? r.status : "unclear";
      const issues: Issue[] = (Array.isArray(r.possible_issues) ? r.possible_issues : []).slice(0, 3).map((i: { name?: unknown; confidence?: unknown; why?: unknown }) => ({
        name: String(i?.name ?? "").trim(), why: String(i?.why ?? ""),
        confidence: (["high", "medium", "low"].includes(String(i?.confidence)) ? i.confidence : "low") as Issue["confidence"],
      })).filter((i: Issue) => i.name);
      const score = { high: 85, medium: 60, low: 35 };
      return { ok: true, result: {
        status, plant: String(r.plant || "unknown"), summary: String(r.summary ?? ""), issues,
        condition: status === "healthy" ? "Looking healthy" : status === "unclear" ? "Photo unclear" : issues[0]?.name ?? (status === "unhealthy" ? "Unwell" : "Needs a little care"),
        healthy: status === "healthy",
        confidence: status === "unclear" ? 0 : status === "healthy" ? 80 : score[issues[0]?.confidence ?? "low"],
        symptoms: issues.map((i) => i.name),
        treatment: (Array.isArray(r.what_to_do) ? r.what_to_do : []).map(String).slice(0, 8),
        retakeTip: r.retake_tip ? String(r.retake_tip) : null,
      } };
    } catch { return { ok: false, error: "Gemini's answer was incomplete. Please try again." }; }
  });
