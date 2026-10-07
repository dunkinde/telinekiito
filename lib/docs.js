"use strict";
// Printable documents as plain HTML pages (A4). Open in a browser and print or save as PDF.
// Order confirmation, inspection record (with photos and signature) and invoice, in Finnish or English.
const E = require("./engine");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PART_FI = {
  frames: "Alumiinikehys 2,00 × 0,73 m", baseJacks: "Säätöjalka 0,6 m", decks: "Taso 3,07 × 0,32 m",
  hatchDecks: "Luukkutaso tikkailla 3,07 m", guardrails: "Kaide 3,07 m", toeBoards: "Jalkalista 3,07 m",
  endGuards: "Päätykaide 0,73 m", diagonals: "Vinotuki 3,07 m kentälle", topPosts: "Kaidetolppa 1,0 m",
  catchPosts: "Räystässuojatolppa 2,00 × 0,73 m", catchMesh: "Räystässuojaverkko 3,07 m", anchors: "Seinäankkuri silmukkapultilla",
  wp_sheetRolls: "Sääsuojapeite, rulla 3,3 × 36 m", wp_ties: "Kiinnityskuminauha", wr_eaves: "Keder-katon räystäsosa 18° (556.018)", wr_ridges: "Keder-katon harjaosa 18° (901.018)",
  wr_beam300: "Keder-katon ristikkopalkki 3,00 m (901.300)", wr_beam200: "Keder-katon ristikkopalkki 2,00 m (901.200)", wr_beam100: "Keder-katon ristikkopalkki 1,00 m (901.100)",
  wr_beam050: "Keder-katon ristikkopalkki 0,50 m (901.050)", wr_frames: "Kattotuen kehys 2,50 m (947.250)", wr_ledgers: "O-vaakapuomi 2,50 m ristikoiden väliin (241.250)",
  wr_tarps: "Keder-kattopeite, 2,50 m:n osa", wr_gableTarps: "Keder-päätypeite",
  lr_eaves: "Keder Roof XL räystäsosa", lr_ridges: "Keder Roof XL harjaosa 18°", lr_beam300: "Keder Roof XL ristikkopalkki 3,00 m", lr_beam200: "Keder Roof XL ristikkopalkki 2,00 m", lr_supports: "Kääntyvä kattotuki 0,73 m", lr_ledgers: "Keder Roof XL vaakapuomi 2,57 m", lr_stiffeners: "Keder Roof XL jäykiste 2,57 m", lr_braces: "Keder Roof XL vaakavinotuki", lr_tarps: "Keder-kattopeite 2,57 m leveä", lr_gableTarps: "Keder Roof XL päätypeite",
  mz_baseJacks: "Säätöjalka 0,60 m (111.060)",
  mz_baseCollars: "Aloituskaulus 0,43 m (201.000)",
  mz_standards: "Pystyputki 2,00 m, alumiini (240.200)",
  mz_transoms: "U-poikkipuomi 0,73 m (242.073)",
  mz_ledgers: "O-vaakapuomi 3,07 m (241.307)",
  mz_decks: "U-taso 32, 3,07 × 0,32 m (310.307)",
  mz_accessDecks: "Luukkutaso tikkailla 3,07 × 0,61 m (417.307)",
  mz_guardrails: "Tuplakaide 3,07 m (251.307)",
  mz_endGuards: "Tuplakaide 0,73 m, pääty (251.073)",
  mz_toeBoards: "Jalkalista 3,07 m, alumiini (118.307)",
  mz_endToeBoards: "Päätyjalkalista 0,73 m, alumiini (119.073)",
  mz_braces: "Pystyvinotuki 3,07 × 2,00 m (244.307)",
  mz_topPosts: "Pystyputki 1,00 m kaidetolppana (240.100)",
  mz_catchPosts: "Pystyputki 2,00 m räystässuojatolppana (240.200)",
  mz_catchMesh: "Räystässuojaverkko 3,07 m",
  mz_anchors: "Seinäankkuri 0,50 m silmukkapultilla (112.050 + 112.120)"
};
const partName = (k, lang) => (lang === "fi" ? PART_FI[k] : (E.PARTS.find((p) => p.key === k) || {}).name) || k;

