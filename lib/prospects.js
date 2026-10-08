"use strict";
// Sales prospects: building and renovation projects in Helsinki found in public sources, checked against each other,
// ranked for the sales team and linked to the CRM (lib/crm.js). Each source is read as often as it changes:
//   ryhti    Ryhti building permits (SYKE open data, refreshed nightly)              every 24 h
//   street   Helsinki area rentals for sites: scaffolds, hoists, storage (daily)       every 12 h
//   notices  Lupapiste permit notices for Helsinki (posted daily, public ~2 weeks)     every 6 h
//   prh      PRH company register: housing company and its property manager (c/o)    every 24 h, a company every 30 days
// Raw source data is cached by kind "psrc"; prospects (kind "prospect") keep the sales fields (status, owner, notes)
// across updates. Nothing here contacts anyone.
const UA = { "User-Agent": "telinekiito-prospects/1.0 (+https://telinekiito.fi)" };
const MUNI = "091";
const DAY = 24 * 3600e3;
const SOURCES = {
  ryhti: { hours: 24 },
  street: { hours: 12 },
  notices: { hours: 6 },
  prh: { hours: 24 }
};
const PRH_RECHECK_DAYS = 30;
const STATUSES = ["new", "researching", "contacted", "meeting", "quoted", "won", "lost", "not_relevant"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, { headers = {}, tries = 3, timeout = 120e3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(timeout) });
      if (r.ok) return await r.json();
      last = new Error(`HTTP ${r.status}`);
      if (r.status === 404) break;
    } catch (e) {
      last = e;
    }
    await sleep(1500 * (i + 1));
  }
  throw last;
}
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function splitAddress(a) {
  const m = /^(.*?)\s+(\d+)/.exec(String(a || "").trim());
  return m ? { street: m[1].trim(), no: Number(m[2]) } : null;
}
const addDays = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);

/* ---------- Ryhti (SYKE): permits decided and planned, with their buildings and addresses ---------- */
const RYHTI = "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections";
async function ryhtiAll(coll, cql) {
  let url = `${RYHTI}/${coll}/items?` + new URLSearchParams({ f: "application/json", limit: "3000", "filter-lang": "cql-text", filter: cql });
  const out = [];
  while (url) {
    const d = await getJson(url);
    out.push(...(d.features || []));
    url = ((d.links || []).find((l) => l.rel === "next") || {}).href;
  }
  return out;
}
async function ryhtiLookup(coll, field, values) {
  const v = [...new Set(values.filter(Boolean))].sort(), out = [];
  for (let i = 0; i < v.length; i += 40) out.push(...(await ryhtiAll(coll, v.slice(i, i + 40).map((x) => `${field}='${x}'`).join(" OR "))));
  return out;
}
async function fetchRyhti(since) {
  const permits = await ryhtiAll("avoimet_lupa_rakennukset", `kuntanumero='${MUNI}' AND toimenpiteen_tila='Suunniteltu' AND paatospaivamaara>='${since}'`);
  const bld = {};
  for (const f of await ryhtiLookup("open_building", "permanent_building_identifier", permits.map((f) => f.properties.pysyva_rakennustunnus))) bld[f.properties.permanent_building_identifier] = f.properties;
  const keys = [...new Set([...Object.values(bld).map((b) => b.building_key), ...permits.map((f) => f.properties.rakennusavain)])];
  const addr = {};
  for (const f of await ryhtiLookup("open_address", "building_key", keys)) {
    const q = f.properties;
    (addr[q.building_key] ||= []).push({ a: q.address_fin || "", n: q.address_number || 99 });
  }
  // One project per property and decision date (the scanner's grouping).
  const projects = {};
  for (const f of permits) {
    const p = f.properties, k = `${p.sijaintikiinteisto}|${p.paatospaivamaara}`;
    const pr = (projects[k] ||= { property: p.sijaintikiinteisto, date: String(p.paatospaivamaara || "").replace(/Z$/, ""), coords: (f.geometry || {}).coordinates || null, permits: [] });
    const b = bld[p.pysyva_rakennustunnus] || {};
    pr.permits.push({
      id: p.pysyva_lupatunnus, dvv: p.dvv_lupatunnus, op: p.toimenpiteen_laji, use: p.paaasiallinen_kayttotarkoitus, floors: p.kerrosluku || 0,
      started: p.aloittamispaivamaara || null, protectedB: Boolean(p.suojeltu), heritage: p.kulttuurihistoriallinen_merkittavyys || null,
      facade: p.julkisivumateriaali || null, built: b.completion_date ? Number(String(b.completion_date).slice(0, 4)) : null, apartments: b.apartment_count || 0,
      addresses: (addr[b.building_key] || addr[p.rakennusavain] || []).sort((x, y) => x.n - y.n).map((x) => x.a).filter(Boolean)
    });
  }
  return Object.values(projects).map((pr) => {
    const main = pr.permits.reduce((a, b) => (b.floors > a.floors ? b : a), pr.permits[0]);
    const addresses = [...new Set(pr.permits.flatMap((x) => x.addresses))];
    const built = pr.permits.map((x) => x.built).filter(Boolean);
    return {
      id: "R:" + [...new Set(pr.permits.map((x) => x.id))].sort().join(";"),
      property: pr.property, date: pr.date, coords: pr.coords, addresses,
      permitIds: [...new Set(pr.permits.map((x) => x.id))], dvv: [...new Set(pr.permits.map((x) => x.dvv).filter(Boolean))],
      buildings: pr.permits.length, op: main.op || "", use: main.use || "", floors: main.floors,
      ops: [...new Set(pr.permits.map((x) => x.op).filter(Boolean))],
      built: built.length ? Math.min(...built) : null, apartments: pr.permits.reduce((m, x) => m + (x.apartments || 0), 0),
      started: pr.permits.some((x) => x.started), protected: pr.permits.some((x) => x.protectedB),
      heritage: [...new Set(pr.permits.map((x) => x.heritage).filter(Boolean))], facade: [...new Set(pr.permits.map((x) => x.facade).filter(Boolean))]
    };
  });
}

