"use strict";
// Standard-configuration checks: does this scaffold stay inside what the manufacturer's assembly instructions
// allow without a separate calculation? Each rule carries the document, edition and page it comes from, so it is
// clear what to update when a newer edition arrives. Anything outside the rules is flagged "engineer": the office
// must get a separate plan and calculation before the job. These are reminders, not a structural verification.
const E = require("./engine");

/** The rule tables per system. Update the numbers and sources together when new documents arrive. */
const RULES = {
  layher: {
    doc: "Layher Blitz Gerüst – Aufbau- und Verwendungsanleitung, Ausgabe 11.2013 (Art.-Nr. 8102.030)",
    current: false, // ask Layher Finland for the current edition
    // Height above which we always ask for a separate calculation. Not stated in the 2013 manual we have: the usual
    // limit of standard configurations; confirm with the current Layher documents (approval Z-8.1-844).
    maxHeight: { m: 24, page: null, confirm: true },
    loadClass: { cls: 3, kNm2: 2.0, page: 3 },
    anchors: { oneLevel: "every_second_frame", oneLevelCatch: "every_frame", page: 14, sheeted: "every_2m", sheetedPage: 17 }
  },
  monzon: {
    doc: "MonZon Modular Light – Assembly Instruction, version 2.1",
    current: true, // the latest on monzon.se; confirm with MonZon
    maxHeight: { m: 25, page: 54, withBrackets: 18 },
    loadClass: { cls: 3, kNm2: 2.0, page: 54 },
    anchors: { every4m: true, page: 54, forceKn: 3.2, forcePage: 55 }
  }
};

/**
 * Checks for a house as priced (with its estimate). Returns [{ code, level: "ok" | "note" | "engineer", vars, source }].
 */
