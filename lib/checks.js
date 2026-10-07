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
    maxHeight: { m: 25, page: 54 },
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
  const lifts = Math.max(...est.sides.map((s) => s.lifts), 0);
  const deckTop = E.SYS.jack + E.SYS.lift * lifts;
  const catchTop = deckTop + (est.sides.some((s) => s.catchOn) ? 2 : 1);
  const height = Math.round(catchTop * 10) / 10;

  if (height > R.maxHeight.m) out.push({ code: "too_high", level: "engineer", vars: { h: height, max: R.maxHeight.m }, source: src(R.maxHeight.page) });
  else out.push({ code: "height_ok", level: "ok", vars: { h: height, max: R.maxHeight.m, confirm: Boolean(R.maxHeight.confirm) }, source: src(R.maxHeight.page) });

  out.push({ code: "load_class", level: "note", vars: { cls: R.loadClass.cls, kn: R.loadClass.kNm2, kg: Math.round(R.loadClass.kNm2 * 100) }, source: src(R.loadClass.page) });

  if (sys === "layher") {
    const oneCatch = est.sides.filter((s) => s.lifts === 1 && s.catchOn).length;
    const one = est.sides.filter((s) => s.lifts === 1 && !s.catchOn).length;
    if (oneCatch) out.push({ code: "anchor_every_frame", level: "note", vars: { n: oneCatch }, source: src(R.anchors.page) });
    if (one) out.push({ code: "anchor_second_frame", level: "note", vars: { n: one }, source: src(R.anchors.page) });
    if (est.sides.some((s) => s.lifts > 1)) out.push({ code: "anchor_pattern", level: "note", vars: {}, source: src(R.anchors.sheetedPage) });
    out.push({ code: "sheeting_layher", level: "note", vars: {}, source: src(R.anchors.sheetedPage) });
  } else {
    out.push({ code: "anchor_4m", level: "note", vars: { kn: R.anchors.forceKn }, source: src(R.anchors.page) });
    out.push({ code: "sheeting_monzon", level: "note", vars: {}, source: src(R.anchors.forcePage) });
  }
  if (h.adjust && h.adjust.sides && Object.keys(h.adjust.sides).length) out.push({ code: "adjusted", level: "note", vars: {}, source: null });
  return out;
}

module.exports = { RULES, checksFor };