/* ---------- Helsinki area rentals (street permits): site work with dates ---------- */
const WORK_RE = /teline|julkisivu|katto|vesikat|parvek|kiinteistöremontti|ikkuna|rappaus|saneeraus|remontti|korjaus|nosto|työmaahissi/i;
async function fetchStreet(today) {
  const url = "https://kartta.hel.fi/ws/geoserver/avoindata/wfs?" + new URLSearchParams({
    service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: "avoindata:Aluevuokraus_alue", outputFormat: "application/json",
    propertyName: "hakemus,hakemustunnus,tyo_alkaa,tyo_paattyy,tyon_tarkoitus,osoite,kaupunginosa,status", CQL_FILTER: `tyo_paattyy >= '${today}'`, count: "20000"
  });
  const d = await getJson(url, { timeout: 300e3 });
  const apps = {};
  for (const f of d.features || []) {
    const p = f.properties || {}, k = p.hakemustunnus || p.hakemus;
    if (!k) continue;
    const a = (apps[k] ||= { id: String(k), start: "", end: "", address: "", district: p.kaupunginosa || "", status: "", texts: [] });
    const s = String(p.tyo_alkaa || "").slice(0, 10), e = String(p.tyo_paattyy || "").slice(0, 10);
    if (s && (!a.start || s < a.start)) a.start = s;
    if (e > a.end) a.end = e;
    if (!a.address && p.osoite) a.address = String(p.osoite).trim();
    if (p.status) a.status = p.status;
    const t = [p.tyon_tarkoitus, p.hakemus].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (t && !a.texts.includes(t)) a.texts.push(t);
  }
  return Object.values(apps).map((a) => ({ ...a, text: a.texts.join(" / ").slice(0, 600), texts: undefined })).filter((a) => a.address && WORK_RE.test(a.text));
}

