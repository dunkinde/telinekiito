// Shared helpers for the customer and office pages.
(function () {
  "use strict";
  const E = window.Engine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const EUR = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const EUR2 = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NUM = new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const fmtDate = (iso) => (iso ? E.fromISODate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "—");
  const fmtStamp = (ts) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const STATUS_TONE = { received: "warn", confirmed: "action", loading: "action", en_route: "action", erected: "ok", pickup_requested: "warn", dismantled: "muted", closed: "muted" };
  const STATUS_BY_KEY = {};
  E.STATUSES.forEach((s, i) => { STATUS_BY_KEY[s.key] = { label: s.label, cust: s.cust, i }; });
  const chip = (status) => `<span class="chip st-${STATUS_TONE[status] || "muted"}">${esc((STATUS_BY_KEY[status] || { label: status }).label)}</span>`;

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
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
      const e = new Error("Can't reach the server. Check your connection.");
      e.code = "network";
      throw e;
    }
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) {
      const e = new Error((j && j.message) || `Server error ${r.status}`);
      e.code = (j && j.error) || "http_" + r.status;
      e.status = r.status;
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
      `<div class="msg ${x.from === "office" ? "office" : ""}"><small>${x.from === "office" ? "Office" : esc((o.customer && o.customer.name) || "Customer")} · ${esc(fmtStamp(x.at))}</small>${esc(x.text)}</div>`
    ).join("");
  }

  window.TK = { E, $, $$, EUR, EUR2, NUM, esc, clone, digits, fmtDate, fmtStamp, STATUS_TONE, STATUS_BY_KEY, chip, toast, api, mergePricing, renderMsgs };
})();
