// Shared helpers for the customer and office pages.
(function () {
  "use strict";
  const E = window.Engine;
  const I = window.I18N;
  const t = I.t;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const EUR = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const EUR2 = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NUM = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const opts = I.lang === "fi" ? { weekday: "short", day: "numeric", month: "numeric" } : { weekday: "short", day: "numeric", month: "short" };
    return E.fromISODate(iso).toLocaleDateString(I.locale(), opts);
  };
  const fmtStamp = (ts) => {
    const opts = I.lang === "fi"
      ? { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    return new Date(ts).toLocaleString(I.locale(), opts);
  };
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(I.locale(), { hour: "2-digit", minute: "2-digit" });

  const STATUS_TONE = { received: "warn", confirmed: "action", loading: "action", en_route: "action", erected: "ok", pickup_requested: "warn", dismantled: "muted", closed: "muted" };
  const STATUS_BY_KEY = {};
  E.STATUSES.forEach((s, i) => { STATUS_BY_KEY[s.key] = { i }; });
  const statusLabel = (k) => (I.has("status." + k) ? t("status." + k) : k);
  const statusCust = (k) => t("statusCust." + k);
  const chip = (status) => `<span class="chip st-${STATUS_TONE[status] || "muted"}">${esc(statusLabel(status))}</span>`;

  // Labels for values that come from the engine or the server in English.
  const jobLabel = (k) => (k ? t("job." + k) : "");
  const roofLabel = (k) => (k ? t("roof." + k) : "");
  const zoneLabel = (z) => (z ? t("zone." + z) : "");
  const urgLabel = (k) => (k ? t("urg." + k) : "");
  const partName = (key) => t("part." + key);
  function sideName(name) {
    const m = /^(Long side|Short side|Gable end) ([AB])$/.exec(String(name || ""));
    if (!m) return name;
    return t({ "Long side": "side.long", "Short side": "side.short", "Gable end": "side.gable" }[m[1]], { x: m[2] });
  }
  function lineLabel(l, q) {
    const v = l.vars || {};
    const num = (re) => { const m = re.exec(l.label || ""); return m ? m[1] : ""; };
    switch (l.key) {
      case "rent": return t("line.rent", { days: v.days != null ? v.days : (q && q.rentDays) || num(/(\d+) days/) });
      case "transport": {
        const n = v.loads != null ? v.loads : (q && q.trucks) || 1;
        return n > 1 ? t("line.transportN", { n }) : t("line.transport");
      }
      case "premium": {
        const tier = v.tier || (/^Emergency/.test(l.label || "") ? "emergency" : "express");
        return t("line.premium", { tier: urgLabel(tier), pct: v.pct != null ? v.pct : num(/\+([\d.]+)%/) });
      }
      case "levels": return t("line.levels", { m: v.m != null ? v.m : num(/(\d+) m/) });
      default: return I.has("line." + l.key) ? t("line." + l.key) : l.label;
    }
  }

  // Server errors carry a code; show them in the page language when we know the code.
  function errText(e) {
    if (!e) return "";
    const info = e.info || {};
    if (e.code === "invalid_fields" && Array.isArray(info.fields)) {
      return t("err.invalid_fields", { fields: info.fields.map((f) => t("field." + f)).join(", ") });
    }
    if (e.code === "start_too_early" && info.date) return t("err.start_too_early", { date: fmtDate(info.date) });
    if (e.code && I.has("err." + e.code)) return t("err." + e.code);
    return e.message || t("err.server_error");
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  async function api(method, url, body) {
    const init = { method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let r;
    try {
      r = await fetch(url, init);
    } catch {
      const e = new Error(t("err.network"));
      e.code = "network";
      throw e;
    }
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error((j && j.message) || `Server error ${r.status}`);
      e.code = (j && j.error) || "http_" + r.status;
      e.status = r.status;
      e.info = (j && j.info) || null;
      e.message = errText(e);
      throw e;
    }
    return j;
  }

  function mergePricing(over) {
    const p = clone(E.DEFAULT_PRICING);
    if (!over) return p;
    Object.keys(p).forEach((k) => { if (typeof over[k] === "number") p[k] = over[k]; });
    ["A", "B", "C"].forEach((z) => { if (over.zones && over.zones[z]) p.zones[z].trip = over.zones[z].trip; });
    ["express", "emergency"].forEach((u) => { if (over.urgency && over.urgency[u]) p.urgency[u].pct = over.urgency[u].pct; });
    return p;
  }

  function renderMsgs(box, o) {
    const m = o.messages || [];
    box.innerHTML = m.map((x) =>
      `<div class="msg ${x.from === "office" ? "office" : ""}"><small>${x.from === "office" ? esc(t("msg.office")) : esc((o.customer && o.customer.name) || t("msg.customer"))} · ${esc(fmtStamp(x.at))}</small>${esc(x.text)}</div>`
    ).join("");
  }

  window.TK = {
    E, I, t, $, $$, EUR, EUR2, NUM, esc, clone, digits, fmtDate, fmtStamp, fmtTime,
    STATUS_TONE, STATUS_BY_KEY, statusLabel, statusCust, chip,
    jobLabel, roofLabel, zoneLabel, urgLabel, partName, sideName, lineLabel, errText,
    toast, api, mergePricing, renderMsgs
  };
})();