/* ---------- Lupapiste public notices (Helsinki): operation and a short description of each permit ---------- */
async function fetchNotices() {
  const base = "https://julkipano.lupapiste.fi";
  const r = await fetch(base + "/app/fi/bulletins", { headers: UA, redirect: "follow", signal: AbortSignal.timeout(60e3) });
  const raw = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]).join("; ");
  const m = /anti-csrf-token=([^;]+)/.exec(raw);
  if (!m) throw new Error("no session token");
  const cookie = `anti-csrf-token=${m[1]}`, token = decodeURIComponent(m[1]);
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const d = await getJson(`${base}/api/query/application-bulletins?` + new URLSearchParams({ page: String(page), municipality: MUNI }), { headers: { cookie, "x-anti-forgery-token": token } });
    const rows = (d && d.data) || [];
    for (const b of rows) {
      out.push({
        id: b["application-id"], address: b.address || "", operation: (b.primaryOperation || {}).name || "", description: b.bulletinOpDescription || (b.primaryOperation || {}).description || "",
        state: b.bulletinState || b.state || "", verdictAt: b.verdictGivenAt ? new Date(b.verdictGivenAt).toISOString().slice(0, 10) : null,
        appealEnds: b.appealPeriodEndsAt ? new Date(b.appealPeriodEndsAt).toISOString().slice(0, 10) : null, category: b.category || ""
      });
    }
    if (!rows.length || !(d.left > 0)) break;
    await sleep(400);
  }
  return out;
}
const NOTICE_EXTERIOR = /julkisivu|parvek|katto|vesikat|ikkun|lisäkerro|ullak|räystä|rappau|teline/i;
const NOTICE_INTERIOR = /sisätila|sisatila|huoneisto|yhdistäminen|jakaminen|purkaminen|maalämpö|pysäköin|kyltti|mainos|aitaus|lauhdut|linjasaneeraus|putki|viemär|käyttötarkoitu|lvi|sprinkl|hissi/i;

/* ---------- PRH: the housing company of an address, and its property manager (c/o) ---------- */
const PRH = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const FORM = /^(asunto[- .]?osakeyhtiö|asunto[- .]?oy\.?|as\.? ?oy\.?|kiinteistö[- ]?oy|bostadsaktiebolaget|bostads ab|fastighets ab)\s+/i;
const CAPITAL = ["091", "049", "092", "235"];
const companyName = (c) => ((c.names || []).find((n) => String(n.type) === "1" && !n.endDate) || {}).name || "";
const isHousing = (c) => (c.companyForms || []).some((f) => !f.endDate && (f.descriptions || []).some((d) => /asunto-osakeyhtiö|housing corp|keskinäinen kiinteistö/i.test(d.description || ""))) || FORM.test(companyName(c));
/** "Asunto Oy Koivikkotie 1-3" covers 1 and 3 (same side of the street), not 2; the name must start with the street. */
function nameCovers(name, street, no) {
  if (!FORM.test(name)) return false;
  const rest = name.replace(FORM, "").replace(/^helsingin\s+/i, "");
  const esc = street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp("^" + esc + "\\s+(\\d+)(?:\\s*[a-zåäö])?(?:\\s*[-–]\\s*(\\d+))?(?!\\d)", "i").exec(rest);
  if (!m) return false;
  const lo = Number(m[1]), hi = Number(m[2] || m[1]);
  return lo <= no && no <= hi && (lo === hi || no % 2 === lo % 2);
}
function companyFacts(c) {
  const a = (c.addresses || []).find((x) => String(x.type) === "1") || (c.addresses || [])[0] || {};
  const po = (a.postOffices || []).find((p) => p.languageCode === "1") || (a.postOffices || [])[0] || {};
  const name = companyName(c);
  return {
    name, businessId: (c.businessId || {}).value || "", manager: String(a.co || "").replace(/^c\/o\s*/i, "").trim(),
    managerSince: a.registrationDate || null, address: [a.street, a.buildingNumber].filter(Boolean).join(" "), postCode: a.postCode || "", city: po.city || "",
    municipality: po.municipalityCode || "", website: (c.website || {}).url || "",
    // Same street names exist in other towns: sure when the name says Helsingin or the company is in the capital region.
    certain: /helsingin/i.test(name) || CAPITAL.includes(po.municipalityCode || "")
  };
}
async function prhStreet(store, street, now) {
  const id = "prh:" + norm(street);
  const hit = store.get("psrc", id);
  if (hit && now - Date.parse(hit.fetchedAt) < PRH_RECHECK_DAYS * DAY) return hit.companies;
  const out = [];
  let seen = 0;
  for (let page = 1; page <= 15; page++) {
    const d = await getJson(`${PRH}?` + new URLSearchParams({ name: street, page: String(page) }), { timeout: 60e3 });
    const b = (d && d.companies) || [];
    seen += b.length;
    out.push(...b.filter(isHousing).map(companyFacts));
    if (!b.length || seen >= Number((d && d.totalResults) || 0)) break;
    await sleep(400);
  }
  store.put("psrc", { id, kind: "prh", fetchedAt: new Date(now).toISOString(), companies: out });
  return out;
}
async function findHousingCompany(store, addresses, now) {
  for (const a of addresses) {
    const l = splitAddress(a);
    if (!l) continue;
    const c = (await prhStreet(store, l.street, now)).find((x) => nameCovers(x.name, l.street, l.no));
    if (c) return { ...c, matchedAddress: a };
  }
  return null;
}