function checksFor(h, est) {
  const sys = est.system || "layher";
  const R = RULES[sys] || RULES.layher;
  const src = (page) => ({ doc: R.doc, page: page || null, current: R.current });
  const out = [];
  const deckAt = (s, l) => E.SYS.jack + (s.half ? E.SYS.half : 0) + E.SYS.lift * l;
  // Highest point: guardrail posts 1 m over the top deck, or the roof-catch wall 2 m over its deck.
  const tops = est.sides.map((s) => Math.max(s.deckH + 1, s.catchOn ? deckAt(s, s.catchLevel || s.lifts) + E.CATCH.wall : 0));
  const height = Math.round(Math.max(0, ...tops) * 10) / 10;
  // MonZon: 25 m verified without brackets, 18 m with brackets (instruction v2.1 p. 54).
  const brackets = est.sides.some((s) => s.inner || s.catchConsole);
  const maxH = brackets && R.maxHeight.withBrackets ? R.maxHeight.withBrackets : R.maxHeight.m;

  if (height > maxH) out.push({ code: "too_high", level: "engineer", vars: { h: height, max: maxH }, source: src(R.maxHeight.page) });
  else out.push({ code: "height_ok", level: "ok", vars: { h: height, max: maxH, confirm: Boolean(R.maxHeight.confirm) }, source: src(R.maxHeight.page) });

  out.push({ code: "load_class", level: "note", vars: { cls: R.loadClass.cls, kn: R.loadClass.kNm2, kg: Math.round(R.loadClass.kNm2 * 100) }, source: src(R.loadClass.page) });

  if (sys === "layher") {
    const dense = (s) => s.catchOn || s.inner || s.catchConsole;
    const oneCatch = est.sides.filter((s) => s.lifts === 1 && s.catchOn).length;
    const one = est.sides.filter((s) => s.lifts === 1 && !dense(s)).length;
    const denseMore = est.sides.filter((s) => dense(s) && !(s.lifts === 1 && s.catchOn)).length;
    if (oneCatch) out.push({ code: "anchor_every_frame", level: "note", vars: { n: oneCatch }, source: src(R.anchors.page) });
    if (one) out.push({ code: "anchor_second_frame", level: "note", vars: { n: one }, source: src(R.anchors.page) });
    if (denseMore) out.push({ code: "anchor_dense", level: "note", vars: { n: denseMore }, source: src(19) });
    if (est.sides.some((s) => s.lifts > 1 && !dense(s))) out.push({ code: "anchor_pattern", level: "note", vars: {}, source: src(R.anchors.sheetedPage) });
    out.push({ code: "sheeting_layher", level: "note", vars: {}, source: src(R.anchors.sheetedPage) });
  } else {
    out.push({ code: "anchor_4m", level: "note", vars: { kn: R.anchors.forceKn }, source: src(R.anchors.page) });
    out.push({ code: "mz_vties", level: "note", vars: {}, source: src(28) });
    out.push({ code: "sheeting_monzon", level: "note", vars: {}, source: src(R.anchors.forcePage) });
  }
  // Roof-catch geometry, DIN 4420-1 (Layher AuV §17 refers to it; MonZon has no rules of its own). The worst side.
  const catches = est.sides.filter((s) => s.catchOn && s.eave);
  if (catches.length) {
    let worst = null;
    for (const s of catches) {
      const deck = deckAt(s, s.catchLevel || s.lifts), b = E.catchB(!s.catchConsole);
      const v = { below: deck <= s.eave ? s.eave - deck : -1, b, over: deck + E.CATCH.wall - s.eave, need: E.catchNeed(!s.catchConsole, s.pitch) };
      v.bad = v.below < 0 || v.below > E.CATCH.maxBelow + 1e-9 || b < E.CATCH.minB || v.over < v.need - 1e-9;
      if (!worst || v.bad || v.over - v.need < worst.over - worst.need) worst = v.bad || !worst || !worst.bad ? v : worst;
    }
    const r = (x) => Math.round(x * 100) / 100;
    out.push({ code: "catch_din", level: worst.bad ? "engineer" : "ok", vars: { n: catches.length, below: r(worst.below), b: r(worst.b), over: r(worst.over), need: r(worst.need) }, source: { doc: "DIN 4420-1:2004-03 (Layher AuV 11.2013 §17)", page: R === RULES.layher ? 29 : null, current: true } });
  }
  // Roof pitch and height (BG BAU B 121): roof-catch only up to 60°; above 45° roofers need special work positions;
  // more than 5 m from eave to ridge needs extra protection walls on the roof surface.
  if (catches.length) {
    const pitch = Number(h.pitch) || 0, rise = (est.ridge || 0) - Math.min(...catches.map((s) => s.eave));
    const B121 = { doc: "BG BAU B 121 Dachfanggerüste (07/2021)", page: null, current: true };
    if (pitch > E.CATCH.maxPitch) out.push({ code: "catch_steep", level: "engineer", vars: { pitch }, source: B121 });
    else if (pitch > 45) out.push({ code: "steep_45", level: "note", vars: { pitch }, source: B121 });
    if (rise > 5) out.push({ code: "roof_walls", level: "note", vars: { rise: Math.round(rise * 10) / 10 }, source: B121 });
    const lateral = catches.filter((s) => Math.max(s.ext0 || 0, s.ext1 || 0) >= E.CATCH.overhang + E.CATCH.lateral - 0.01).length;
    if (lateral) out.push({ code: "catch_lateral", level: "note", vars: { n: lateral, m: E.CATCH.lateral }, source: { doc: "Bauarbeiterschutzverordnung (AT) § 88 (4)", page: null, current: true } });
  }
  // Under a temporary roof, a top deck above the eave can't be tied to the wall: tie it to the roof structure or
  // brace it, with a calculation (the roof's wind load is on these lifts).
  if (est.roof) {
    const loose = est.sides.filter((s) => s.kind === "eaves" && s.inner && s.eave && s.deckH > s.eave);
    if (loose.length) out.push({ code: "roof_anchor", level: "engineer", vars: { n: loose.length, over: Math.round(Math.max(...loose.map((s) => s.deckH - s.eave)) * 10) / 10 }, source: null });
  }
  // Where the measured outline left no room for a scaffold by the rules (facing walls under 2.1 m apart, odd
  // angles), a run was cut back more than 1 m: plan those spots on site.
  const tight = est.sides.filter((s) => s.cut > 1).length;
  if (tight) out.push({ code: "tight_spots", level: "note", vars: { n: tight }, source: null });
  const halves = est.sides.filter((s) => s.half).length;
  if (halves) out.push({ code: "half_frame", level: "note", vars: { n: halves }, source: sys === "layher" ? src(10) : null });
  if (est.roof) out.push({ code: "raised_roof", level: "note", vars: {}, source: null });
  // MonZon Modular Light instruction v2.1 §1.11 does not cover sheeted scaffolds or weather protection roofs.
  if (sys === "monzon" && (est.sheeting || est.roof)) out.push({ code: "mz_not_covered", level: "engineer", vars: { roof: Boolean(est.roof), sheeting: Boolean(est.sheeting) }, source: src(11) });
  if (est.roof) {
    const r = est.roof, top = r.support + 1 + (r.span / 2) * Math.tan((r.pitch * Math.PI) / 180);
    if (top > height) out.push({ code: "roof_top", level: "note", vars: { h: Math.round(top * 10) / 10 }, source: null });
  }
  if (h.adjust && h.adjust.sides && Object.keys(h.adjust.sides).length) out.push({ code: "adjusted", level: "note", vars: {}, source: null });
  return out;
}

module.exports = { RULES, checksFor };
