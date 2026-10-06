// Telinekiito estimating engine: house -> scaffold sides -> parts list -> price.
// Plain script (no modules) so the same file is inlined into the page and tested in Node.
var Engine = (function () {
  var SYS = { bay: 3.07, width: 0.73, lift: 2.0, jack: 0.4, extend: 1.0 };

  var PARTS = [
    { key: "frames", name: "Aluminium frame 2.00 × 0.73 m", kg: 8.7 },
    { key: "baseJacks", name: "Base jack 0.6 m", kg: 3.8 },
    { key: "decks", name: "Deck 3.07 × 0.32 m", kg: 12.5 },
    { key: "hatchDecks", name: "Access deck with hatch and ladder 3.07 m", kg: 28 },
    { key: "guardrails", name: "Guardrail 3.07 m", kg: 3.0 },
    { key: "toeBoards", name: "Toe board 3.07 m", kg: 5.2 },
    { key: "endGuards", name: "End guardrail 0.73 m", kg: 4.5 },
    { key: "diagonals", name: "Diagonal brace for 3.07 m bay", kg: 6.5 },
    { key: "topPosts", name: "Top guardrail post 1.0 m", kg: 2.6 },
    { key: "catchPosts", name: "Roof-catch post 2.00 × 0.73 m", kg: 10.5 },
    { key: "catchMesh", name: "Roof-catch mesh panel 3.07 m", kg: 14 },
    { key: "anchors", name: "Wall anchor with eye bolt", kg: 1.6 }
  ];

  var DEFAULT_PRICING = {
    rentPerM2Day: 0.17,
    minRentDays: 7,
    erectPerM2: 4.5,
    dismantlePerM2: 2.5,
    catchPerMetre: 9,
    extraLevelPerM: 6,
    truckCapacityKg: 3000,
    zones: {
      A: { label: "Helsinki, Espoo, Vantaa, Kauniainen", trip: 150 },
      B: { label: "Rest of Uusimaa", trip: 260 },
      C: { label: "Outside Uusimaa, up to 150 km", trip: 420 }
    },
    urgency: {
      standard: { label: "Standard", lead: "3 working days", pct: 0 },
      express: { label: "Express", lead: "48 hours", pct: 35 },
      emergency: { label: "Emergency", lead: "24 hours", pct: 80 }
    },
    minOrder: 450,
    vat: 25.5,
    rangePct: 12
  };

  var STATUSES = [
    { key: "received", label: "Order received", cust: "We have your order and are checking the details and photos." },
    { key: "confirmed", label: "Confirmed", cust: "Price and start date are confirmed." },
    { key: "loading", label: "Loading at depot", cust: "Your scaffold kit is being loaded onto the truck." },
    { key: "en_route", label: "On the way", cust: "The crew is driving to your site." },
    { key: "erected", label: "Erected and inspected", cust: "The scaffold is up, inspected and tagged. Rental days are running." },
    { key: "pickup_requested", label: "Pickup requested", cust: "We are scheduling dismantling." },
    { key: "dismantled", label: "Dismantled and collected", cust: "The scaffold has been removed from your site." },
    { key: "closed", label: "Invoiced", cust: "Order complete. Thank you." }
  ];

  var ROOF_TYPES = { gable: "Gable", hip: "Hip", flat: "Flat or mono-pitch" };
  var JOB_TYPES = {
    roof: "Roof renovation",
    facade: "Facade work",
    roof_facade: "Roof and facade",
    gutters: "Gutters and eaves"
  };
  var EAVE_BY_FLOORS = { "1": 3.0, "1.5": 4.3, "2": 5.8 };

  function liftsForEave(eave) {
    return Math.max(1, Math.round((eave - 1.2 - SYS.jack) / SYS.lift));
  }
  function liftsForTop(target) {
    return Math.max(1, Math.round((target - SYS.jack) / SYS.lift));
  }

  function sidesFor(h) {
    var L = h.length, W = h.width;
    var rise = h.roofType === "flat" ? 0 : (W / 2) * Math.tan((h.pitch * Math.PI) / 180);
    var ridge = h.eave + rise;
    var eaveLifts = liftsForEave(h.eave);
    var gableLifts = h.roofType === "gable" ? Math.max(eaveLifts, liftsForTop(ridge - 2.0)) : eaveLifts;
    var sides = [];
    function add(name, len, lifts, catchOn, deckAll, kind) {
      sides.push({ name: name, len: len, lifts: lifts, catchOn: catchOn, deckAll: deckAll, kind: kind });
    }
    var gable = h.roofType === "gable";
    if (h.jobType === "roof") {
      add("Long side A", L, eaveLifts, true, false, "eaves");
      add("Long side B", L, eaveLifts, true, false, "eaves");
      if (gable) {
        if (h.gables) {
          add("Gable end A", W, gableLifts, false, false, "gable");
          add("Gable end B", W, gableLifts, false, false, "gable");
        }
      } else {
        add("Short side A", W, eaveLifts, true, false, "eaves");
        add("Short side B", W, eaveLifts, true, false, "eaves");
      }
    } else if (h.jobType === "facade" || h.jobType === "roof_facade") {
      // Facade: every side, every level decked. Roof and facade adds the roof-catch guard on every eave side.
      var both = h.jobType === "roof_facade";
      add("Long side A", L, eaveLifts, both, true, "eaves");
      add("Long side B", L, eaveLifts, both, true, "eaves");
      add(gable ? "Gable end A" : "Short side A", W, gable ? gableLifts : eaveLifts, both && !gable, true, gable ? "gable" : "eaves");
      add(gable ? "Gable end B" : "Short side B", W, gable ? gableLifts : eaveLifts, both && !gable, true, gable ? "gable" : "eaves");
    } else {
      add("Long side A", L, eaveLifts, false, false, "eaves");
      add("Long side B", L, eaveLifts, false, false, "eaves");
      if (!gable) {
        add("Short side A", W, eaveLifts, false, false, "eaves");
        add("Short side B", W, eaveLifts, false, false, "eaves");
      }
    }
    return { sides: sides, ridge: ridge, rise: rise, eaveLifts: eaveLifts, gableLifts: gableLifts };
  }

  /**
   * Sides from measured walls (the 3D building model): h.walls lists the walls around the outline in order, each
   * { edge, len, eave, top, gable, ext } in metres. ext is how many of its ends are outer corners, where the scaffold
   * runs 1 m past (inner corners and height steps along one wall need none). Short jogs (under 2 m) are scaffolded
   * as part of the side next to them. Job rules are the same as for the rectangle. The scaffold area uses the real
   * run length (crews mix shorter bays on broken walls); the parts list still rounds up to whole 3.07 m bays.
   */
  var MIN_WALL = 2.0;
  function wallSidesFor(h) {
    var ws = h.walls.map(function (w, i) {
      var prev = h.walls[i - 1], next = h.walls[i + 1];
      return {
        edge: w.edge, len: w.len, eave: w.eave, top: Math.max(w.top, w.eave),
        gable: w.gable != null ? Boolean(w.gable) : w.top - w.eave > 1.0,
        ext: w.ext != null ? w.ext : (prev && prev.edge === w.edge ? 0 : 1) + (next && next.edge === w.edge ? 0 : 1)
      };
    });
    var kept = [];
    ws.forEach(function (w, i) {
      if (w.len >= MIN_WALL) kept.push(w);
      else if (kept.length) kept[kept.length - 1].len += w.len;
      else if (ws[i + 1]) ws[i + 1].len += w.len;
    });
    if (!kept.length) return null;
    var sides = [], ridge = 0, eaveLifts = 0, gableLifts = 0;
    var job = h.jobType, deck = job === "facade" || job === "roof_facade";
    kept.forEach(function (w) {
      ridge = Math.max(ridge, w.top);
      var el = liftsForEave(w.eave);
      var lifts = w.gable ? Math.max(el, liftsForTop(w.top - 2.0)) : el;
      eaveLifts = Math.max(eaveLifts, el);
      if (w.gable) gableLifts = Math.max(gableLifts, lifts);
      if (w.gable && (job === "gutters" || (job === "roof" && !h.gables))) return;
      var catchOn = !w.gable && (job === "roof" || job === "roof_facade");
      sides.push({
        name: (w.gable ? "Gable end " : "Wall ") + (sides.length + 1), len: Math.round(w.len * 100) / 100, lifts: lifts,
        catchOn: catchOn, deckAll: deck, kind: w.gable ? "gable" : "eaves", ext: w.ext, exact: true
      });
    });
    if (!sides.length) return null;
    return { sides: sides, ridge: ridge, rise: 0, eaveLifts: eaveLifts, gableLifts: gableLifts || eaveLifts };
  }

  function sideCalc(s) {
    var run = s.len + (s.ext == null ? 2 : s.ext) * SYS.extend;
    var bays = Math.max(1, Math.ceil(run / SYS.bay - 0.05));
    var runM = s.exact ? run : bays * SYS.bay;
    var n = bays + 1, Lf = s.lifts, D = s.deckAll ? Lf : 1;
    var deckH = SYS.jack + SYS.lift * Lf;
    var workH = deckH + 2;
    var area = runM * workH;
    var parts = {
      frames: n * Lf,
      baseJacks: n * 2,
      decks: Math.max(0, D * bays * 2 - 2 * D),
      hatchDecks: Lf,
      guardrails: 2 * bays * D,
      toeBoards: bays * D,
      endGuards: 2 * D,
      diagonals: Lf * Math.ceil(bays / 5),
      topPosts: s.catchOn ? 0 : n,
      catchPosts: s.catchOn ? n : 0,
      catchMesh: s.catchOn ? bays : 0,
      anchors: Math.ceil(n / 2) * Lf
    };
    return {
      name: s.name, kind: s.kind, len: s.len, lifts: Lf, catchOn: s.catchOn, deckAll: s.deckAll,
      bays: bays, runM: runM, deckH: deckH, workH: workH, area: area, parts: parts
    };
  }

  function estimate(h) {
    var geo = (Array.isArray(h.walls) && h.walls.length && wallSidesFor(h)) || sidesFor(h);
    var sides = geo.sides.map(sideCalc);
    var parts = {};
    PARTS.forEach(function (p) { parts[p.key] = 0; });
    var area = 0, runM = 0, catchRunM = 0, extraLevelM = 0;
    sides.forEach(function (s) {
      area += s.area;
      runM += s.runM;
      if (s.catchOn) catchRunM += s.runM;
      if (s.deckAll && s.lifts > 1) extraLevelM += s.runM * (s.lifts - 1);
      Object.keys(s.parts).forEach(function (k) { parts[k] += s.parts[k]; });
    });
    var weightKg = 0;
    PARTS.forEach(function (p) { weightKg += parts[p.key] * p.kg; });
    return {
      sides: sides,
      ridge: geo.ridge,
      totals: {
        area: Math.round(area),
        runM: Math.round(runM * 10) / 10,
        catchRunM: Math.round(catchRunM * 10) / 10,
        extraLevelM: Math.round(extraLevelM * 10) / 10,
        parts: parts,
        weightKg: Math.round(weightKg)
      }
    };
  }

  function quote(est, sel, P) {
    var area = est.totals.area;
    var rentDays = Math.max(sel.days || 0, P.minRentDays);
    var rent = area * P.rentPerM2Day * rentDays;
    var erect = area * P.erectPerM2;
    var dismantle = area * P.dismantlePerM2;
    var roofCatch = est.totals.catchRunM * P.catchPerMetre;
    // Facade work decks every level; levels above the first add decks, guardrails and toe boards.
    var extraLevelM = est.totals.extraLevelM || 0;
    var extraLevels = extraLevelM * (P.extraLevelPerM || 0);
    var zone = P.zones[sel.zone] || P.zones.A;
    var trucks = Math.max(1, Math.ceil(est.totals.weightKg / P.truckCapacityKg));
    var transport = 2 * zone.trip * trucks;
    var tier = P.urgency[sel.urgency] || P.urgency.standard;
    var service = erect + dismantle + roofCatch + extraLevels + transport;
    var premium = (service * tier.pct) / 100;
    var lines = [
      { key: "rent", label: "Rent, " + rentDays + " days", amount: rent, vars: { days: rentDays } },
      { key: "erect", label: "Erection and inspection", amount: erect },
      { key: "dismantle", label: "Dismantling", amount: dismantle }
    ];
    if (roofCatch > 0) lines.push({ key: "catch", label: "Roof-catch protection", amount: roofCatch });
    if (extraLevels > 0) lines.push({ key: "levels", label: "Extra working levels, " + Math.round(extraLevelM) + " m", amount: extraLevels, vars: { m: Math.round(extraLevelM) } });
    lines.push({ key: "transport", label: "Delivery and pickup" + (trucks > 1 ? ", " + trucks + " loads" : ""), amount: transport, vars: { loads: trucks } });
    if (premium > 0) lines.push({ key: "premium", label: tier.label + " premium (+" + tier.pct + "% on service)", amount: premium, vars: { tier: P.urgency[sel.urgency] ? sel.urgency : "standard", pct: tier.pct } });
    var net = rent + service + premium;
    var minAdj = Math.max(0, P.minOrder - net);
    if (minAdj > 0) lines.push({ key: "min", label: "Minimum order adjustment", amount: minAdj });
    net += minAdj;
    var vat = (net * P.vat) / 100;
    var total = net + vat;
    var labourGross = (erect + dismantle) * (1 + tier.pct / 100) * (1 + P.vat / 100);
    return {
      lines: lines.map(function (l) { var o = { key: l.key, label: l.label, amount: round2(l.amount) }; if (l.vars) o.vars = l.vars; return o; }),
      rentDays: rentDays,
      trucks: trucks,
      net: round2(net),
      vat: round2(vat),
      total: round2(total),
      low: round2(total * (1 - P.rangePct / 100)),
      high: round2(total * (1 + P.rangePct / 100)),
      labourGross: round2(labourGross),
      perM2: round2(net / Math.max(1, area))
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  // Dates are handled as YYYY-MM-DD strings in local time.
  function toISODate(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function fromISODate(s) {
    var p = String(s).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function earliestStart(urgency, now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (urgency === "emergency") { d.setDate(d.getDate() + 1); return toISODate(d); }
    if (urgency === "express") { d.setDate(d.getDate() + 2); return toISODate(d); }
    var added = 0;
    while (added < 3) {
      d.setDate(d.getDate() + 1);
      var wd = d.getDay();
      if (wd !== 0 && wd !== 6) added++;
    }
    return toISODate(d);
  }

  var REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function makeRef(rand) {
    var r = rand || Math.random;
    var s = "TK-";
    for (var i = 0; i < 6; i++) s += REF_CHARS[Math.floor(r() * REF_CHARS.length)];
    return s;
  }

  return {
    SYS: SYS, PARTS: PARTS, DEFAULT_PRICING: DEFAULT_PRICING, STATUSES: STATUSES,
    ROOF_TYPES: ROOF_TYPES, JOB_TYPES: JOB_TYPES, EAVE_BY_FLOORS: EAVE_BY_FLOORS,
    estimate: estimate, quote: quote, earliestStart: earliestStart,
    toISODate: toISODate, fromISODate: fromISODate, makeRef: makeRef
  };
})();
if (typeof module !== "undefined") module.exports = Engine;