/* ---------- Assessment: tier, scope, timing, relevance, priority ---------- */
function tierOf(op, use, floors) {
  if ((op === "Muu muutostyö" || op === "Laajentaminen") && floors >= 3) return "A";
  if (String(op).startsWith("Uusi") && floors >= 3) return "B";
  if (use === "Pientalo") return "C";
  return "D";
}
const SCOPE = [["scaffold", /teline/i], ["facade", /julkisivu|rappau|maalaus|kiviaines/i], ["roof", /katto|vesikat|kattoristik|sääsuoj|räystä/i], ["balcony", /parveke/i], ["windows", /ikkuna/i], ["extension", /laajen|lisäkerro|ullak/i], ["lifting", /nosto|nostin|kurottaja|työmaahissi/i]];
const EXTERIOR = ["scaffold", "facade", "roof", "balcony", "windows", "extension"];
const scopeOf = (t) => SCOPE.filter(([, re]) => re.test(t)).map(([k]) => k);
function timingOf(sp, today) {
  if (sp.start > today) return "upcoming";
  if (sp.end < today) return "ended";
  return daysBetween(today, sp.end) <= 21 ? "ending" : "active";
}
function assess(p, today) {
  // What each site permit is for. Scaffolding is sold where the work needs it (facade, roof, balconies, windows done
  // from scaffolds); work from a personnel lift, snow clearing and one-day lifts do not need it.
  const kinds = (p.street || []).map((s) => siteKind(s.text));
  const scope = new Set();
  for (const s of p.street || []) scopeOf(s.text).forEach((k) => scope.add(k));
  for (const n of p.notices || []) scopeOf(`${n.operation} ${n.description}`).forEach((k) => scope.add(k));
  // A permit for extending (Laajentaminen) often adds floor area inside (attic, basement): likely, not confirmed.
  const extensionPermit = (p.ops || []).includes("Laajentaminen");
  if (extensionPermit) scope.add("extension");
  if (p.tier === "B") scope.add("new_build");
  const noticeExterior = (p.notices || []).some((n) => NOTICE_EXTERIOR.test(n.description) && !NOTICE_INTERIOR.test(n.description));
  const interiorOnly = (p.notices || []).length > 0 && (p.notices || []).every((n) => NOTICE_INTERIOR.test(`${n.operation} ${n.description}`) && !NOTICE_EXTERIOR.test(n.description));
  let relevance;
  if (kinds.includes("scaffold") || noticeExterior) relevance = "confirmed";
  else if (interiorOnly) relevance = "unlikely";
  else if (p.tier === "B" || extensionPermit) relevance = "likely";
  else if (kinds.includes("survey")) relevance = "future";
  else if (interiorOnly) relevance = "unlikely";
  else if (kinds.length && kinds.every((k) => k === "lift" || k === "maintenance")) relevance = "lift_only";
  else relevance = p.tier === "C" ? "possible" : "unknown";
  // Timing: the street permit's dates are the site's real dates; otherwise only the permit decision.
  const sp = (p.street || []).filter((s) => s.timing !== "ended").sort((a, b) => (a.start < b.start ? -1 : 1));
  let timing = "permit", start = null, end = null;
  if (sp.length) {
    const up = sp.find((s) => s.timing === "upcoming");
    const cur = sp.filter((s) => s.timing === "active" || s.timing === "ending").sort((a, b) => (a.end > b.end ? -1 : 1))[0];
    const pick = cur || up;
    timing = pick.timing; start = pick.start; end = pick.end;
  } else if ((p.street || []).length) timing = "ended";
  if (timing === "permit" && p.started) timing = "started";
  // Scaffolds already standing: the site has a supplier; the lead is the contractor relationship and later phases.
  const inPlace = (p.street || []).some((s) => siteKind(s.text) === "scaffold" && s.end >= today && (s.start <= addDays(today, -30) || (/teline/i.test(s.text) && s.start <= addDays(today, -14))));
  const recent = Boolean(p.date) && daysBetween(p.date, today) <= 240;
  const contact = p.contactReady ? "ready" : p.managerName ? "name_only" : "missing";
  const reasons = [];
  let priority;
  if (p.tier === "C") { priority = "low"; reasons.push("homeowner"); }
  else if (relevance === "unlikely") { priority = "low"; reasons.push("interior_only"); }
  else if (relevance === "lift_only") { priority = "low"; reasons.push("lift_only"); }
  else if (timing === "ended") { priority = "low"; reasons.push("site_ended"); }
  else if (relevance === "confirmed" && timing === "upcoming") { priority = "high"; reasons.push("starts_soon"); }
  else if (relevance === "confirmed" && (timing === "permit" || timing === "started") && recent) { priority = "high"; reasons.push("exterior_permit"); }
  else if (relevance === "confirmed" && timing === "active") { priority = inPlace ? "medium" : "high"; reasons.push(inPlace ? "scaffold_in_place" : "site_running"); }
  else if (relevance === "confirmed" && timing === "ending") { priority = "low"; reasons.push("site_ending"); }
  else if (relevance === "future") { priority = "medium"; reasons.push("facade_survey"); }
  else if (relevance === "likely" && p.date && daysBetween(p.date, today) <= 365) { priority = "medium"; reasons.push(p.tier === "B" ? "new_build" : "extension_permit"); }
  else if (recent) { priority = "medium"; reasons.push("scope_unknown"); }
  else { priority = "low"; reasons.push(relevance === "confirmed" ? "old_permit" : "scope_unknown"); }
  if (p.companyWrong) reasons.push("company_check");
  // Ranking inside a priority: size and age of the building, evidence, timing and a contact route.
  let score = { A: 60, B: 45, C: 15, S: 60, L: 50 }[p.tier] || 30;
  score += Math.min(25, 5 * ((p.buildings || 1) - 1)) + (p.built && p.built <= 1990 ? 10 : 0) + Math.min(10, Math.floor((p.apartments || 0) / 20));
  score += relevance === "confirmed" ? 20 : relevance === "future" || relevance === "likely" ? 8 : 0;
  score += timing === "upcoming" ? 15 : timing === "permit" && recent ? 12 : timing === "active" ? (inPlace ? 2 : 8) : 0;
  score += contact === "ready" ? 10 : contact === "name_only" ? 5 : 0;
  return { scope: [...scope], relevance, timing, start, end, contact, priority, reasons, score, inPlace };
}
/** A site permit's purpose: scaffold work, a survey, a lift, maintenance (snow), or other. */
function siteKind(text) {
  const t = String(text || "");
  if (/lumen|lumipud|lumityö|jään/i.test(t)) return "maintenance";
  if (/henkilönostimella|nostimella/i.test(t) && !/teline/i.test(t)) return "lift";
  if (/viemär|putki|linjasaneer|kaivu|sukitus/i.test(t) && !/teline/i.test(t)) return "other";
  if (/tutkimus|kuntotutkimus|kartoitus|kuntoarvio/i.test(t) && !/teline|remont|korjau|uusim/i.test(t)) return "survey";
  if (/teline|julkisivu|rappau|parvekekorj|parvekeremont|kiinteistöremont|vesikat|kattoremont|kattokorj|kattoristik|sääsuoj/i.test(t)) return "scaffold";
  if (/tutkimus|kuntotutkimus|kartoitus|kuntoarvio/i.test(t)) return "survey";
  if (/nosto|nostin|kurottaja/i.test(t)) return "lift";
  return "other";
}

