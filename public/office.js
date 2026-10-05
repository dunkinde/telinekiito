// Office page: login, order list, status updates, load lists, messages, pricing.
(function () {
  "use strict";
  const { E, $, $$, EUR, NUM, esc, clone, fmtDate, fmtStamp, STATUS_BY_KEY, chip, toast, api, mergePricing, renderMsgs } = window.TK;

  const S = { orders: [], loaded: false, selected: null, filter: "all", search: "", pricing: clone(E.DEFAULT_PRICING), timer: null, lastSync: 0 };

  const FILTERS = [
    { key: "all", label: "All", test: () => true },
    { key: "new", label: "To confirm", test: (o) => o.status === "received" },
    { key: "upcoming", label: "To deliver", test: (o) => ["confirmed", "loading", "en_route"].includes(o.status) },
    { key: "onsite", label: "On site", test: (o) => o.status === "erected" || o.status === "pickup_requested" },
    { key: "done", label: "Finished", test: (o) => o.status === "dismantled" || o.status === "closed" }
  ];

  /* ---------- Login ---------- */
  function showLogin() {
    $("#login-view").hidden = false; $("#office-view").hidden = true; $("#logout").hidden = true;
    clearInterval(S.timer);
    setTimeout(() => $("#login-pw").focus(), 50);
  }
  async function showOffice() {
    $("#login-view").hidden = true; $("#office-view").hidden = false; $("#logout").hidden = false;
    await Promise.all([loadOrders(), loadPricing()]);
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (!document.hidden) loadOrders(true); }, 20000);
  }
  function handleAuthError(e) {
    if (e.status === 401) { showLogin(); return true; }
    return false;
  }

  /* ---------- Data ---------- */
  async function loadOrders(quiet) {
    try {
      const r = await api("GET", "/api/office/orders");
      S.orders = r.orders || []; S.loaded = true; S.lastSync = Date.now();
      if (S.selected && !selected()) S.selected = null;
      renderList(); renderDetail(false); renderSync();
    } catch (e) {
      if (!handleAuthError(e) && !quiet) toast(e.message);
    }
  }
  async function loadPricing() {
    try {
      const r = await api("GET", "/api/office/pricing");
      S.pricing = mergePricing(r.pricing);
      if (!$("#settings").contains(document.activeElement)) renderSettings(S.pricing);
    } catch (e) {
      handleAuthError(e);
    }
  }
  function renderSync() {
    $("#sync-text").textContent = "Updated " + new Date(S.lastSync).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  function replaceOrder(o) {
    const i = S.orders.findIndex((x) => x.ref === o.ref);
    if (i >= 0) S.orders[i] = o; else S.orders.unshift(o);
    renderList(); renderDetail(false);
  }
  async function patch(ref, body, okMsg) {
    try {
      const r = await api("PATCH", `/api/office/orders/${encodeURIComponent(ref)}`, body);
      replaceOrder(r.order);
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      if (!handleAuthError(e)) toast(e.message);
      return false;
    }
  }

  /* ---------- Rendering ---------- */
  const selected = () => S.orders.find((o) => o.ref === S.selected) || null;

  function renderStats() {
    const os = S.orders;
    const toConfirm = os.filter((o) => o.status === "received").length;
    const onsite = os.filter((o) => o.status === "erected" || o.status === "pickup_requested");
    const m2 = onsite.reduce((a, o) => a + ((o.estimate && o.estimate.area) || 0), 0);
    const open = os.filter((o) => o.status !== "closed").reduce((a, o) => a + ((o.quote && o.quote.net) || 0), 0);
    const weekAhead = E.toISODate(new Date(Date.now() + 7 * 864e5));
    const dispatch = os.filter((o) => ["confirmed", "loading", "en_route"].includes(o.status) && o.schedule && o.schedule.start <= weekAhead).length;
    $("#stats").innerHTML =
      `<div class="stat"><b>${toConfirm}</b><span>orders to confirm</span></div>` +
      `<div class="stat"><b>${dispatch}</b><span>deliveries in the next 7 days</span></div>` +
      `<div class="stat"><b>${Math.round(m2)} m²</b><span>on hire now</span></div>` +
      `<div class="stat"><b>${EUR.format(open)}</b><span>open orders, excl. VAT</span></div>`;
  }
  function renderFilters() {
    $("#filters").innerHTML = FILTERS.map((f) =>
      `<button type="button" class="chip-btn" data-filter="${f.key}" aria-pressed="${S.filter === f.key}">${esc(f.label)} <span class="num muted">${S.orders.filter(f.test).length}</span></button>`
    ).join("");
  }
  function visibleOrders() {
    const f = FILTERS.find((x) => x.key === S.filter) || FILTERS[0];
    const q = S.search.trim().toLowerCase();
    return S.orders.filter(f.test).filter((o) => !q || [o.ref, o.customer && o.customer.name, o.site && o.site.address].join(" ").toLowerCase().includes(q));
  }
  function renderList() {
    renderStats(); renderFilters();
    const rows = visibleOrders();
    $("#o-rows").innerHTML = rows.map((o) =>
      `<tr data-ref="${esc(o.ref)}" tabindex="0" aria-selected="${S.selected === o.ref}">` +
      `<td class="mono nowrap">${esc(o.ref)}${o.example ? '<br><span class="ex">Example</span>' : ""}</td>` +
      `<td>${esc(o.customer && o.customer.name)}<br><span class="small muted">${esc(o.site && o.site.address)}</span></td>` +
      `<td class="nowrap">${esc(fmtDate(o.schedule && o.schedule.start))}</td>` +
      `<td class="r">${esc(o.estimate && o.estimate.area)}</td>` +
      `<td>${chip(o.status)}${o.schedule && o.schedule.urgency !== "standard" ? ` <span class="chip st-warn">${esc((S.pricing.urgency[o.schedule.urgency] || {}).label || "")}</span>` : ""}</td>` +
      `<td class="r nowrap">${o.quote ? EUR.format(o.quote.total) : "—"}</td></tr>`
    ).join("");
    const empty = $("#o-empty");
    if (!S.loaded) { empty.hidden = false; empty.innerHTML = "<p>Loading orders…</p>"; }
    else if (!S.orders.length) { empty.hidden = false; empty.innerHTML = '<p><b>No orders yet.</b> Orders placed on the customer site appear here.</p><a class="btn" href="/">Make a test order</a>'; }
    else if (!rows.length) { empty.hidden = false; empty.innerHTML = "<p>No orders match this filter.</p>"; }
    else empty.hidden = true;
  }
  function renderDetail(full) {
    const o = selected();
    $("#d-none").hidden = !!o; $("#d-card").hidden = !o;
    if (!o) return;
    const zone = S.pricing.zones[o.site && o.site.zone] || {};
    const urg = S.pricing.urgency[o.schedule && o.schedule.urgency] || {};
    const h = o.house || {};
    $("#d-head").innerHTML =
      `<div class="card-head"><div><div class="eyebrow">${esc(o.ref)}${o.example ? " · example" : ""}</div><h2>${esc(o.customer && o.customer.name)}</h2><p class="muted">${esc(o.site && o.site.address)}</p></div>${chip(o.status)}</div>` +
      `<div class="kv">` +
      `<div><span>Phone</span><b class="mono">${esc(o.customer && o.customer.phone)}</b></div>` +
      (o.customer && o.customer.email ? `<div><span>Email</span><b>${esc(o.customer.email)}</b></div>` : "") +
      `<div><span>Start</span><b>${esc(fmtDate(o.schedule && o.schedule.start))} · ${esc(urg.label || "")}</b></div>` +
      `<div><span>Rental</span><b>${esc(o.quote && o.quote.rentDays)} days</b></div>` +
      `<div><span>Zone</span><b>${esc(zone.label || "")}</b></div>` +
      `<div><span>House</span><b>${esc(NUM.format(h.length) + " × " + NUM.format(h.width) + " m, " + h.floors + "-storey, " + String(E.ROOF_TYPES[h.roofType] || "").toLowerCase() + ", eave " + NUM.format(h.eave) + " m")}</b></div>` +
      `<div><span>Job</span><b>${esc(E.JOB_TYPES[h.jobType] || "")}${o.source === "ai" ? " · AI-measured" : o.source === "address" ? " · from address" : ""}</b></div>` +
      `</div>` + (o.notes ? `<p class="note">${esc(o.notes)}</p>` : "");

    const sel = $("#d-status");
    if (full || document.activeElement !== sel) {
      sel.innerHTML = E.STATUSES.map((s) => `<option value="${s.key}"${s.key === o.status ? " selected" : ""}>${esc(s.label)}</option>`).join("");
    }
    const idx = (STATUS_BY_KEY[o.status] || { i: 0 }).i;
    let next = E.STATUSES[idx + 1];
    if (next && next.key === "pickup_requested") next = E.STATUSES[idx + 2];
    $("#d-next").hidden = !next;
    if (next) { $("#d-next").textContent = "Mark " + next.label.toLowerCase(); $("#d-next").dataset.next = next.key; }
    if (full) {
      $("#d-crew").value = o.crew || ""; $("#d-eta").value = o.eta || ""; $("#d-reply").value = "";
      $("#d-delete-confirm").hidden = true; $("#d-delete").hidden = false;
    }

    const parts = (o.estimate && o.estimate.parts) || {};
    const rows = E.PARTS.filter((p) => parts[p.key] > 0).map((p) =>
      `<tr><td>${esc(p.name)}</td><td class="r">${parts[p.key]}</td><td class="r">${NUM.format(parts[p.key] * p.kg)}</td></tr>`
    ).join("");
    const trucks = (o.quote && o.quote.trucks) || 1;
    $("#d-load").innerHTML =
      `<div class="card-head"><h3>Load list</h3><button class="btn" type="button" id="d-copy">Copy for crew</button></div>` +
      `<p class="small muted">${esc(o.estimate && o.estimate.area)} m² · ${NUM.format(((o.estimate && o.estimate.weightKg) || 0) / 1000)} t · ${trucks} truck load${trucks > 1 ? "s" : ""}</p>` +
      `<div class="tbl-wrap"><table><thead><tr><th>Part</th><th class="r">Qty</th><th class="r">kg</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<div class="tbl-wrap"><table><thead><tr><th>Side</th><th class="r">Bays</th><th class="r">Levels</th><th class="r">Work h.</th></tr></thead><tbody>` +
      ((o.estimate && o.estimate.sides) || []).map((s) => `<tr><td>${esc(s.name)}${s.catchOn ? ' <span class="small muted">+ catch</span>' : ""}</td><td class="r">${s.bays}</td><td class="r">${s.lifts}</td><td class="r">${NUM.format(s.workH)} m</td></tr>`).join("") +
      `</tbody></table></div>`;
    const q = o.quote;
    $("#d-quote").innerHTML = q
      ? `<h3>Price</h3><table class="lines"><tbody>${q.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${EUR.format(l.amount)}</td></tr>`).join("")}` +
        `<tr class="sum"><td>Total excl. VAT</td><td class="r">${EUR.format(q.net)}</td></tr><tr class="grand"><td>Total incl. VAT</td><td class="r">${EUR.format(q.total)}</td></tr></tbody></table>`
      : "";
    renderMsgs($("#d-msgs"), o);
    $("#d-hist").innerHTML = `<h3>History</h3><ul class="hist">${(o.history || []).slice().reverse().map((x) => {
      const what = x.status ? (STATUS_BY_KEY[x.status] || { label: x.status }).label : x.event;
      return `<li><span>${esc(what)} <span class="muted">· ${esc(x.by || "")}</span></span><span>${esc(fmtStamp(x.at))}</span></li>`;
    }).join("")}</ul>`;
  }
  function loadListText(o) {
    const parts = (o.estimate && o.estimate.parts) || {};
    const lines = [
      `${o.ref} · ${o.site && o.site.address}`,
      `Start ${fmtDate(o.schedule && o.schedule.start)}${o.eta ? " · arrival " + o.eta : ""}`,
      `${o.estimate && o.estimate.area} m², ${NUM.format(((o.estimate && o.estimate.weightKg) || 0) / 1000)} t`,
      ""
    ];
    E.PARTS.forEach((p) => { if (parts[p.key] > 0) lines.push(`${parts[p.key]} × ${p.name}`); });
    if (o.notes) lines.push("", "Notes: " + o.notes);
    return lines.join("\n");
  }

  /* ---------- Settings ---------- */
  const SET_FIELDS = [
    { id: "rentPerM2Day", label: "Rent", unit: "€ per m² per day", step: 0.01 },
    { id: "minRentDays", label: "Minimum rental", unit: "days", step: 1 },
    { id: "erectPerM2", label: "Erection", unit: "€ per m²", step: 0.1 },
    { id: "dismantlePerM2", label: "Dismantling", unit: "€ per m²", step: 0.1 },
    { id: "catchPerMetre", label: "Roof-catch guard", unit: "€ per running m", step: 0.5 },
    { id: "truckCapacityKg", label: "Truck load", unit: "kg per load", step: 50 },
    { id: "zA", label: "Zone A trip", unit: "€", step: 5, get: (p) => p.zones.A.trip, set: (p, v) => { p.zones.A.trip = v; } },
    { id: "zB", label: "Zone B trip", unit: "€", step: 5, get: (p) => p.zones.B.trip, set: (p, v) => { p.zones.B.trip = v; } },
    { id: "zC", label: "Zone C trip", unit: "€", step: 5, get: (p) => p.zones.C.trip, set: (p, v) => { p.zones.C.trip = v; } },
    { id: "uX", label: "Express premium", unit: "% on service", step: 1, get: (p) => p.urgency.express.pct, set: (p, v) => { p.urgency.express.pct = v; } },
    { id: "uE", label: "Emergency premium", unit: "% on service", step: 1, get: (p) => p.urgency.emergency.pct, set: (p, v) => { p.urgency.emergency.pct = v; } },
    { id: "minOrder", label: "Minimum order", unit: "€ excl. VAT", step: 10 },
    { id: "vat", label: "VAT", unit: "%", step: 0.1 },
    { id: "rangePct", label: "Quote range", unit: "± %", step: 1 }
  ];
  function renderSettings(p) {
    $("#set-grid").innerHTML = SET_FIELDS.map((f) => {
      const v = f.get ? f.get(p) : p[f.id];
      return `<label class="field"><span>${esc(f.label)} <span class="hint">${esc(f.unit)}</span></span><input type="number" id="set-${f.id}" step="${f.step}" min="0" value="${esc(v)}"></label>`;
    }).join("");
  }

  /* ---------- Events ---------- */
  function bind() {
    $("#login-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      $("#login-err").textContent = "";
      try {
        await api("POST", "/api/office/login", { password: $("#login-pw").value });
        $("#login-pw").value = "";
        showOffice();
      } catch (e) {
        $("#login-err").textContent = e.message;
      }
    });
    $("#logout").addEventListener("click", async () => {
      try { await api("POST", "/api/office/logout", {}); } catch {}
      S.orders = []; S.selected = null; showLogin();
    });
    $("#filters").addEventListener("click", (ev) => { const b = ev.target.closest("[data-filter]"); if (!b) return; S.filter = b.dataset.filter; renderList(); });
    $("#o-search").addEventListener("input", (ev) => { S.search = ev.target.value; renderList(); });
    const pick = (tr) => {
      if (!tr) return;
      S.selected = tr.dataset.ref; renderList(); renderDetail(true);
      if (window.innerWidth < 1060) $("#d-card").scrollIntoView({ block: "start" });
    };
    $("#o-rows").addEventListener("click", (ev) => pick(ev.target.closest("tr[data-ref]")));
    $("#o-rows").addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(ev.target.closest("tr[data-ref]")); } });
    $("#d-status-save").addEventListener("click", () => {
      const o = selected(), status = $("#d-status").value;
      if (o && status !== o.status) patch(o.ref, { status }, `${o.ref}: ${STATUS_BY_KEY[status].label}`);
    });
    $("#d-next").addEventListener("click", (ev) => {
      const o = selected(), status = ev.currentTarget.dataset.next;
      if (o && status) patch(o.ref, { status }, `${o.ref}: ${STATUS_BY_KEY[status].label}`);
    });
    $("#d-save").addEventListener("click", () => {
      const o = selected();
      if (o) patch(o.ref, { crew: $("#d-crew").value.trim(), eta: $("#d-eta").value.trim() }, "Crew and arrival saved. The customer sees the arrival window.");
    });
    $("#d-reply-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const o = selected(), text = $("#d-reply").value.trim();
      if (!o || !text) return;
      if (await patch(o.ref, { message: text }, "Reply sent. The customer sees it on the tracking page.")) $("#d-reply").value = "";
    });
    $("#d-load").addEventListener("click", (ev) => {
      if (!ev.target.closest("#d-copy")) return;
      const o = selected();
      if (!o) return;
      const p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(loadListText(o)) : Promise.reject();
      p.then(() => toast("Load list copied.")).catch(() => toast("Copy isn't available in this browser. Select the table and copy it."));
    });
    $("#d-delete").addEventListener("click", () => { $("#d-delete").hidden = true; $("#d-delete-confirm").hidden = false; });
    $("#d-delete-no").addEventListener("click", () => { $("#d-delete").hidden = false; $("#d-delete-confirm").hidden = true; });
    $("#d-delete-yes").addEventListener("click", async () => {
      const o = selected();
      if (!o) return;
      try {
        await api("DELETE", `/api/office/orders/${encodeURIComponent(o.ref)}`);
        S.orders = S.orders.filter((x) => x.ref !== o.ref); S.selected = null;
        renderList(); renderDetail(true);
        toast(`${o.ref} deleted.`);
      } catch (e) {
        if (!handleAuthError(e)) toast(e.message);
      }
    });
    $("#set-save").addEventListener("click", async () => {
      const p = clone(S.pricing);
      for (const f of SET_FIELDS) {
        const v = Number($("#set-" + f.id).value);
        if (!Number.isFinite(v) || v < 0) { toast("Use zero or a positive number in every field."); return; }
        if (f.set) f.set(p, v); else p[f.id] = v;
      }
      try {
        const r = await api("PUT", "/api/office/pricing", { pricing: p });
        S.pricing = mergePricing(r.pricing); renderSettings(S.pricing);
        toast("Pricing saved. New quotes use these numbers.");
      } catch (e) {
        if (!handleAuthError(e)) toast(e.message);
      }
    });
    $("#set-reset").addEventListener("click", () => { renderSettings(clone(E.DEFAULT_PRICING)); toast("Defaults filled in. Save to apply them."); });
  }

  bind();
  renderList();
  api("GET", "/api/office/me").then(showOffice).catch((e) => {
    showLogin();
    if (e.status !== 401) $("#login-err").textContent = e.message;
  });
})();