const T = {
  fi: {
    confirmation: "Tilausvahvistus", inspection: "Telineen tarkastuspöytäkirja", invoice: "Lasku",
    po: "Ostotilausnumero", project: "Projekti", costCentre: "Kustannuspaikka",
    order: "Tilaus", date: "Päivämäärä", customer: "Asiakas", site: "Kohde", phone: "Puhelin", email: "Sähköposti",
    house: "Talo", system: "Telinejärjestelmä", job: "Työ", start: "Aloitus", days: "Vuokra-aika", daysUnit: "päivää", urgency: "Toimitus",
    area: "Telineen pinta-ala", weight: "Paino", crew: "Tiimi", line: "Erittely", amount: "Summa", net: "Yhteensä alv 0 %",
    vat: "ALV", total: "Yhteensä", labour: "Työn osuus kotitalousvähennystä varten (sis. ALV)", parts: "Toimitettavat osat",
    qty: "Määrä", checklist: "Tarkastuslista", ok: "Kunnossa", notes: "Huomiot", signature: "Asiakkaan kuittaus",
    signedBy: "Kuittaaja", inspectedBy: "Tarkastaja", inspectedAt: "Tarkastettu", photos: "Kuvat", noSignature: "Kuittausta ei saatu",
    invoiceNo: "Laskun numero", due: "Eräpäivä", reference: "Viitenumero", iban: "Tilinumero", payTo: "Maksun saaja",
    businessId: "Y-tunnus", unitPrice: "à-hinta", pcs: "kpl", rentUsed: "Vuokra-aika käytetty",
    print: "Tulosta tai tallenna PDF", visits: "Määräaikaistarkastukset", visitOk: "Kunnossa", visitIssue: "Huomautettavaa",
    jobs: { roof: "Kattoremontti", facade: "Julkisivutyö", roof_facade: "Katto ja julkisivu", gutters: "Rännit ja räystäät" },
    urg: { standard: "Normaali", express: "Pika (48 h)", emergency: "Kiire (24 h)" },
    items: {
      ground: "Alusta ja säätöjalat tukevalla, tasaisella alustalla", bracing: "Vinotuet paikallaan", anchors: "Seinäankkurit kiinnitetty",
      decks: "Tasot ehjät, täydet ja lukittu", guardrails: "Kaiteet ja jalkalistat kaikilla työtasoilla", access: "Kulkutie (luukkutaso ja tikkaat)",
      catch: "Räystässuoja asennettu", clearance: "Etäisyys sähköjohtoihin tarkistettu", tag: "Telinekortti täytetty ja kiinnitetty"
    },
    lines: {
      rent: (v) => `Vuokra, ${v.days} päivää`, erect: () => "Asennus ja tarkastus", dismantle: () => "Purku", catch: () => "Räystässuoja",
      levels: (v) => `Lisätyötasot, ${v.m} m`, sheeting: (v) => `Sääsuojapeite, ${v.m2} m²`, roofRent: (v) => `Sääsuojakaton vuokra, ${v.m2} m², ${v.days} päivää`, roofWork: () => "Sääsuojakaton asennus ja purku", transport: (v) => `Toimitus ja nouto${v.loads > 1 ? `, ${v.loads} kuormaa` : ""}`,
      premium: (v) => `${v.tier === "emergency" ? "Kiire" : "Pika"}lisä (+${v.pct} % palveluihin)`, min: () => "Vähimmäistilauksen tasaus",
      discount: (v) => `Kumppanialennus −${v.pct} %`, part: (v) => `${v.kind === "missing" ? "Puuttuva" : "Vaurioitunut"}: ${partName(v.part, "fi")}`
    }
  },
  en: {
    confirmation: "Order confirmation", inspection: "Scaffold inspection record", invoice: "Invoice",
    po: "Purchase order", project: "Project", costCentre: "Cost centre",
    order: "Order", date: "Date", customer: "Customer", site: "Site", phone: "Phone", email: "Email",
    house: "House", system: "Scaffold system", job: "Job", start: "Start", days: "Rental", daysUnit: "days", urgency: "Delivery",
    area: "Scaffold area", weight: "Weight", crew: "Crew", line: "Item", amount: "Amount", net: "Total excl. VAT",
    vat: "VAT", total: "Total", labour: "Labour share for the household tax credit (incl. VAT)", parts: "Parts delivered",
    qty: "Qty", checklist: "Checklist", ok: "OK", notes: "Notes", signature: "Customer's acknowledgement",
    signedBy: "Signed by", inspectedBy: "Inspected by", inspectedAt: "Inspected", photos: "Photos", noSignature: "No signature",
    invoiceNo: "Invoice number", due: "Due date", reference: "Reference number", iban: "Account", payTo: "Pay to",
    businessId: "Business ID", unitPrice: "Unit price", pcs: "pcs", rentUsed: "Rental used",
    print: "Print or save as PDF", visits: "Periodic inspections", visitOk: "OK", visitIssue: "Issues noted",
    jobs: { roof: "Roof renovation", facade: "Facade work", roof_facade: "Roof and facade", gutters: "Gutters and eaves" },
    urg: { standard: "Standard", express: "Express (48 h)", emergency: "Emergency (24 h)" },
    items: {
      ground: "Base and jacks on firm, level ground", bracing: "Diagonal braces fitted", anchors: "Wall anchors fixed",
      decks: "Decks complete, undamaged and locked", guardrails: "Guardrails and toe boards on all working levels", access: "Access (hatch deck and ladder)",
      catch: "Roof-catch guard fitted", clearance: "Clearance from power lines checked", tag: "Scaffold tag filled in and attached"
    },
    lines: {
      rent: (v) => `Rent, ${v.days} days`, erect: () => "Erection and inspection", dismantle: () => "Dismantling", catch: () => "Roof-catch protection",
      levels: (v) => `Extra working levels, ${v.m} m`, sheeting: (v) => `Weather sheeting, ${v.m2} m²`, roofRent: (v) => `Temporary roof rent, ${v.m2} m², ${v.days} days`, roofWork: () => "Temporary roof, putting up and taking down", transport: (v) => `Delivery and pickup${v.loads > 1 ? `, ${v.loads} loads` : ""}`,
      premium: (v) => `${v.tier === "emergency" ? "Emergency" : "Express"} premium (+${v.pct} % on service)`, min: () => "Minimum order adjustment",
      discount: (v) => `Partner discount −${v.pct} %`, part: (v) => `${v.kind === "missing" ? "Missing" : "Damaged"}: ${partName(v.part, "en")}`
    }
  }
};

