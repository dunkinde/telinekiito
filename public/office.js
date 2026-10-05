// Office page: login, order list, status updates, load lists, messages, pricing.
(function () {
  "use strict";
  const { E, I, t, $, $$, EUR, NUM, esc, clone, fmtDate, fmtStamp, fmtTime, STATUS_BY_KEY, statusLabel, chip,
    jobLabel, roofLabel, zoneLabel, urgLabel, partName, sideName, lineLabel, toast, api, mergePricing, renderMsgs } = window.TK;

  const S = { orders: [], loaded: false, selected: null, filter: "all", search: "", pricing: clone(E.DEFAULT_PRICING), timer: null, lastSync: 0 };

  const FILTERS = [
    { key: "all", test: () => true },
    { key: "new", test: (o) => o.status === "received" },
    { key: "upcoming", test: (o) => ["confirmed", "loading", "en_route"].includes(o.status) },
    { key: "onsite", test: (o) => o.status === "erected" || o.status === "pickup_requested" },
    { key: "done", test: (o) => o.status === "dismantled" || o.status === "closed" }
  ];

  /* ---------- Login ---------- */
  function showLogin() {
    $("#login-view").hidden = false; $("#office-view").hidden = true; $("#logout").hidden = true;
    clearInterval(S.timer);
    setTimeout(() => $("#login-pw").focus(), 50);
  }
  async function showOffice() {
    $("#login-view").hidden = true; $("#office-view").hidden = false; $("#logout").hidden = false;
    await Promise.all([loadOrders(), loadPricing(), loadLeads()]);
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (!document.hidden) { loadOrders(true); loadLeads(); } }, 20000);
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
      renderList(); renderDetail(false); renderSync(); renderLeads();
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
  async function loadLeads() {
    try {
      const r = await api("GET", "/api/office/leads");
      S.leads = r.leads || [];
      renderLeads();
    } catch (e) {
      handleAuthError(e);
    }
  }
  // Messages from the website's contact form.
  function renderLeads() {
    const ls = S.leads || [];
    $("#leads-count").textContent = String(ls.length);
    $("#leads-list").innerHTML = ls.length
      ? `<ul class="leads">${ls.map((l) =>
          `<li><div class="lead-head"><b>${esc(l.name)}</b> <a href="mailto:${encodeURIComponent(l.email)}">${esc(l.email)}</a>${l.phone ? ` · <span class="mono">${esc(l.phone)}</span>` : ""}` +
          `<span class="muted small">${esc(fmtStamp(l.createdAt))} · ${esc(String(l.lang || "").toUpperCase())}</span></div>` +
          `<p>${esc(l.message)}</p><button class="btn danger" type="button" data-lead="${l.id}">${esc(t("o.leadDelete"))}</button></li>`).join("")}</ul>`
      : `<p class="muted">${esc(t("o.leadsEmpty"))}</p>`;
  }

  function renderSync() {
    if (S.lastSync) $("#sync-text").textContent = t("o.updated", { time: fmtTime(S.lastSync) });
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
      if (okMsg) toast(typeof okMsg === "function" ? okMsg() : okMsg);
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
      `<div class="stat"><b>${toConfirm}</b><span>${esc(t("o.stat.toConfirm"))}</span></div>` +
      `<div class="stat"><b>${dispatch}</b><span>${esc(t("o.stat.deliveries"))}</span></div>` +
      `<div class="stat"><b>${Math.round(m2)} m²</b><span>${esc(t("o.stat.onHire"))}</span></div>` +
      `<div class="stat"><b>${EUR.format(open)}</b><span>${esc(t("o.stat.open"))}</span></div>`;
  }
  function renderFilters() {
    $("#filters").innerHTML = FILTERS.map((f) =>
      `<button type="button" class="chip-btn" data-filter="${f.key}" aria-pressed="${S.filter === f.key}">${esc(t("o.f." + f.key))} <span class="num muted">${S.orders.filter(f.test).length}</span></button>`
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
      `<td class="mono nowrap">${esc(o.ref)}${o.example ? `<br><span class="ex">${esc(t("o.example"))}</span>` : ""}</td>` +
      `<td>${esc(o.customer && o.customer.name)}<br><span class="small muted">${esc(o.site && o.site.address)}</span></td>` +
      `<td class="nowrap">${esc(fmtDate(o.schedule && o.schedule.start))}</td>` +
      `<td class="r">${esc(o.estimate && o.estimate.area)}</td>` +
      `<td>${chip(o.status)}${o.schedule && o.schedule.urgency !== "standard" ? ` <span class="chip st-warn">${esc(urgLabel(o.schedule.urgency))}</span>` : ""}</td>` +
      `<td class="r nowrap">${o.quote ? EUR.format(o.quote.total) : "—"}</td></tr>`
    ).join("");
    const empty = $("#o-empty");
    if (!S.loaded) { empty.hidden = false; empty.innerHTML = `<p>${esc(t("o.loading"))}</p>`; }
    else if (!S.orders.length) { empty.hidden = false; empty.innerHTML = `<p><b>${esc(t("o.none"))}</b> ${esc(t("o.noneText"))}</p><a class="btn" href="/">${esc(t("o.testOrder"))}</a>`; }
    else if (!rows.length) { empty.hidden = false; empty.innerHTML = `<p>${esc(t("o.noMatch"))}</p>`; }
    else empty.hidden = true;
  }
  function renderDetail(full) {
    const o = selected();
    $("#d-none").hidden = !!o; $("#d-card").hidden = !o;
    if (!o) return;
    const h = o.house || {};
    const floors = h.floors === "1.5" ? "1½" : h.floors;
    $("#d-head").innerHTML =
      `<div class="card-head"><div><div class="eyebrow">${esc(o.ref)}${o.example ? " · " + esc(t("tr.example")) : ""}</div><h2>${esc(o.customer && o.customer.name)}</h2><p class="muted">${esc(o.site && o.site.address)}</p></div>${chip(o.status)}</div>` +
      `<div class="kv">` +
      `<div><span>${esc(t("o.phone"))}</span><b class="mono">${esc(o.customer && o.customer.phone)}</b></div>` +
      (o.customer && o.customer.email ? `<div><span>${esc(t("o.email"))}</span><b>${esc(o.customer.email)}</b></div>` : "") +
      `<div><span>${esc(t("o.start"))}</span><b>${esc(fmtDate(o.schedule && o.schedule.start))} · ${esc(urgLabel(o.schedule && o.schedule.urgency))}</b></div>` +
      `<div><span>${esc(t("o.rental"))}</span><b>${esc(t("tr.days", { n: o.quote && o.quote.rentDays }))}</b></div>` +
      `<div><span>${esc(t("o.zone"))}</span><b>${esc(zoneLabel(o.site && o.site.zone))}</b></div>` +
      `<div><span>${esc(t("o.house"))}</span><b>${esc(t("o.houseDesc", { l: NUM.format(h.length), w: NUM.format(h.width), floors, roof: roofLabel(h.roofType).toLowerCase(), eave: NUM.format(h.eave) }))}</b></div>` +
      `<div><span>${esc(t("o.job"))}</span><b>${esc(jobLabel(h.jobType))}${o.source === "ai" ? " · " + esc(t("o.ai")) : o.source === "address" ? " · " + esc(t("o.fromAddress")) : ""}</b></div>` +
      `</div>` + (o.notes ? `<p class="note">${esc(o.notes)}</p>` : "");

    const sel = $("#d-status");
    if (full || document.activeElement !== sel) {
      sel.innerHTML = E.STATUSES.map((s) => `<option value="${s.key}"${s.key === o.status ? " selected" : ""}>${esc(statusLabel(s.key))}</option>`).join("");
    }
    const idx = (STATUS_BY_KEY[o.status] || { i: 0 }).i;
    let next = E.STATUSES[idx + 1];
    if (next && next.key === "pickup_requested") next = E.STATUSES[idx + 2];
    $("#d-next").hidden = !next;
    if (next) { $("#d-next").textContent = t("o.next", { label: statusLabel(next.key) }); $("#d-next").dataset.next = next.key; }
    if (full) {
      $("#d-crew").value = o.crew || ""; $("#d-eta").value = o.eta || ""; $("#d-reply").value = "";
      $("#d-delete-confirm").hidden = true; $("#d-delete").hidden = false;
    }

    const parts = (o.estimate && o.estimate.parts) || {};
    const rows = E.PARTS.filter((p) => parts[p.key] > 0).map((p) =>
      `<tr><td>${esc(partName(p.key))}</td><td class="r">${parts[p.key]}</td><td class="r">${NUM.format(parts[p.key] * p.kg)}</td></tr>`
    ).join("");
    const trucks = (o.quote && o.quote.trucks) || 1;
    $("#d-load").innerHTML =
      `<div class="card-head"><h3>${esc(t("o.loadList"))}</h3><button class="btn" type="button" id="d-copy">${esc(t("o.copy"))}</button></div>` +
      `<p class="small muted">${esc(o.estimate && o.estimate.area)} m² · ${NUM.format(((o.estimate && o.estimate.weightKg) || 0) / 1000)} t · ${esc(t("o.loads", { n: trucks }))}</p>` +
      `<div class="tbl-wrap"><table><thead><tr><th>${esc(t("o.part"))}</th><th class="r">${esc(t("o.qty"))}</th><th class="r">kg</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<div class="tbl-wrap"><table><thead><tr><th>${esc(t("t.side"))}</th><th class="r">${esc(t("t.bays"))}</th><th class="r">${esc(t("t.levels"))}</th><th class="r">${esc(t("t.workH"))}</th></tr></thead><tbody>` +
      ((o.estimate && o.estimate.sides) || []).map((s) => `<tr><td>${esc(sideName(s.name))}${s.catchOn ? ` <span class="small muted">${esc(t("t.plusCatch"))}</span>` : ""}</td><td class="r">${s.bays}</td><td class="r">${s.lifts}</td><td class="r">${NUM.format(s.workH)} m</td></tr>`).join("") +
      `</tbody></table></div>`;
    const q = o.quote;
    $("#d-quote").innerHTML = q
      ? `<h3>${esc(t("o.price"))}</h3><table class="lines"><tbody>${q.lines.map((l) => `<tr><td>${esc(lineLabel(l, q))}</td><td class="r">${EUR.format(l.amount)}</td></tr>`).join("")}` +
        `<tr class="sum"><td>${esc(t("t.net"))}</td><td class="r">${EUR.format(q.net)}</td></tr><tr class="grand"><td>${esc(t("t.totalVat"))}</td><td class="r">${EUR.format(q.total)}</td></tr></tbody></table>`
      : "";
    renderMsgs($("#d-msgs"), o);
    $("#d-hist").innerHTML = `<h3>${esc(t("o.history"))}</h3><ul class="hist">${(o.history || []).slice().reverse().map((x) => {
      const ext = x.code === "extended" ? x.days : (/^Rental extended to (\d+) days/.exec(x.event || "") || [])[1];
      const what = x.status ? statusLabel(x.status) : ext ? t("hist.extended", { days: ext }) : x.event;
      const by = x.by ? (I.has("by." + x.by) ? t("by." + x.by) : x.by) : "";
      return `<li><span>${esc(what)} <span class="muted">· ${esc(by)}</span></span><span>${esc(fmtStamp(x.at))}</span></li>`;
    }).join("")}</ul>`;
  }
  function loadListText(o) {
    const parts = (o.estimate && o.estimate.parts) || {};
    const lines = [
      `${o.ref} · ${o.site && o.site.address}`,
      t("o.copyStart", { date: fmtDate(o.schedule && o.schedule.start) }) + (o.eta ? " · " + t("o.copyArrival", { eta: o.eta }) : ""),
      `${o.estimate && o.estimate.area} m², ${NUM.format(((o.estimate && o.estimate.weightKg) || 0) / 1000)} t`,
      ""
    ];
    E.PARTS.forEach((p) => { if (parts[p.key] > 0) lines.push(`${parts[p.key]} × ${partName(p.key)}`); });
    if (o.notes) lines.push("", t("o.copyNotes", { notes: o.notes }));
    return lines.join("\n");
  }

  /* ---------- Settings ---------- */
  const SET_FIELDS = [
    { id: "rentPerM2Day", step: 0.01 },
    { id: "minRentDays", step: 1 },
    { id: "erectPerM2", step: 0.1 },
    { id: "dismantlePerM2", step: 0.1 },
    { id: "catchPerMetre", step: 0.5 },
    { id: "extraLevelPerM", step: 0.5 },
    { id: "truckCapacityKg", step: 50 },
    { id: "zA", step: 5, get: (p) => p.zones.A.trip, set: (p, v) => { p.zones.A.trip = v; } },
    { id: "zB", step: 5, get: (p) => p.zones.B.trip, set: (p, v) => { p.zones.B.trip = v; } },
    { id: "zC", step: 5, get: (p) => p.zones.C.trip, set: (p, v) => { p.zones.C.trip = v; } },
    { id: "uX", step: 1, get: (p) => p.urgency.express.pct, set: (p, v) => { p.urgency.express.pct = v; } },
    { id: "uE", step: 1, get: (p) => p.urgency.emergency.pct, set: (p, v) => { p.urgency.emergency.pct = v; } },
    { id: "minOrder", step: 10 },
    { id: "vat", step: 0.1 },
    { id: "rangePct", step: 1 }
  ];
  function renderSettings(p) {
    $("#set-grid").innerHTML = SET_FIELDS.map((f) => {
      const v = f.get ? f.get(p) : p[f.id];
      return `<label class="field"><span>${esc(t("set." + f.id))} <span class="hint">${esc(t("setU." + f.id))}</span></span><input type="number" id="set-${f.id}" step="${f.step}" min="0" value="${esc(v)}"></label>`;
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
      if (o && status !== o.status) patch(o.ref, { status }, () => `${o.ref}: ${statusLabel(status)}`);
    });
    $("#d-next").addEventListener("click", (ev) => {
      const o = selected(), status = ev.currentTarget.dataset.next;
      if (o && status) patch(o.ref, { status }, () => `${o.ref}: ${statusLabel(status)}`);
    });
    $("#d-save").addEventListener("click", () => {
      const o = selected();
      if (o) patch(o.ref, { crew: $("#d-crew").value.trim(), eta: $("#d-eta").value.trim() }, t("o.toast.crew"));
    });
    $("#d-reply-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const o = selected(), text = $("#d-reply").value.trim();
      if (!o || !text) return;
      if (await patch(o.ref, { message: text }, t("o.toast.reply"))) $("#d-reply").value = "";
    });
    $("#d-load").addEventListener("click", (ev) => {
      if (!ev.target.closest("#d-copy")) return;
      const o = selected();
      if (!o) return;
      const p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(loadListText(o)) : Promise.reject();
      p.then(() => toast(t("o.toast.copied"))).catch(() => toast(t("o.toast.noCopy")));
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
        toast(t("o.toast.deleted", { ref: o.ref }));
      } catch (e) {
        if (!handleAuthError(e)) toast(e.message);
      }
    });
    $("#set-save").addEventListener("click", async () => {
      const p = clone(S.pricing);
      for (const f of SET_FIELDS) {
        const v = Number($("#set-" + f.id).value);
        if (!Number.isFinite(v) || v < 0) { toast(t("o.toast.badNumber")); return; }
        if (f.set) f.set(p, v); else p[f.id] = v;
      }
      try {
        const r = await api("PUT", "/api/office/pricing", { pricing: p });
        S.pricing = mergePricing(r.pricing); renderSettings(S.pricing);
        toast(t("o.toast.saved"));
      } catch (e) {
        if (!handleAuthError(e)) toast(e.message);
      }
    });
    $("#leads-list").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-lead]");
      if (!b) return;
      try {
        await api("DELETE", `/api/office/leads/${encodeURIComponent(b.dataset.lead)}`);
        S.leads = (S.leads || []).filter((l) => String(l.id) !== b.dataset.lead);
        renderLeads(); toast(t("o.toast.leadDeleted"));
      } catch (e) {
        if (!handleAuthError(e)) toast(e.message);
      }
    });
    $("#set-reset").addEventListener("click", () => { renderSettings(clone(E.DEFAULT_PRICING)); toast(t("o.toast.defaults")); });
  }

  bind();
  renderList();
  // Redraw script-built parts when the language changes. Unsaved pricing edits are kept.
  I.onChange(() => {
    renderList(); renderDetail(false); renderSync(); renderLeads();
    if (!$("#set-grid").children.length || !$("#settings").open) renderSettings(S.pricing);
    else {
      SET_FIELDS.forEach((f) => {
        const el = $("#set-" + f.id);
        const span = el && el.parentElement.querySelector("span");
        if (span) span.innerHTML = `${esc(t("set." + f.id))} <span class="hint">${esc(t("setU." + f.id))}</span>`;
      });
    }
  });
  api("GET", "/api/office/me").then(showOffice).catch((e) => {
    showLogin();
    if (e.status !== 401) $("#login-err").textContent = e.message;
  });
})();