/** Permits decided on different days for the same property are one project (id P:<property>). */
function mergeByProperty(list) {
  const by = new Map();
  for (const pr of list) {
    const k = pr.property || pr.id;
    const m = by.get(k);
    if (!m) { by.set(k, { ...pr, id: pr.property ? "P:" + pr.property : pr.id }); continue; }
    const main = (pr.floors || 0) > (m.floors || 0) ? pr : m;
    const built = [m.built, pr.built].filter(Boolean);
    by.set(k, {
      ...m, op: main.op, use: main.use, floors: Math.max(m.floors || 0, pr.floors || 0), date: pr.date > m.date ? pr.date : m.date,
      addresses: [...new Set([...m.addresses, ...pr.addresses])], permitIds: [...new Set([...m.permitIds, ...pr.permitIds])], dvv: [...new Set([...m.dvv, ...pr.dvv])],
      ops: [...new Set([...m.ops, ...pr.ops])], buildings: Math.max(m.buildings, pr.buildings), apartments: Math.max(m.apartments || 0, pr.apartments || 0),
      built: built.length ? Math.min(...built) : null, started: m.started || pr.started,
      protected: m.protected || pr.protected, heritage: [...new Set([...m.heritage, ...pr.heritage])], facade: [...new Set([...m.facade, ...pr.facade])]
    });
  }
  return [...by.values()];
}

