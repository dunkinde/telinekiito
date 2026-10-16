// Anonymous visit statistics for the sales funnel (POST /api/events, lib/events.js on the server).
// No cookies: a random id for this visit lives in sessionStorage (gone when the tab closes), with where the visit
// came from (utm_source/utm_campaign, the referring site's domain, the landing path). Never personal data.
import type { JobType, Zone } from "./api";

export type FunnelEvent =
  | "calculator_opened"
  | "address_looked_up"
  | "model_found"
  | "price_shown"
  | "step_job"
  | "step_timing"
  | "step_contact"
  | "order_placed"
  | "tracking_opened"
  | "view_3d_opened"
  | "weather_option_ticked";

interface Visit {
  vid: string;
  utm_source: string;
  utm_campaign: string;
  referrer: string;
  landing: string;
  sent: string[];
}

const KEY = "tk_visit";

function visit(): Visit | null {
  try {
    const old = window.sessionStorage.getItem(KEY);
    if (old) return JSON.parse(old) as Visit;
    const rnd = new Uint8Array(12);
    window.crypto.getRandomValues(rnd);
    const q = new URLSearchParams(window.location.search);
    let referrer = "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      referrer = host && host !== window.location.hostname ? host : "";
    } catch {}
    const v: Visit = {
      vid: Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join(""),
      utm_source: (q.get("utm_source") || "").slice(0, 60),
      utm_campaign: (q.get("utm_campaign") || "").slice(0, 60),
      referrer,
      landing: window.location.pathname,
      sent: []
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(v));
    return v;
  } catch {
    return null; // storage blocked: no statistics
  }
}

/** Where the visit came from: read on the first page so it's kept even if the calculator opens later. */
export function startVisit() {
  if (typeof window !== "undefined") visit();
}

/**
 * Counts an event once per visit (the server counts each event once per visit too). Never throws or blocks.
 * `zone`, `job` and `weather` describe the quote at that moment.
 */
export function logEvent(event: FunnelEvent, info: { zone?: Zone; job?: JobType; weather?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const v = visit();
  if (!v || v.sent.includes(event)) return;
  v.sent.push(event);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  const { sent, ...from } = v;
  void sent;
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...from, ...info }),
    keepalive: true,
    credentials: "omit"
  }).catch(() => {});
}