function lineLabel(l, t) {
  const v = l.vars || {};
  if (/^(missing|damaged)_/.test(l.key)) return t.lines.part(v);
  const f = t.lines[l.key];
  try { return f ? f(v) : l.label; } catch { return l.label; }
}

const money = (n, lang) => new Intl.NumberFormat(lang === "fi" ? "fi-FI" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const day = (iso, lang) => (iso ? new Date(String(iso).slice(0, 10) + "T12:00:00Z").toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", { timeZone: "UTC" }) : "–");
const dateTime = (iso, lang) => (iso ? new Date(iso).toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", { timeZone: "Europe/Helsinki", dateStyle: "short", timeStyle: "short" }) : "–");

function page(title, company, body, lang) {
  const c = company || {};
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.5 Inter, system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #0e1217; margin: 0; background: #f3f4f1; }
  .sheet { max-width: 800px; margin: 24px auto; background: #fff; padding: 40px 44px; border-radius: 12px; box-shadow: 0 10px 40px -20px rgba(14,18,23,.3); }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #ffc20e; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: -.01em; } .brand b { color: #e0a800; }
  .co { text-align: right; color: #5d6773; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; } h2 { font-size: 14px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: #5d6773; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; } .grid div span { display: block; color: #5d6773; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 7px 6px; border-bottom: 1px solid #e3e7ea; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5d6773; font-weight: 600; } td.n, th.n { text-align: right; white-space: nowrap; }
  tr.tot td { font-weight: 700; border-bottom: 0; } tr.sub td { color: #5d6773; }
  .box { background: #fff4cc; border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
  .check { display: inline-block; width: 16px; text-align: center; font-weight: 700; } .yes { color: #16a34a; } .no { color: #e5484d; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .photos img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 6px; border: 1px solid #e3e7ea; }
  .sig { height: 90px; border: 1px solid #e3e7ea; border-radius: 6px; display: flex; align-items: center; justify-content: center; } .sig img { max-height: 84px; }
  .bar { max-width: 800px; margin: 16px auto 0; text-align: right; } .bar button { font: inherit; font-weight: 600; background: #0e1217; color: #fff; border: 0; border-radius: 999px; padding: 9px 18px; cursor: pointer; }
  footer { margin-top: 32px; color: #5d6773; font-size: 11px; border-top: 1px solid #e3e7ea; padding-top: 10px; }
  @media print { body { background: #fff; } .sheet { box-shadow: none; margin: 0; padding: 0; max-width: none; } .bar { display: none; } }
</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">${esc(T[lang].print)}</button></div>
<div class="sheet"><header><div><div class="brand">Teline<b>Kiito</b></div></div>
<div class="co">${[c.name, c.businessId ? `${T[lang].businessId} ${c.businessId}` : "", c.address, c.phone, c.email].filter(Boolean).map(esc).join("<br>")}</div></header>
${body}</div></body></html>`;
}

function infoGrid(o, t, lang) {
  return `<div class="grid">
    <div><span>${t.customer}</span>${esc(o.customer.name)}</div>
    <div><span>${t.site}</span>${esc(o.site.address)}</div>
    <div><span>${t.phone}</span>${esc(o.customer.phone)}</div>
    <div><span>${t.email}</span>${esc(o.customer.email || "–")}</div>
    <div><span>${t.job}</span>${esc(t.jobs[o.house.jobType] || o.house.jobType)}</div>
    <div><span>${t.house}</span>${esc(`${o.house.length} × ${o.house.width} m, ${o.house.floors}`)} ${lang === "fi" ? "krs" : "storey"}</div>
    <div><span>${t.start}</span>${day((o.assignment && o.assignment.date) || o.schedule.start, lang)} ${esc((o.assignment && o.assignment.time) || "")}</div>
    <div><span>${t.days}</span>${o.schedule.days} ${t.daysUnit} · ${esc(t.urg[o.schedule.urgency] || "")}</div>
    <div><span>${t.area}</span>${o.estimate.area} m²</div>
    <div><span>${t.system}</span>${esc(E.SYSTEMS[(o.house && o.house.system) || "layher"].name)}</div>
    <div><span>${t.crew}</span>${esc(o.crew || "–")}</div>
  </div>`;
}

function quoteTable(lines, totals, t, lang, { units = false } = {}) {
  const rows = lines.map((l) => units
    ? `<tr><td>${esc(lineLabel(l, t))}</td><td class="n">${l.qty} ${l.unit === "pcs" ? t.pcs : ""}</td><td class="n">${money(l.unitPrice, lang)}</td><td class="n">${money(l.net, lang)}</td></tr>`
    : `<tr><td>${esc(lineLabel(l, t))}</td><td class="n">${money(l.amount, lang)}</td></tr>`).join("");
  const span = units ? 3 : 1;
  return `<table><thead><tr><th>${t.line}</th>${units ? `<th class="n">${t.qty}</th><th class="n">${t.unitPrice}</th>` : ""}<th class="n">${t.amount}</th></tr></thead><tbody>${rows}
    <tr class="sub"><td colspan="${span}">${t.net}</td><td class="n">${money(totals.net, lang)}</td></tr>
    <tr class="sub"><td colspan="${span}">${t.vat} ${totals.vatPct} %</td><td class="n">${money(totals.vat, lang)}</td></tr>
    <tr class="tot"><td colspan="${span}">${t.total}</td><td class="n">${money(totals.total, lang)}</td></tr></tbody></table>
    <div class="box">${t.labour}: <b>${money(totals.labourGross, lang)}</b></div>`;
}

function confirmation(o, { company, vatPct }) {
  const lang = o.lang === "en" ? "en" : "fi";
  const t = T[lang];
  const parts = E.PARTS.filter((p) => (o.estimate.parts || {})[p.key] > 0)
    .map((p) => `<tr><td>${esc(partName(p.key, lang))}</td><td class="n">${o.estimate.parts[p.key]} ${t.pcs}</td></tr>`).join("");
  const body = `<h1>${t.confirmation}</h1><p>${t.order} <b>${esc(o.ref)}</b> · ${t.date} ${day(new Date().toISOString(), lang)}</p>
    ${infoGrid(o, t, lang)}
    <h2>${t.line}</h2>${quoteTable(o.quote.lines, { ...o.quote, vatPct }, t, lang)}
    <h2>${t.parts}</h2><table><tbody>${parts}</tbody></table>
    <footer>${esc(company.name || "TelineKiito")} · ${esc(o.ref)}</footer>`;
  return page(`${t.confirmation} ${o.ref}`, company, body, lang);
}

function inspection(o, { company, fileUrl, items }) {
  const lang = o.lang === "en" ? "en" : "fi";
  const t = T[lang];
  const insp = (o.work && o.work.inspection) || {};
  const list = items.map((k) => `<tr><td><span class="check ${insp.items && insp.items[k] ? "yes" : "no"}">${insp.items && insp.items[k] ? "✓" : "–"}</span> ${esc(t.items[k] || k)}</td></tr>`).join("");
  const photos = (o.photos || []).filter((p) => p.stage === "erected" || p.stage === "inspection").slice(0, 9)
    .map((p) => `<img src="${esc(fileUrl(p.id))}" alt="">`).join("");
  const visits = ((o.work && o.work.visits) || []).map((v) => `<tr><td>${dateTime(v.at, lang)}</td><td>${esc(v.by)}</td><td>${v.ok ? t.visitOk : t.visitIssue}</td><td>${esc(v.notes)}</td></tr>`).join("");
  const body = `<h1>${t.inspection}</h1><p>${t.order} <b>${esc(o.ref)}</b></p>
    ${infoGrid(o, t, lang)}
    <h2>${t.checklist}</h2><table><tbody>${list}</tbody></table>
    ${insp.notes ? `<h2>${t.notes}</h2><p>${esc(insp.notes)}</p>` : ""}
    <div class="grid" style="margin-top:16px"><div><span>${t.inspectedBy}</span>${esc(insp.by || "–")}</div><div><span>${t.inspectedAt}</span>${dateTime((o.rental && o.rental.startedAt) || insp.at, lang)}</div></div>
    <h2>${t.signature}</h2><div class="sig">${insp.signature ? `<img src="${esc(fileUrl(insp.signature))}" alt="">` : esc(insp.noSignatureReason ? `${t.noSignature}: ${insp.noSignatureReason}` : t.noSignature)}</div>
    <p>${t.signedBy}: ${esc(insp.signer || "–")}</p>
    ${photos ? `<h2>${t.photos}</h2><div class="photos">${photos}</div>` : ""}
    ${visits ? `<h2>${t.visits}</h2><table><tbody>${visits}</tbody></table>` : ""}
    <footer>${esc(company.name || "TelineKiito")} · ${esc(o.ref)}</footer>`;
  return page(`${t.inspection} ${o.ref}`, company, body, lang);
}

/** Purchase order number, project and cost centre of a business customer's order. */
function bizRows(o, t) {
  const b = (o && o.business) || {};
  return [["po", b.po], ["project", b.project], ["costCentre", b.costCentre]].filter(([, v]) => v).map(([k, v]) => `<div><span>${t[k]}</span>${esc(v)}</div>`).join("");
}

function invoice(iv, o, { company, note }) {
  const lang = iv.lang === "en" ? "en" : "fi";
  const t = T[lang];
  const body = `<h1>${t.invoice} ${esc(iv.no)}</h1>
    <div class="grid">
      <div><span>${t.customer}</span>${esc(iv.customer.name)}${iv.customer.businessId ? `<br>${t.businessId} ${esc(iv.customer.businessId)}` : ""}</div>
      <div><span>${t.site}</span>${esc(iv.site)}</div>
      <div><span>${t.date}</span>${day(iv.date, lang)}</div>
      <div><span>${t.due}</span><b>${day(iv.due, lang)}</b></div>
      <div><span>${t.order}</span>${esc(iv.ref)}</div>
      <div><span>${t.reference}</span><b>${esc(iv.reference)}</b></div>
      ${bizRows(o, t)}
      ${iv.usedDays ? `<div><span>${t.rentUsed}</span>${iv.usedDays} ${t.daysUnit}</div>` : ""}
    </div>
    <h2>${t.line}</h2>${quoteTable(iv.lines, { net: iv.net, vat: iv.vat, total: iv.total, vatPct: iv.vatPct, labourGross: iv.labourGross }, t, lang, { units: true })}
    <h2>${t.payTo}</h2><div class="grid">
      <div><span>${t.payTo}</span>${esc(company.name || "TelineKiito")}</div>
      <div><span>${t.iban}</span>${esc(company.iban || "–")}${company.bic ? ` · BIC ${esc(company.bic)}` : ""}</div>
      <div><span>${t.reference}</span>${esc(iv.reference)}</div>
      <div><span>${t.total}</span><b>${money(iv.total, lang)}</b></div>
    </div>
    ${note ? `<p style="margin-top:16px">${esc(note)}</p>` : ""}
    <footer>${esc(company.name || "TelineKiito")}${company.businessId ? ` · ${t.businessId} ${esc(company.businessId)}` : ""} · ${t.invoice} ${esc(iv.no)}</footer>`;
  return page(`${t.invoice} ${iv.no}`, company, body, lang);
}

/** Invoices as CSV (semicolon-separated, Finnish decimal comma) for the accountant or an accounting program. */
function invoicesCsv(list, orderOf = () => null) {
  const n = (x) => String(Number(x || 0).toFixed(2)).replace(".", ",");
  const rows = [["Invoice", "Date", "Due", "Status", "Order", "Customer", "Business ID", "Reference", "Net", "VAT", "Total", "Labour share incl. VAT", "Purchase order", "Project", "Cost centre"]];
  for (const iv of list) rows.push([iv.no, iv.date, iv.due, iv.status, iv.ref, iv.customer.name, iv.customer.businessId || "", iv.reference, n(iv.net), n(iv.vat), n(iv.total), n(iv.labourGross), ...(() => { const b = (orderOf(iv.ref) || {}).business || {}; return [b.po || "", b.project || "", b.costCentre || ""]; })()]);
  return "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n") + "\r\n";
}

module.exports = { confirmation, inspection, invoice, invoicesCsv, lineLabel, T, partName };
