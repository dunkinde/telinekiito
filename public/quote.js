// Customer page: instant quote, address lookup, drawing reading, ordering and tracking.
(function () {
  "use strict";
  const { E, I, t, $, $$, EUR, EUR2, NUM, esc, clone, digits, fmtDate, fmtStamp, STATUS_BY_KEY, statusLabel, statusCust, chip,
    jobLabel, roofLabel, zoneLabel, urgLabel, sideName, lineLabel, toast, api, mergePricing, renderMsgs } = window.TK;

  const PRESETS = {
    p1: { length: 15, width: 10, floors: "1", roofType: "gable", pitch: 30 },
    p2: { length: 12, width: 9, floors: "1.5", roofType: "gable", pitch: 40 },
    p3: { length: 10, width: 8, floors: "2", roofType: "gable", pitch: 30 }
  };

  const S = {
    view: "quote",
    pricing: clone(E.DEFAULT_PRICING),
    features: { ai: false },
    form: {
      // Starts empty: no price until the customer gives an address, a drawing or the house size.
      preset: "", length: "", width: "", floors: "", eave: "", eaveAuto: true, roofType: "gable", pitch: 30,
      jobType: "roof", gables: true, address: "", zone: "A", urgency: "standard", start: "", days: 28,
      name: "", phone: "", email: "", notes: ""
    },
    source: "form",
    est: null, q: null,
    aiFiles: [],
    track: { ref: null, phone4: null, order: null, timer: null }
  };

  /* ---------- Quote ---------- */
  function houseFromForm(f) {
    return {
      length: Number(f.length), width: Number(f.width), eave: Number(f.eave), floors: f.floors,
      roofType: f.roofType, pitch: f.roofType === "flat" ? 0 : Number(f.pitch), jobType: f.jobType,
      gables: f.roofType === "gable" && f.jobType === "roof" ? !!f.gables : false
    };
  }
  const validHouse = (h) => h.length >= 3 && h.length <= 60 && h.width >= 3 && h.width <= 40 && h.eave >= 2 && h.eave <= 12 && h.pitch >= 0 && h.pitch <= 60;

  function renderZoneOptions() {
    const sel = $("#f-zone");
    sel.innerHTML = ["A", "B", "C"].map((z) => `<option value="${z}">${esc(t("q.zone.option", { label: zoneLabel(z), price: EUR.format(S.pricing.zones[z].trip) }))}</option>`).join("");
    sel.value = S.form.zone;
  }
  function renderUrgency() {
    const now = new Date();
    $("#urgency-opts").innerHTML = ["standard", "express", "emergency"].map((k) => {
      const u = S.pricing.urgency[k];
      return `<label class="opt"><input type="radio" name="urgency" value="${k}" id="f-urg-${k}"${S.form.urgency === k ? " checked" : ""}>` +
        `<span class="oc"><b>${esc(urgLabel(k))} · ${esc(t("urgLead." + k))}</b><small>${esc(t("q.earliest", { date: fmtDate(E.earliestStart(k, now)) }))}</small>` +
        `<span class="tag${u.pct > 0 ? " prem" : ""}">${esc(u.pct > 0 ? t("q.surcharge", { pct: NUM.format(u.pct) }) : t("q.noSurcharge"))}</span></span></label>`;
    }).join("");
  }
  function syncStartMin() {
    const earliest = E.earliestStart(S.form.urgency, new Date());
    $("#f-start").min = earliest;
    if (!S.form.start || S.form.start < earliest) { S.form.start = earliest; $("#f-start").value = earliest; }
  }
  function renderForm() {
    const f = S.form;
    $("#f-length").value = f.length; $("#f-width").value = f.width; $("#f-eave").value = f.eave; $("#f-pitch").value = f.pitch;
    $$('input[name="floors"]').forEach((r) => { r.checked = r.value === String(f.floors); });
    $$('input[name="roofType"]').forEach((r) => { r.checked = r.value === f.roofType; });
    $$('input[name="jobType"]').forEach((r) => { r.checked = r.value === f.jobType; });
    $("#f-gables").checked = !!f.gables;
    $("#f-days").value = f.days; $("#f-start").value = f.start; $("#f-zone").value = f.zone;
    ["address", "name", "phone", "email", "notes"].forEach((k) => { const el = $("#f-" + k); if (el.value !== f[k]) el.value = f[k]; });
    $("#days-hint").textContent = t("q.days.hint", { n: S.pricing.minRentDays });
    renderFormLight();
  }
  function renderFormLight() {
    const f = S.form;
    $("#gables-row").hidden = !(f.roofType === "gable" && f.jobType === "roof");
    $("#pitch-field").hidden = f.roofType === "flat";
    if (f.eaveAuto && $("#f-eave") !== document.activeElement) $("#f-eave").value = f.eave;
    if ($("#f-pitch") !== document.activeElement) $("#f-pitch").value = f.pitch;
    $("#eave-hint").textContent = t(f.eaveAuto ? "q.eave.auto" : "q.eave.own");
    $$("#presets [data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === f.preset)));
    $$("#days-chips [data-days]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === Number(f.days))));
  }

  function recalc() {
    const h = houseFromForm(S.form);
    if (!validHouse(h)) { S.est = null; S.q = null; return renderTicket(); }
    S.est = E.estimate(h);
    S.q = E.quote(S.est, { days: Number(S.form.days) || 0, zone: S.form.zone, urgency: S.form.urgency }, S.pricing);
    renderTicket();
  }

  function planSVG(h, est) {
    const W = 340, H = 220, pad = 38, L = h.length, D = h.width, off = 1.3;
    const sc = Math.min((W - 2 * pad) / (L + 2 * off), (H - 2 * pad) / (D + 2 * off));
    const hw = L * sc, hh = D * sc, x0 = (W - hw) / 2, y0 = (H - hh) / 2;
    const gap = Math.max(2, 0.3 * sc), sw = Math.max(7, 0.73 * sc), ext = 1.0 * sc;
    const f = (n) => n.toFixed(1);
    const out = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("t.planAria"))}">`];
    est.sides.forEach((s) => {
      let r, c;
      const top = s.name === "Long side A", bottom = s.name === "Long side B", left = / A$/.test(s.name) && !top;
      if (top) { r = [x0 - ext, y0 - gap - sw, hw + 2 * ext, sw]; c = [x0 - ext, y0 - gap - sw - 4, x0 + hw + ext, y0 - gap - sw - 4]; }
      else if (bottom) { r = [x0 - ext, y0 + hh + gap, hw + 2 * ext, sw]; c = [x0 - ext, y0 + hh + gap + sw + 4, x0 + hw + ext, y0 + hh + gap + sw + 4]; }
      else if (left) { r = [x0 - gap - sw, y0 - ext, sw, hh + 2 * ext]; c = [x0 - gap - sw - 4, y0 - ext, x0 - gap - sw - 4, y0 + hh + ext]; }
      else { r = [x0 + hw + gap, y0 - ext, sw, hh + 2 * ext]; c = [x0 + hw + gap + sw + 4, y0 - ext, x0 + hw + gap + sw + 4, y0 + hh + ext]; }
      out.push(`<rect class="pl-strip" x="${f(r[0])}" y="${f(r[1])}" width="${f(r[2])}" height="${f(r[3])}"/>`);
      if (s.catchOn) out.push(`<line class="pl-catch" x1="${f(c[0])}" y1="${f(c[1])}" x2="${f(c[2])}" y2="${f(c[3])}"/>`);
    });
    out.push(`<rect class="pl-house" x="${f(x0)}" y="${f(y0)}" width="${f(hw)}" height="${f(hh)}"/>`);
    const my = y0 + hh / 2;
    if (h.roofType === "gable") out.push(`<line class="pl-ridge" x1="${f(x0)}" y1="${f(my)}" x2="${f(x0 + hw)}" y2="${f(my)}"/>`);
    else if (h.roofType === "hip") {
      const inset = Math.min(hh / 2, hw / 2), rx1 = x0 + inset, rx2 = x0 + hw - inset;
      out.push(`<path class="pl-ridge" d="M${f(x0)},${f(y0)} L${f(rx1)},${f(my)} L${f(x0)},${f(y0 + hh)} M${f(x0 + hw)},${f(y0)} L${f(rx2)},${f(my)} L${f(x0 + hw)},${f(y0 + hh)} M${f(rx1)},${f(my)} L${f(rx2)},${f(my)}"/>`);
    }
    out.push(`<text class="pl-label" x="${f(W / 2)}" y="${f(Math.max(12, y0 - gap - sw - 10))}" text-anchor="middle">${NUM.format(L)} m</text>`);
    const lx = Math.max(12, x0 - gap - sw - 12);
    out.push(`<text class="pl-label" x="${f(lx)}" y="${f(my)}" text-anchor="middle" transform="rotate(-90 ${f(lx)} ${f(my)})">${NUM.format(D)} m</text>`);
    out.push("</svg>");
    return out.join("");
  }

  function renderTicket() {
    const box = $("#ticket");
    if (!S.est || !S.q) {
      const f = S.form, empty = !f.length || !f.width || !f.eave;
      box.innerHTML = `<div><div class="eyebrow">${esc(t("t.estimate"))}</div><div class="total">${EUR.format(0)}</div><div class="range">${esc(t(empty ? "t.start" : "t.badSize"))}</div></div>`;
      return;
    }
    const est = S.est, q = S.q, tot = est.totals, h = houseFromForm(S.form);
    const vat = NUM.format(S.pricing.vat);
    const sidesRows = est.sides.map((s) =>
      `<tr><td>${esc(sideName(s.name))}${s.catchOn ? ` <span class="small muted">${esc(t("t.plusCatch"))}</span>` : ""}</td><td class="r">${s.bays}</td><td class="r">${s.lifts}</td><td class="r">${NUM.format(s.workH)} m</td><td class="r">${Math.round(s.area)}</td></tr>`
    ).join("");
    const lineRows = q.lines.map((l) => `<tr><td>${esc(lineLabel(l, q))}</td><td class="r">${EUR.format(l.amount)}</td></tr>`).join("");
    box.innerHTML =
      `<div><div class="eyebrow">${esc(t("t.estimate"))} · ${esc(jobLabel(S.form.jobType))}</div>` +
      `<div class="total">${EUR.format(q.total)}</div>` +
      `<div class="range">${esc(t("t.range", { vat, low: EUR.format(q.low), high: EUR.format(q.high) }))}</div></div>` +
      `<div class="figs"><div><b>${tot.area}</b><span>${esc(t("t.m2"))}</span></div><div><b>${NUM.format(tot.runM)}</b><span>${esc(t("t.runM"))}</span></div><div><b>${NUM.format(tot.weightKg / 1000)}</b><span>${esc(t("t.tonnes"))}</span></div><div><b>${EUR2.format(q.perM2).replace(/\s?€/, "")}</b><span>${esc(t("t.perM2"))}</span></div></div>` +
      `<div class="plan">${planSVG(h, est)}<div class="legend"><span><i class="lg-strip"></i>${esc(t("t.scaffold"))}</span>${tot.catchRunM > 0 ? `<span><i class="lg-catch"></i>${esc(t("t.catchGuard"))}</span>` : ""}</div></div>` +
      `<div class="tbl-wrap"><table><thead><tr><th>${esc(t("t.side"))}</th><th class="r">${esc(t("t.bays"))}</th><th class="r">${esc(t("t.levels"))}</th><th class="r">${esc(t("t.workH"))}</th><th class="r">m²</th></tr></thead><tbody>${sidesRows}</tbody></table></div>` +
      `<table class="lines"><tbody>${lineRows}<tr class="sum"><td>${esc(t("t.net"))}</td><td class="r">${EUR.format(q.net)}</td></tr>` +
      `<tr><td>${esc(t("t.vat", { vat }))}</td><td class="r">${EUR.format(q.vat)}</td></tr>` +
      `<tr class="grand"><td>${esc(t("t.total"))}</td><td class="r">${EUR.format(q.total)}</td></tr></tbody></table>` +
      `<p class="note">${esc(t("t.labour", { amount: EUR.format(q.labourGross) }))}</p>`;
  }

  function bindForm() {
    $("#q-form").addEventListener("input", (ev) => {
      const el = ev.target, k = el.dataset.f;
      if (el.name === "floors") { S.form.floors = el.value; if (S.form.eaveAuto) S.form.eave = E.EAVE_BY_FLOORS[el.value]; S.form.preset = ""; }
      else if (el.name === "roofType") { S.form.roofType = el.value; if (el.value === "flat") S.form.pitch = 0; else if (!S.form.pitch) S.form.pitch = 30; S.form.preset = ""; }
      else if (el.name === "jobType") S.form.jobType = el.value;
      else if (el.name === "urgency") { S.form.urgency = el.value; syncStartMin(); }
      else if (k === "gables") S.form.gables = el.checked;
      else if (k) {
        S.form[k] = el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value;
        if (k === "eave") S.form.eaveAuto = false;
        if (["length", "width", "eave", "pitch"].includes(k)) S.form.preset = "";
      }
      if (el.name || ["length", "width", "eave", "pitch", "gables", "days", "zone"].includes(k)) { renderFormLight(); recalc(); }
    });
    $("#presets").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-preset]");
      if (!b) return;
      const p = PRESETS[b.dataset.preset];
      Object.assign(S.form, p, { preset: b.dataset.preset, eave: E.EAVE_BY_FLOORS[p.floors], eaveAuto: true });
      S.source = "form";
      renderForm(); recalc();
    });
    $("#days-chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-days]");
      if (!b) return;
      S.form.days = Number(b.dataset.days); renderForm(); recalc();
    });
    $("#q-form").addEventListener("submit", (ev) => { ev.preventDefault(); placeOrder(); });
    $("#q-done-new").addEventListener("click", () => {
      $("#q-done").hidden = true; $("#q-form").hidden = false;
      Object.assign(S.form, { name: "", phone: "", email: "", notes: "", address: "", preset: "", length: "", width: "", floors: "", eave: "", eaveAuto: true });
      S.source = "form";
      S.found = null; S.lastOrder = null;
      $("#addr-result").hidden = true; $("#zone-hint").textContent = "";
      renderForm(); recalc(); window.scrollTo(0, 0);
    });
    $("#q-done-track").addEventListener("click", () => {
      $("#tr-ref").value = S.lastRef || ""; $("#tr-phone").value = S.lastPhone4 || "";
      setView("track"); findOrder();
    });
  }

  async function placeOrder() {
    const f = S.form, err = $("#q-err");
    err.textContent = "";
    if (!S.est) { err.textContent = t("q.err.size"); return; }
    if (!f.floors) { err.textContent = t("q.err.floors"); return; }
    if (!f.address.trim()) { err.textContent = t("q.err.address"); $("#f-address").focus(); return; }
    if (!f.name.trim()) { err.textContent = t("q.err.name"); $("#f-name").focus(); return; }
    if (digits(f.phone).length < 6) { err.textContent = t("q.err.phone"); $("#f-phone").focus(); return; }
    const btn = $("#q-submit");
    btn.disabled = true; btn.textContent = t("q.submitting");
    const h = houseFromForm(f);
    try {
      const r = await api("POST", "/api/orders", {
        ...h, floors: f.floors, zone: f.zone, urgency: f.urgency, start: f.start, days: Number(f.days) || S.pricing.minRentDays,
        name: f.name, phone: f.phone, email: f.email, address: f.address, notes: f.notes, source: S.source
      });
      S.lastRef = r.ref; S.lastPhone4 = digits(f.phone).slice(-4); S.lastOrder = r.order;
      $("#q-done-ref").textContent = r.ref;
      renderDone();
      $("#q-form").hidden = true; $("#q-done").hidden = false;
      $("#q-done").scrollIntoView({ block: "start" });
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = t("q.submit");
    }
  }

  /* ---------- Address lookup ---------- */
  // Small picture of the building found on the map, long side left-right, so the customer can recognise it.
  function outlineSVG(outline, hs, estimated) {
    if (!hs.length || !hs.width) return "";
    const W = 150, H = 104, pad = 8, labelW = 34, labelH = 16;
    const pts = outline && outline.length >= 3 ? outline : [[0, 0], [hs.length, 0], [hs.length, hs.width], [0, hs.width]];
    const maxX = Math.max(...pts.map((p) => p[0])), maxY = Math.max(...pts.map((p) => p[1]));
    const sc = Math.min((W - 2 * pad - labelW) / Math.max(maxX, 1), (H - 2 * pad - labelH) / Math.max(maxY, 1));
    const ox = pad + (W - 2 * pad - labelW - maxX * sc) / 2, oy = pad + (H - 2 * pad - labelH - maxY * sc) / 2;
    const f = (n) => n.toFixed(1);
    const poly = pts.map(([x, y]) => `${f(ox + x * sc)},${f(oy + (maxY - y) * sc)}`).join(" ");
    return `<svg class="outline" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("a.outlineAria"))}">` +
      `<polygon class="pl-house${estimated ? " est" : ""}" points="${poly}"/>` +
      `<text class="pl-label" x="${f(ox + (maxX * sc) / 2)}" y="${f(oy + maxY * sc + 13)}" text-anchor="middle">${NUM.format(hs.length)} m</text>` +
      `<text class="pl-label" x="${f(ox + maxX * sc + 5)}" y="${f(oy + (maxY * sc) / 2)}" text-anchor="start" dominant-baseline="middle">${NUM.format(hs.width)} m</text>` +
      `</svg>`;
  }

  async function findHouse() {
    const text = $("#f-address").value.trim();
    const box = $("#addr-result");
    S.found = null;
    if (text.length < 5) { box.hidden = false; box.className = "found warn"; box.textContent = t("a.short"); return; }
    const btn = $("#addr-find");
    btn.disabled = true; btn.textContent = t("q.finding");
    box.hidden = false; box.className = "found"; box.textContent = t("a.looking");
    try {
      const r = await api("POST", "/api/address", { address: text });
      if (!r.found) {
        box.className = "found warn";
        box.textContent = t("a.notFound");
        return;
      }
      const hs = r.house;
      if (hs.length && hs.width) Object.assign(S.form, { length: hs.length, width: hs.width, preset: "" });
      if (hs.floors) S.form.floors = hs.floors;
      if (hs.roofType) S.form.roofType = hs.roofType;
      if (hs.pitch) S.form.pitch = hs.pitch;
      if (hs.eave) { S.form.eave = hs.eave; S.form.eaveAuto = false; }
      else { S.form.eave = E.EAVE_BY_FLOORS[S.form.floors] || ""; S.form.eaveAuto = true; }
      if (r.zone) S.form.zone = r.zone;
      S.source = "address";
      S.found = r;
      renderFound();
      renderForm(); recalc();
    } catch (e) {
      box.className = "found warn";
      box.textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = t("q.find");
    }
  }

  // The address result box, kept in S.found so it can be redrawn when the language changes.
  function renderFound() {
    const r = S.found, box = $("#addr-result");
    $("#zone-hint").textContent = r && r.zone ? t("q.zone.fromAddress") : "";
    if (!r) return;
    const hs = r.house, d = r.details || {}, reg = d.register || {};
    const estimated = d.sizeSource === "estimate";
    const facts = [];
    if (hs.length && hs.width) {
      facts.push([`${NUM.format(hs.length)} × ${NUM.format(hs.width)} m`,
        estimated ? t("a.estimated") : d.footprintM2 ? t("a.measuredArea", { m2: d.footprintM2 }) : t("a.measured")]);
    }
    if (hs.floors) facts.push([t("a.floors", { n: hs.floors === "2" ? 2 : 1 }), d.floorsSource === "OpenStreetMap" ? t("a.fromMap") : t("a.register")]);
    if (reg.floorArea || reg.grossFloorArea) facts.push([t("a.floorArea", { m2: NUM.format(reg.floorArea || reg.grossFloorArea) }), t("a.register")]);
    if (reg.completed) facts.push([t("a.built", { year: reg.completed }), t("a.register")]);
    facts.push([t("a.eave", { m: NUM.format(S.form.eave) }), hs.eave ? t("a.eaveMap") : t("a.eaveFloors")]);
    facts.push([t("a.roof", { roof: roofLabel(S.form.roofType) }), hs.roofType ? t("a.fromMap") : t("a.roofAssumed")]);

    const notes = Array.isArray(r.noteCodes)
      ? r.noteCodes.filter((n) => n.code !== "roof_assumed").map((n) => t("note." + n.code, n))
      : (r.notes || []).filter((n) => !/^Roof shape/.test(n));
    const ok = hs.length && !estimated && r.match.houseLevel;
    const mapLink = d.osmWayId ? `https://www.openstreetmap.org/${encodeURIComponent(d.osmType || "way")}/${encodeURIComponent(d.osmWayId)}`
      : `https://www.openstreetmap.org/?mlat=${r.match.lat}&mlon=${r.match.lon}#map=19/${r.match.lat}/${r.match.lon}`;
    box.hidden = false;
    box.className = "found" + (ok ? "" : " warn");
    box.innerHTML =
      `<div class="found-head"><b>${esc(r.match.short || r.match.display)}</b><a href="${mapLink}" target="_blank" rel="noopener">${esc(t("a.map"))}</a></div>` +
      `<div class="found-body">${outlineSVG(d.outline, hs, estimated)}` +
      `<dl class="facts">${facts.map(([v, src]) => `<div><dt>${esc(v)}</dt><dd>${esc(src)}</dd></div>`).join("")}</dl></div>` +
      (notes.length ? `<ul class="found-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
      `<span class="small muted">${esc(t("a.filled"))}</span>`;
  }

  /* ---------- Drawing reading (AI on the server) ---------- */
  function setAI(msg, kind) { const m = $("#ai-msg"); m.textContent = msg; m.className = "ai-msg" + (kind ? " " + kind : ""); }
  function showFiles() {
    $("#ai-files").textContent = S.aiFiles.length ? S.aiFiles.map((f) => f.name).join(", ") : t("ai.drop");
  }
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("ai.badFile"))); };
      img.src = url;
    });
  }
  function bindAI() {
    const input = $("#ai-file"), drop = $("#ai-drop");
    input.addEventListener("change", () => { S.aiFiles = Array.from(input.files || []).slice(0, 3); showFiles(); });
    drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (ev) => {
      ev.preventDefault(); drop.classList.remove("over");
      const fs = Array.from((ev.dataTransfer && ev.dataTransfer.files) || []).filter((f) => /^image\//.test(f.type)).slice(0, 3);
      if (!fs.length) { setAI(t("ai.dropOnly"), "err"); return; }
      S.aiFiles = fs; showFiles();
    });
    $("#ai-go").addEventListener("click", async () => {
      if (!S.aiFiles.length) { setAI(t("ai.chooseFirst"), "err"); return; }
      const btn = $("#ai-go");
      btn.disabled = true;
      setAI(t("ai.reading"), "");
      try {
        const images = await Promise.all(S.aiFiles.map(shrink));
        const r = await api("POST", "/api/ai/drawing", { images, lang: I.lang });
        const h = r.house;
        Object.assign(S.form, { length: h.length, width: h.width, floors: h.floors, roofType: h.roofType, pitch: h.pitch, preset: "" });
        if (h.eave) { S.form.eave = h.eave; S.form.eaveAuto = false; } else { S.form.eave = E.EAVE_BY_FLOORS[h.floors]; S.form.eaveAuto = true; }
        S.source = "ai";
        renderForm(); recalc();
        setAI(t("ai.done", { conf: t("ai.conf." + (h.confidence || "unknown")), notes: h.notes ? h.notes + " " : "" }), "ok");
      } catch (e) {
        setAI(e.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Tracking ---------- */
  function normRef(v) {
    let s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let prefix = "TK";
    if (s.startsWith("TK") || s.startsWith("TP")) { prefix = s.slice(0, 2); s = s.slice(2); }
    return s ? prefix + "-" + s : "";
  }
  async function findOrder() {
    const ref = normRef($("#tr-ref").value), last4 = digits($("#tr-phone").value);
    const err = $("#tr-err");
    err.textContent = "";
    if (ref.length < 9) { err.textContent = t("tr.err.ref"); return; }
    if (last4.length !== 4) { err.textContent = t("tr.err.phone"); return; }
    $("#tr-ref").value = ref;
    try {
      const o = await api("POST", `/api/orders/${encodeURIComponent(ref)}/view`, { phone: last4 });
      S.track = { ...S.track, ref, phone4: last4, order: o };
      renderTrack();
      startPolling();
    } catch (e) {
      $("#tr-card").hidden = true;
      err.textContent = e.message;
    }
  }
  function startPolling() {
    clearInterval(S.track.timer);
    S.track.timer = setInterval(async () => {
      if (S.view !== "track" || !S.track.ref || document.hidden) return;
      try {
        const o = await api("POST", `/api/orders/${encodeURIComponent(S.track.ref)}/view`, { phone: S.track.phone4 });
        if (o.updatedAt !== (S.track.order && S.track.order.updatedAt)) { S.track.order = o; renderTrack(); }
      } catch {}
    }, 30000);
  }
  function lastAt(o, status) {
    let at = null;
    (o.history || []).forEach((h) => { if (h.status === status) at = h.at; });
    return at;
  }
  function renderTrack() {
    const o = S.track.order, card = $("#tr-card");
    if (!o) { card.hidden = true; return; }
    card.hidden = false;
    const cur = (STATUS_BY_KEY[o.status] || { i: 0 }).i;
    const steps = E.STATUSES.filter((s) => s.key !== "pickup_requested" || o.status === "pickup_requested" || lastAt(o, "pickup_requested"));
    const tl = steps.map((s) => {
      const i = STATUS_BY_KEY[s.key].i, at = lastAt(o, s.key);
      const cls = i < cur ? "done" : i === cur ? "now" : "todo";
      return `<li class="${cls}"><span class="dot" aria-hidden="true"></span><div><b>${esc(statusLabel(s.key))}</b>${i === cur ? `<div class="small">${esc(statusCust(s.key))}</div>` : ""}</div><span class="when">${at && i <= cur ? esc(fmtStamp(at)) : ""}</span></li>`;
    }).join("");
    $("#tr-body").innerHTML =
      `<div class="card-head"><div><div class="eyebrow">${esc(t("tr.order"))}${o.example ? " · " + esc(t("tr.example")) : ""}</div><h2 class="mono">${esc(o.ref)}</h2><p class="muted">${esc(o.site && o.site.address)}</p></div>${chip(o.status)}</div>` +
      (o.eta ? `<p><b>${esc(t("tr.arrival"))}</b> ${esc(o.eta)}${o.crew ? " · " + esc(o.crew) : ""}</p>` : "") +
      `<ol class="timeline">${tl}</ol>` +
      `<div class="kv"><div><span>${esc(t("tr.start"))}</span><b>${esc(fmtDate(o.schedule && o.schedule.start))}</b></div>` +
      `<div><span>${esc(t("tr.rental"))}</span><b>${esc(t("tr.days", { n: (o.quote && o.quote.rentDays) || (o.schedule && o.schedule.days) }))}</b></div>` +
      `<div><span>${esc(t("tr.scaffold"))}</span><b>${esc(o.estimate && o.estimate.area)} m² · ${esc(jobLabel(o.house && o.house.jobType))}</b></div>` +
      `<div><span>${esc(t("tr.price"))}</span><b>${o.quote ? EUR.format(o.quote.total) : "—"}</b></div>` +
      `<div><span>${esc(t("tr.zone"))}</span><b>${esc(zoneLabel(o.site && o.site.zone))}</b></div></div>`;
    const finished = o.status === "dismantled" || o.status === "closed";
    $("#tr-extend").disabled = finished;
    $("#tr-pickup").disabled = o.status !== "erected";
    renderMsgs($("#tr-msgs"), o);
  }
  async function trackAction(action, extra, okMsg) {
    if (!S.track.order) return;
    try {
      const o = await api("POST", `/api/orders/${encodeURIComponent(S.track.ref)}/${action}`, { phone: S.track.phone4, ...extra });
      S.track.order = o; renderTrack();
      toast(typeof okMsg === "function" ? okMsg(o) : okMsg);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }
  function bindTrack() {
    $("#tr-form").addEventListener("submit", (ev) => { ev.preventDefault(); findOrder(); });
    $("#tr-extend").addEventListener("click", () => trackAction("extend", {}, (o) => t("tr.extended", { days: o.schedule.days, price: EUR.format(o.quote.total) })));
    $("#tr-pickup").addEventListener("click", () => trackAction("pickup", {}, () => t("tr.pickupDone")));
    $("#tr-msg-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const text = $("#tr-msg").value.trim();
      if (!text) return;
      if (await trackAction("message", { text }, () => t("tr.msgSent"))) $("#tr-msg").value = "";
    });
  }

  /* ---------- Views and boot ---------- */
  function setView(v) {
    if (!["quote", "track"].includes(v)) v = "quote";
    S.view = v;
    ["quote", "track"].forEach((k) => {
      $("#view-" + k).hidden = k !== v;
      $("#tab-" + k).setAttribute("aria-current", k === v ? "page" : "false");
    });
    try { history.replaceState(null, "", "#" + v); } catch {}
    window.scrollTo(0, 0);
  }

  $$(".tab[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#addr-find").addEventListener("click", findHouse);
  $("#f-address").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); findHouse(); } });
  function renderDone() {
    const o = S.lastOrder;
    if (!o) return;
    $("#q-done-text").textContent = t("q.done.text", { price: EUR.format(o.quote.total), date: fmtDate(o.schedule.start) });
  }

  bindForm(); bindAI(); bindTrack(); showFiles();
  syncStartMin(); renderZoneOptions(); renderUrgency(); renderForm(); recalc();
  setView((location.hash || "").replace("#", "") || "quote");

  api("GET", "/api/config").then((cfg) => {
    S.pricing = mergePricing(cfg.pricing);
    S.features = cfg.features || {};
    $("#ai-box").hidden = !S.features.ai;
    renderZoneOptions(); renderUrgency(); renderForm(); recalc();
  }).catch(() => toast(t("cfg.failed")));

  // Redraw everything that is built in script when the language changes.
  I.onChange(() => {
    renderZoneOptions(); renderUrgency(); renderForm(); recalc(); renderFound(); showFiles(); renderDone();
    if (S.track.order) renderTrack();
    const msg = $("#ai-msg"); if (msg.textContent) msg.textContent = "";
    $("#q-err").textContent = ""; $("#tr-err").textContent = "";
  });
})();
