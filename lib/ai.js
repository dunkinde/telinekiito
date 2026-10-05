"use strict";
// Read house size from a drawing or photo with the OpenAI API (Chat Completions, image input).

const PROMPT = [
  "You help a Finnish scaffolding company estimate a detached house from the attached image(s): a floor plan, an elevation drawing, or a photo.",
  "Finnish drawings give dimensions in millimetres (14 600 = 14.6 m). Levels like +3 100 are heights above ground in millimetres.",
  "Estimate the main building body only. Exclude porches, carports, terraces and sheds.",
  "Use dimensions written on drawings when present. For photos, scale from doors (about 2.1 m high) and windows.",
  "length_m is the longer wall, along the ridge for a gable roof. eave_height_m is ground to the gutter line, or null if you cannot tell.",
  "Finnish terms: harjakatto = gable roof, aumakatto = hip roof, tasakatto/pulpettikatto = flat or mono-pitch, räystäs = eave, harja = ridge, kerros = floor.",
  'Reply with only JSON, no other text: {"length_m": number, "width_m": number, "floors": 1 | 1.5 | 2, "roof_type": "gable" | "hip" | "flat", "pitch_deg": number, "eave_height_m": number | null, "confidence": "low" | "medium" | "high", "notes": "one short sentence on what you measured from and what is uncertain"}'
].join("\n");

function parseJsonLoose(text) {
  if (!text) return null;
  const t = String(text).trim();
  const tries = [t];
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object") return v;
    } catch {}
  }
  return null;
}

function clampNum(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function normalize(r) {
  let L = clampNum(r.length_m, 3, 60), W = clampNum(r.width_m, 3, 40);
  if (!L || !W) return null;
  if (W > L) [L, W] = [W, L];
  let floors = String(r.floors);
  if (!["1", "1.5", "2"].includes(floors)) {
    const n = Number(r.floors);
    floors = n >= 2 ? "2" : n >= 1.5 ? "1.5" : "1";
  }
  const roofType = ["gable", "hip", "flat"].includes(r.roof_type) ? r.roof_type : "gable";
  const pitch = roofType === "flat" ? 0 : Math.round(clampNum(r.pitch_deg, 5, 55) || 30);
  const eave = clampNum(r.eave_height_m, 2, 12);
  return {
    length: Math.round(L * 10) / 10,
    width: Math.round(W * 10) / 10,
    floors,
    roofType,
    pitch,
    eave: eave ? Math.round(eave * 10) / 10 : null,
    confidence: ["low", "medium", "high"].includes(r.confidence) ? r.confidence : "unknown",
    notes: r.notes ? String(r.notes).slice(0, 300) : ""
  };
}

function createAI({ apiKey, model, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  const enabled = Boolean(apiKey);

  async function readDrawing(dataUrls) {
    if (!enabled) throw Object.assign(new Error("AI is not configured"), { code: "ai_not_configured" });
    const content = [{ type: "text", text: PROMPT }].concat(
      dataUrls.map((url) => ({ type: "image_url", image_url: { url } }))
    );
    const r = await doFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], max_completion_tokens: 4000 }),
      signal: AbortSignal.timeout(90000)
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const code = j && j.error && j.error.code;
      const e = new Error((j && j.error && j.error.message) || `OpenAI returned ${r.status}`);
      e.code =
        r.status === 401 ? "ai_bad_key"
        : code === "insufficient_quota" ? "ai_no_credit"
        : r.status === 429 ? "ai_busy"
        : r.status === 404 || code === "model_not_found" ? "ai_bad_model"
        : "ai_error";
      throw e;
    }
    let text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (Array.isArray(text)) text = text.map((p) => (p && (p.text || "")) || "").join("");
    const data = parseJsonLoose(text);
    const out = data && normalize(data);
    if (!out) throw Object.assign(new Error("No measurements in the reply"), { code: "ai_unreadable" });
    return out;
  }

  return { enabled, model, readDrawing };
}

module.exports = { createAI, parseJsonLoose, normalize, PROMPT };