/* ---------- Building the prospect list from the cached sources ---------- */
function buildCandidates(src, today) {
  const ryhti = (src.ryhti && src.ryhti.projects) || [], street = (src.street && src.street.apps) || [], notices = (src.notices && src.notices.items) || [];
  const byAddr = (list, getAddrs) => {
    const ix = {};
    for (const x of list)
      for (const a of getAddrs(x))
        for (const part of String(a).split(/[,;]/)) {
          const m = /^(.*?)\s+(\d+)(?:\s*[-–]\s*(\d+))?/.exec(part.trim());
          if (!m) continue;
          for (let n = Number(m[2]); n <= Number(m[3] || m[2]) && n - Number(m[2]) < 20; n++) (ix[`${norm(m[1])}|${n}`] ||= []).push(x);
        }
    return ix;
  };
  const spIx = byAddr(street, (s) => [s.address]), ntIx = byAddr(notices, (n) => [n.address]);
  const lookup = (ix, addrs) => { const out = new Map(); for (const a of addrs) { const l = splitAddress(a); for (const x of (l && ix[`${norm(l.street)}|${l.no}`]) || []) out.set(x.id, x); } return [...out.values()]; };
  const used = new Set(), usedN = new Set(), out = [];
  for (const pr of mergeByProperty(ryhti)) {
    const tier = tierOf(pr.op, pr.use, pr.floors);
    if (tier === "D") continue;
    const sps = lookup(spIx, pr.addresses), nts = lookup(ntIx, pr.addresses);
    sps.forEach((s) => used.add(s.id)); nts.forEach((n) => usedN.add(n.id));
    out.push({ ...pr, source: "ryhti", tier, street: sps, notices: nts });
  }
  for (const s of street) {
    if (used.has(s.id) || !s.start || s.start < today) continue;
    const nts = lookup(ntIx, [s.address]);
    nts.forEach((n) => usedN.add(n.id));
    out.push({ id: "S:" + s.id, source: "street", tier: "S", date: s.start, addresses: [s.address], street: [s], notices: nts, buildings: 1 });
  }
  for (const n of notices) {
    if (usedN.has(n.id) || !NOTICE_EXTERIOR.test(n.description) || NOTICE_INTERIOR.test(n.description)) continue;
    out.push({ id: "L:" + n.id, source: "notice", tier: "L", date: n.verdictAt || "", addresses: [n.address.split(",")[0]], street: [], notices: [n], buildings: 1, use: "" });
  }
  return out.map((c) => ({ ...c, street: (c.street || []).map((s) => ({ id: s.id, address: s.address, start: s.start, end: s.end, status: s.status, text: s.text, timing: timingOf(s, today) })) }));
}

/** Merge new source data into the prospects; the sales fields and research stay. Returns counts. */
function rebuild(store, { today, crm, research = {} }) {
  const src = { ryhti: store.get("psrc", "ryhti"), street: store.get("psrc", "street"), notices: store.get("psrc", "notices") };
  const cands = buildCandidates(src, today);
  const existing = new Map(store.list("prospect", { limit: 20000 }).map((p) => [p.id, p]));
  let added = 0;
  const seen = new Set();
  for (const c of cands) {
    seen.add(c.id);
    const old = existing.get(c.id);
    const p = old ? { ...old } : { id: c.id, firstSeen: today, status: "new", notes: [], assigneeId: null, nextAction: "", nextDate: null, priorityOverride: null, links: {} };
    if (!old) added++;
    Object.assign(p, {
      source: c.source, tier: c.tier, date: c.date || "", addresses: c.addresses || [], property: c.property || null, coords: c.coords || null,
      permitIds: c.permitIds || [], dvv: c.dvv || [], buildings: c.buildings || null, floors: c.floors || null, built: c.built || null, apartments: c.apartments || null,
      op: c.op || "", use: c.use || "", ops: c.ops || [], started: Boolean(c.started), protected: Boolean(c.protected), heritage: c.heritage || [], facade: c.facade || [],
      street: c.street, notices: c.notices, lastSeen: today, gone: false
    });
    p.research = research[p.id] || p.research || null;
    finish(p, store, crm, today);
    p.status = p.status || "new";
    store.put("prospect", Object.assign(p, { ref: p.tier, status: p.status }));
  }
  // Prospects no longer in any source stay with their history, marked gone.
  for (const [id, p] of existing) if (!seen.has(id) && !p.gone) { p.gone = true; finish(p, store, crm, today); store.put("prospect", p); }
  return { total: cands.length, added };
}
/** Contact facts from the linked CRM organisations, then the assessment. */
function finish(p, store, crm, today) {
  const mgr = p.links && p.links.managerId ? crm.get(store, p.links.managerId) : null;
  const hc = p.links && p.links.housingId ? crm.get(store, p.links.housingId) : null;
  p.managerName = mgr ? mgr.name : "";
  p.housingName = hc ? hc.name : "";
  p.contactReady = Boolean(mgr && (mgr.email || mgr.phone || (mgr.contacts || []).some((x) => x.email || x.phone)));
  p.companyWrong = Boolean(p.prh && p.prh.certain === false);
  Object.assign(p, assess(p, today));
  if (p.gone && p.timing !== "ended") p.timing = p.timing === "permit" ? "permit" : "ended";
}

/** PRH: housing company and manager for prospects in apartment blocks, linked into the CRM. */
async function linkCompanies(store, { crm, now, max = 400 }) {
  let n = 0;
  for (const p of store.list("prospect", { limit: 20000 })) {
    if (n >= max) break;
    const housing = ["A", "S", "L"].includes(p.tier) && (p.tier !== "A" || /Kerrostalo|Rivitalo|Asuntola/.test(p.use));
    if (!housing || !p.addresses.length || p.gone) continue;
    if (p.prh && p.prh.checkedAt && now - Date.parse(p.prh.checkedAt) < PRH_RECHECK_DAYS * DAY) continue;
    const c = await findHousingCompany(store, p.addresses, now);
    n++;
    p.prh = c ? { ...c, checkedAt: new Date(now).toISOString() } : { none: true, checkedAt: new Date(now).toISOString() };
    p.links = p.links || {};
    if (c && c.certain) {
      const hc = crm.upsertFromRegistry(store, { type: "housing_company", name: c.name, businessId: c.businessId, address: [c.address, c.postCode, c.city].filter(Boolean).join(", "), website: c.website });
      if (!p.links.housingId) p.links.housingId = hc.id;
      if (c.manager && /\b(oy|oyj|ab|ky|isännöinti|isännöitsijä|kiinteistö|huolto|palvelu|tili)/i.test(c.manager)) {
        const m = crm.upsertFromRegistry(store, { type: "property_manager", name: c.manager });
        if (!p.links.managerId) p.links.managerId = m.id;
        crm.relate(store, hc.id, m.id);
      }
    }
    store.put("prospect", p);
  }
  return n;
}

/* ---------- Scheduler ---------- */
function defaultState(today) {
  return { enabled: true, since: addDays(today, -365), sources: {} };
}
function state(store, today) {
  const s = store.getSetting("prospects.sync") || defaultState(today);
  s.sources = s.sources || {};
  return s;
}
function due(s, key, now) {
  const x = s.sources[key];
  return !x || !x.lastRun || now - Date.parse(x.lastRun) >= SOURCES[key].hours * 3600e3;
}
let running = null;
/** Runs the sources that are due (or the one asked for), then rebuilds the list. */
async function sync(store, { crm, today, force = null, research = {}, log = () => {} }) {
  if (running) return running;
  running = (async () => {
    const now = Date.now();
    const s = state(store, today);
    const keys = force ? (force === "all" ? Object.keys(SOURCES) : [force]) : Object.keys(SOURCES).filter((k) => due(s, k, now));
    let changed = false;
    for (const key of keys) {
      const rec = (s.sources[key] = { ...(s.sources[key] || {}), lastRun: new Date().toISOString(), running: true });
      store.setSetting("prospects.sync", s);
      const t0 = Date.now();
      try {
        if (key === "ryhti") { const projects = await fetchRyhti(s.since); store.put("psrc", { id: "ryhti", projects }); rec.count = projects.length; changed = true; }
        else if (key === "street") { const apps = await fetchStreet(today); store.put("psrc", { id: "street", apps }); rec.count = apps.length; changed = true; }
        else if (key === "notices") { const items = await fetchNotices(); store.put("psrc", { id: "notices", items }); rec.count = items.length; changed = true; }
        else if (key === "prh") { if (changed) rebuild(store, { today, crm, research }); rec.count = await linkCompanies(store, { crm, now }); changed = true; }
        rec.ok = true; rec.error = null; rec.lastOk = new Date().toISOString();
      } catch (e) {
        rec.ok = false; rec.error = String((e && e.message) || e).slice(0, 200);
        log(`prospects: ${key} failed: ${rec.error}`);
      }
      rec.ms = Date.now() - t0; rec.running = false;
      store.setSetting("prospects.sync", s);
    }
    if (changed || force) {
      const r = rebuild(store, { today, crm, research });
      s.lastBuild = { at: new Date().toISOString(), ...r };
      store.setSetting("prospects.sync", s);
    }
    return s;
  })().finally(() => { running = null; });
  return running;
}
/** What the office shows about the sources: last run, next run, errors. */
function syncStatus(store, today) {
  const s = state(store, today);
  const sources = Object.keys(SOURCES).map((k) => {
    const x = s.sources[k] || {};
    return { key: k, everyHours: SOURCES[k].hours, lastRun: x.lastRun || null, lastOk: x.lastOk || null, ok: x.ok !== false, error: x.error || null, count: x.count ?? null, running: Boolean(running && x.running), next: x.lastRun ? new Date(Date.parse(x.lastRun) + SOURCES[k].hours * 3600e3).toISOString() : null };
  });
  return { enabled: s.enabled !== false, since: s.since, running: Boolean(running), lastBuild: s.lastBuild || null, sources };
}

module.exports = {
  SOURCES, STATUSES, sync, syncStatus, state, rebuild, finish, assess, siteKind, buildCandidates, nameCovers, timingOf, scopeOf,
  _internal: { fetchRyhti, fetchStreet, fetchNotices, findHousingCompany, companyFacts }
};
