// Telinekiito estimating engine: house -> scaffold sides -> parts list -> price.
// Plain script (no modules) so the same file is inlined into the page and tested in Node.
var Engine = (function () {
  // Geometry shared by both systems: 2.00 m lifts, base jacks set about 0.4 m, scaffold runs 1 m past outer corners.
  var SYS = { bay: 3.07, width: 0.73, lift: 2.0, jack: 0.4, extend: 1.0 };

  /*
   * Two aluminium frame scaffold systems. Each has its own bay length and parts (unique keys, so stock and parts
   * lists never mix them: the parts of different makers don't fit together).
   *
   * layher: Layher Blitz 70 aluminium, 2.00 x 0.73 m frames, 3.07 m bays, 0.32 m decks. Sizes as in Layher's
   *   "Blitz Geruest - Katalog und Preisliste" (04.2019, art. no. 8102.060), e.g. Blitz Stellrahmen Aluminium
   *   2.00 x 0.73 m, art. 1714.200, 8.6 kg. The weights below are rounded working figures.
   * monzon: MonZon Modular Light, an aluminium modular (rosette) scaffold on the same 3.07 m x 0.73 m grid:
   *   2.00 m standards (inner and outer), 0.73 m U-transoms, 3.07 m O-ledgers, two 0.32 m U-decks per bay, a hatch
   *   access deck with ladder on each level, double guardrails. Part numbers and weights from the MonZon
   *   "Modular Light" catalogue 2022 (https://www.monzon.se/userfiles/files/EN_ModularLight_katalog_2022_low.pdf).
   *   Rules from the Modular Light assembly instruction v2.1: base collars and base ledgers always at the bottom,
   *   vertical diagonal braces in at least every fifth bay, wall ties on all inner standards every 4 m of height and
   *   below the top level. The roof-catch net is not in the catalogue: its weight is our estimate.
   */
  var SYSTEMS = {
    layher: { key: "layher", name: "Layher Blitz 70 Alu", bay: 3.07, width: 0.73 },
    monzon: { key: "monzon", name: "MonZon Modular Light", bay: 3.07, width: 0.73 }
  };
  var SYSTEM_KEYS = ["layher", "monzon"];
  function systemOf(key) { return SYSTEMS[key] || SYSTEMS.layher; }

  var PARTS = [
    { key: "frames", system: "layher", name: "Aluminium frame 2.00 × 0.73 m", kg: 8.7 },
    { key: "baseJacks", system: "layher", name: "Base jack 0.6 m", kg: 3.8 },
    { key: "decks", system: "layher", name: "Deck 3.07 × 0.32 m", kg: 12.5 },
    { key: "hatchDecks", system: "layher", name: "Access deck with hatch and ladder 3.07 m", kg: 28 },
    { key: "guardrails", system: "layher", name: "Guardrail 3.07 m", kg: 3.0 },
    { key: "toeBoards", system: "layher", name: "Toe board 3.07 m", kg: 5.2 },
    { key: "endGuards", system: "layher", name: "End guardrail 0.73 m", kg: 4.5 },
    { key: "diagonals", system: "layher", name: "Diagonal brace for 3.07 m bay", kg: 6.5 },
    { key: "topPosts", system: "layher", name: "Top guardrail post 1.0 m", kg: 2.6 },
    { key: "catchPosts", system: "layher", name: "Roof-catch post 2.00 × 0.73 m", kg: 10.5 },
    { key: "catchMesh", system: "layher", name: "Roof-catch mesh panel 3.07 m", kg: 14 },
    { key: "anchors", system: "layher", name: "Wall anchor with eye bolt", kg: 1.6 },

    { key: "mz_baseJacks", system: "monzon", name: "Base jack 0.60 m (111.060)", kg: 3.5 },
    { key: "mz_baseCollars", system: "monzon", name: "Base collar 0.43 m (201.000)", kg: 2.3 },
    { key: "mz_standards", system: "monzon", name: "Standard 2.00 m, aluminium (240.200)", kg: 4.1 },
    { key: "mz_transoms", system: "monzon", name: "U-transom 0.73 m (242.073)", kg: 1.5 },
    { key: "mz_ledgers", system: "monzon", name: "O-ledger 3.07 m (241.307)", kg: 5.7 },
    { key: "mz_decks", system: "monzon", name: "U-deck 32, 3.07 × 0.32 m (310.307)", kg: 13.5 },
    { key: "mz_accessDecks", system: "monzon", name: "Access deck with hatch and ladder 3.07 × 0.61 m (417.307)", kg: 21.4 },
    { key: "mz_guardrails", system: "monzon", name: "Double guardrail 3.07 m (251.307)", kg: 8.5 },
    { key: "mz_endGuards", system: "monzon", name: "Double guardrail 0.73 m, end (251.073)", kg: 3.8 },
    { key: "mz_toeBoards", system: "monzon", name: "Toe board 3.07 m, aluminium (118.307)", kg: 5 },
    { key: "mz_endToeBoards", system: "monzon", name: "End toe board 0.73 m, aluminium (119.073)", kg: 1 },
    { key: "mz_braces", system: "monzon", name: "Vertical diagonal brace 3.07 × 2.00 m (244.307)", kg: 7.6 },
    { key: "mz_topPosts", system: "monzon", name: "Standard 1.00 m as top guardrail post (240.100)", kg: 2.2 },
    { key: "mz_catchPosts", system: "monzon", name: "Standard 2.00 m as roof-catch post (240.200)", kg: 4.1 },
    { key: "mz_catchMesh", system: "monzon", name: "Roof-catch net 3.07 m (not in the MonZon catalogue)", kg: 14 },
    // Weather protection. Sheeting: MonZon "Scaffold Sheeting 3.3 x 36 m" and bungee ties (shop, 2026).
    // Temporary roof: MonZon PROTECT IT keder roof, 18° pitch, 2.50 m sections (PROTECT IT catalogue 2022,
    // https://www.monzon.se/userfiles/files/EN_PROTECT%20IT_katalog_2022_low.pdf). Tarpaulin weights as listed there.
    { key: "wp_sheetRolls", system: "weather", name: "Scaffold sheeting roll 3.3 × 36 m", kg: 50 },
    { key: "wp_ties", system: "weather", name: "Bungee toggle tie", kg: 0.05 },
    { key: "wr_eaves", system: "weather", name: "Keder roof eave 18° (556.018)", kg: 12.5 },
    { key: "wr_ridges", system: "weather", name: "Keder roof ridge 18° (901.018)", kg: 12.2 },
    { key: "wr_beam300", system: "weather", name: "Keder roof lattice beam 3.00 m (901.300)", kg: 26.0 },
    { key: "wr_beam200", system: "weather", name: "Keder roof lattice beam 2.00 m (901.200)", kg: 20.2 },
    { key: "wr_beam100", system: "weather", name: "Keder roof lattice beam 1.00 m (901.100)", kg: 11.1 },
    { key: "wr_beam050", system: "weather", name: "Keder roof lattice beam 0.50 m (901.050)", kg: 7.9 },
    { key: "wr_frames", system: "weather", name: "Roof support frame 2.50 m (947.250)", kg: 6.8 },
    { key: "wr_ledgers", system: "weather", name: "O-ledger 2.50 m between trusses (241.250)", kg: 5.0 },
    { key: "wr_tarps", system: "weather", name: "Keder roof tarpaulin, 2.50 m section", kg: 0 },
    { key: "wr_gableTarps", system: "weather", name: "Keder roof gable tarpaulin", kg: 0 },
    // Layher Keder Roof XL (Layher "Protective System" catalogue, EN): 2.57 m bays, 18°, aluminium lattice beams 750.
    // Quantities per truss and bay follow the catalogue's material example (15.40 × 12.86 m, 5 bays: 1,942 kg).
    { key: "lr_eaves", system: "weather", name: "Keder Roof XL eaves section 2.00 m (5975.100)", kg: 14.3 },
    { key: "lr_ridges", system: "weather", name: "Keder Roof XL ridge section 18° (5975.110)", kg: 24.5 },
    { key: "lr_beam300", system: "weather", name: "Keder Roof XL lattice beam 3.00 m (5975.300)", kg: 24.4 },
    { key: "lr_beam200", system: "weather", name: "Keder Roof XL lattice beam 2.00 m (5975.200)", kg: 17.3 },
    { key: "lr_supports", system: "weather", name: "Swivelling roof support 0.73 m (5975.073)", kg: 19.1 },
    { key: "lr_ledgers", system: "weather", name: "Keder Roof XL ledger 2.57 m", kg: 4.2 },
    { key: "lr_stiffeners", system: "weather", name: "Keder Roof XL stiffener 2.57 m", kg: 5.0 },
    { key: "lr_braces", system: "weather", name: "Keder Roof XL horizontal diagonal brace 2.57 m", kg: 8.0 },
    { key: "lr_tarps", system: "weather", name: "Keder roof tarpaulin 2.57 m wide", kg: 0 },
    { key: "lr_gableTarps", system: "weather", name: "Keder Roof XL gable tarpaulin, 2-piece", kg: 0 },
    { key: "mz_anchors", system: "monzon", name: "Wall tie 0.50 m with eyebolt (112.050 + 112.120)", kg: 2.3 }
  ];

  /** Parts for one side, by system. n = frame lines, Lf = lifts, D = decked levels. */
  function sideParts(sys, s, bays, n, Lf, D) {
    if (sys.key === "monzon") {
      // Modular: two standards per frame line on every lift, transoms on every lift and at the base, ledgers along
      // the base (inside and out), along the inside of every lift, and outside where no double guardrail is fitted.
      return {
        mz_baseJacks: n * 2,
        mz_baseCollars: n * 2,
        mz_standards: n * 2 * Lf,
        mz_transoms: n * (Lf + 1),
        mz_ledgers: bays * 2 + bays * Lf + bays * (Lf - D),
        mz_decks: Math.max(0, D * bays * 2 - 2 * D),
        mz_accessDecks: Lf,
        mz_guardrails: bays * D,
        mz_endGuards: 2 * D,
        mz_toeBoards: bays * D,
        mz_endToeBoards: 2 * D,
        mz_braces: Lf * Math.ceil(bays / 5),
        mz_topPosts: s.catchOn ? 0 : n,
        mz_catchPosts: s.catchOn ? n : 0,
        mz_catchMesh: s.catchOn ? bays : 0,
        mz_anchors: n * Math.max(1, Math.ceil(Lf / 2))
      };
    }
    return {
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
      // Layher Blitz AuV p. 14: one level – anchor every second frame; one level with roof-catch – every frame.
      anchors: Lf === 1 ? (s.catchOn ? n : Math.ceil(n / 2)) : Math.ceil(n / 2) * Lf
    };
  }

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
    // Weather protection (starting values; set your own from partner offers in the office).
    sheetingPerM2: 4.0,
    roofRentPerM2Day: 0.3,
    roofWorkPerM2: 16,
    // Per system: on/off and its own rent, erection and dismantling rates (0 or missing = the general rate).
    systems: { layher: { enabled: true }, monzon: { enabled: true } },
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
    var along = {}; // where each piece starts along its outline edge (pieces of one edge follow each other)
    var ws = h.walls.map(function (w, i) {
      var prev = h.walls[i - 1], next = h.walls[i + 1];
      var t0 = along[w.edge] || 0;
      along[w.edge] = t0 + w.len;
      return {
        edge: w.edge, t0: t0, e0: w.e0, len: w.len, eave: w.eave, top: Math.max(w.top, w.eave),
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
        catchOn: catchOn, deckAll: deck, kind: w.gable ? "gable" : "eaves", ext: w.ext, exact: true,
        edge: w.edge, t0: w.t0, e0: w.e0 != null ? w.e0 : w.ext > 0 ? 1 : 0
      });
    });
    if (!sides.length) return null;
    return { sides: sides, ridge: ridge, rise: 0, eaveLifts: eaveLifts, gableLifts: gableLifts || eaveLifts };
  }

  /**
   * The office's changes to the calculated layout, per side name: { off, bays, lifts, deckAll, catchOn }.
   * A side switched off is left out; a fixed number of bays sets the run length.
   */
  function applyAdjust(sides, adjust) {
    var adj = (adjust && adjust.sides) || {};
    return sides.filter(function (s) { return !(adj[s.name] && adj[s.name].off); }).map(function (s) {
      var a = adj[s.name];
      if (!a) return s;
      var o = {};
      for (var k in s) o[k] = s[k];
      if (a.lifts >= 1 && a.lifts <= 12) o.lifts = Math.round(a.lifts);
      if (typeof a.deckAll === "boolean") o.deckAll = a.deckAll;
      if (typeof a.catchOn === "boolean") o.catchOn = a.catchOn;
      if (a.bays >= 1 && a.bays <= 60) o.fixedBays = Math.round(a.bays);
      return o;
    });
  }

  function sideCalc(s, sys) {
    sys = sys || SYSTEMS.layher;
    var run = s.len + (s.ext == null ? 2 : s.ext) * SYS.extend;
    var bays = s.fixedBays || Math.max(1, Math.ceil(run / sys.bay - 0.05));
    var runM = s.exact && !s.fixedBays ? run : bays * sys.bay;
    var n = bays + 1, Lf = s.lifts;
    // Decked levels (1 = lowest lift): every level for facade work, otherwise the top one. A side raised to carry
    // a temporary roof keeps its working decks and gets one more on top for putting the roof up.
    var levels = s.deckLevels || (s.deckAll ? Array.from({ length: Lf }, function (_, k) { return k + 1; }) : [Lf]);
    var D = levels.length;
    var deckH = SYS.jack + SYS.lift * Lf;
    var workH = deckH + 2;
    var area = runM * workH;
    var parts = sideParts(sys, s, bays, n, Lf, D);
    return {
      name: s.name, kind: s.kind, len: s.len, lifts: Lf, catchOn: s.catchOn, deckAll: s.deckAll,
      bays: bays, runM: runM, deckH: deckH, workH: workH, area: area, parts: parts, deckLevels: levels,
      // Where the side stands (for drawings): outline edge, start along it, overhang before the start.
      edge: s.edge, t0: s.t0, e0: s.e0, ext: s.ext
    };
  }

  function estimate(h) {
    var sys = systemOf(h.system);
    var w = weatherOptions(h);
    var wallGeo = Array.isArray(h.walls) && h.walls.length ? wallSidesFor(h) : null;
    var geo = wallGeo || sidesFor(h);
    // A temporary roof needs a rectangular scaffold under its edges: on a measured L- or T-shaped house the
    // scaffold goes round the whole house as a rectangle (length × width), and the roof clears the real ridge.
    var aroundHouse = Boolean(w.weatherRoof && wallGeo);
    if (aroundHouse) { geo = sidesFor(h); geo.ridge = Math.max(geo.ridge, wallGeo.ridge); }
    var raw = applyAdjust(geo.sides, h.adjust);
    var roof = w.weatherRoof ? weatherRoof(h, sys, geo.ridge) : null;
    if (roof) {
      // Every side goes up to carry the roof; the roof itself protects the eaves, so no roof-catch is needed.
      raw = raw.map(function (s) {
        var o = {};
        for (var k in s) o[k] = s[k];
        o.lifts = Math.max(s.lifts, roof.lifts);
        var work = s.deckAll ? Array.from({ length: s.lifts }, function (_, k) { return k + 1; }) : [s.lifts];
        o.deckLevels = work.indexOf(o.lifts) >= 0 ? work : work.concat([o.lifts]);
        o.catchOn = false;
        return o;
      });
    }
    var sides = raw.map(function (s) { return sideCalc(s, sys); });
    var parts = {};
    PARTS.forEach(function (p) { if (p.system === sys.key) parts[p.key] = 0; });
    var sheetM2 = 0;
    if (w.sheeting) {
      sides.forEach(function (s) {
        sheetM2 += s.runM * (s.deckH + (s.catchOn ? 2 : 1));
        // Denser anchoring: every standard line on every level.
        var n = s.bays + 1, extra = n * s.lifts - (s.parts.anchors || s.parts.mz_anchors || 0);
        if (extra > 0) s.parts[sys.key === "monzon" ? "mz_anchors" : "anchors"] += extra;
      });
      parts.wp_sheetRolls = Math.ceil((sheetM2 * 1.15) / (3.3 * 36));
      parts.wp_ties = Math.ceil(sheetM2 * 1.2);
    }
    if (roof) Object.keys(roof.parts).forEach(function (k) { parts[k] = roof.parts[k]; });
    var area = 0, runM = 0, catchRunM = 0, extraLevelM = 0;
    sides.forEach(function (s) {
      area += s.area;
      runM += s.runM;
      if (s.catchOn) catchRunM += s.runM;
      // Facade work: decked levels above the first add decks, guardrails and toe boards.
      if (s.deckAll && s.deckLevels.length > 1) extraLevelM += s.runM * (s.deckLevels.length - 1);
      Object.keys(s.parts).forEach(function (k) { parts[k] += s.parts[k]; });
    });
    var weightKg = 0;
    PARTS.forEach(function (p) { if (p.key in parts) weightKg += parts[p.key] * p.kg; });
    if (roof) weightKg += roof.tarpKg; // tarpaulin weights depend on the roof width
    return {
      system: sys.key,
      sides: sides,
      ridge: geo.ridge,
      aroundHouse: aroundHouse,
      sheeting: w.sheeting ? { m2: Math.round(sheetM2) } : null,
      roof: roof ? { span: roof.span, length: roof.length, pitch: roof.pitch, support: roof.support, sections: roof.sections, tarpWidth: roof.tarpWidth, planM2: roof.planM2 } : null,
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

  /*
   * Weather protection.
   * Sheeting covers the outer face of every side, full height; a sheeted scaffold catches wind, so every standard
   * line is anchored on every level (Layher AuV p. 17: every 2 m; MonZon: ask for the anchoring).
   * The temporary roof (MonZon PROTECT IT, 18°) spans the scaffold from outer edge to outer edge and rests on the
   * top of the scaffold. Its trusses (0.75 m deep) must clear the house ridge, so every side is raised to carry it.
   */
  var ROOF = { pitch: 18, section: 2.5, depth: 0.75, clear: 0.5, eave: 0.87, ridge: 1.05 };
  // Layher Keder Roof XL: eaves section 2.00 m and ridge 2.54 m along the slope, beams 0.78 m deep, 2.57 m bays.
  var LROOF = { pitch: 18, section: 2.57, depth: 0.78, clear: 0.5, eave: 2.0, ridge: 2.54 };
  // Layher roof tarpaulin lengths (m, eave to eave over the ridge); PVC 650 g/m².
  var LTARPS = [11, 14, 17, 20, 22.5, 24.5, 26.5, 28.5, 30.5, 32.5, 34.5, 36.5, 38.5];
  // Keder roof tarpaulin sizes: roof width (m) → weight per 2.50 m section (kg); gable tarpaulin weight (kg).
  var TARPS = [[10.0, 24.8, 14.8], [10.9, 28.9, 19.3], [13.8, 33.1, 24.4], [15.71, 37.2, 29.7], [17.61, 41.4, 36.0], [19.51, 45.6, 42.6], [21.41, 49.7, 49.8], [23.32, 53.9, 57.4], [25.22, 58.0, 65.6], [27.12, 62.2, 74.4], [29.02, 66.4, 83.6]];
  function weatherRoof(h, sys, ridge) {
    return sys.key === "layher" ? layherRoof(h, sys, ridge) : monzonRoof(h, sys, ridge);
  }

  function layherRoof(h, sys, ridge) {
    var R = LROOF, off = 2 * (0.3 + sys.width);
    var span = h.width + off, length = h.length + off;
    var rad = (R.pitch * Math.PI) / 180, t = Math.tan(rad);
    var support = ridge + R.clear + R.depth - (span / 2) * t;
    // The roof supports stand on the top standards, about 1 m above the top deck.
    var lifts = Math.max(1, Math.ceil((support - 1.0 - SYS.jack) / SYS.lift - 0.01));
    var sections = Math.max(1, Math.ceil(length / R.section - 0.02));
    var trusses = sections + 1;
    // Each half truss: eaves section, lattice beams 3.00 / 2.00 m, half the ridge section.
    var left = Math.max(0, span / 2 / Math.cos(rad) - R.eave - R.ridge / 2);
    var n3 = Math.floor(left / 3 + 1e-6), n2 = 0;
    left -= n3 * 3;
    if (left > 0.05) { if (left <= 2) n2 = 1; else n3 += 1; }
    var tarpLen = LTARPS.filter(function (x) { return x >= (span / Math.cos(rad)) * 1.2; })[0] || LTARPS[LTARPS.length - 1];
    var parts = {
      lr_eaves: 2 * trusses, lr_ridges: trusses, lr_beam300: 2 * trusses * n3, lr_beam200: 2 * trusses * n2,
      lr_supports: 2 * trusses, lr_ledgers: 6 * sections, lr_stiffeners: Math.ceil(5.6 * sections), lr_braces: 2 * Math.ceil(sections / 3),
      lr_tarps: sections, lr_gableTarps: 2
    };
    var gable = (span * span / 4) * t * 1.3; // m² per gable, with overlap
    return {
      span: Math.round(span * 100) / 100, length: Math.round(sections * R.section * 100) / 100, pitch: R.pitch,
      support: Math.round((SYS.jack + SYS.lift * lifts) * 100) / 100, lifts: lifts, sections: sections, tarpWidth: tarpLen,
      planM2: Math.round(span * sections * R.section), parts: parts, tarpKg: Math.round(0.65 * (sections * R.section * tarpLen + 2 * gable))
    };
  }

  function monzonRoof(h, sys, ridge) {
    var off = 2 * (0.3 + sys.width);
    var span = h.width + off, length = h.length + off;
    var t = Math.tan((ROOF.pitch * Math.PI) / 180);
    // Deck level the trusses sit on: their underside at mid-span must clear the ridge.
    var support = ridge + ROOF.clear + ROOF.depth - (span / 2) * t;
    // The roof supports stand on the top standards, about 1 m above the top deck.
    var lifts = Math.max(1, Math.ceil((support - 1.0 - SYS.jack) / SYS.lift - 0.01));
    var sections = Math.max(1, Math.ceil(length / ROOF.section - 0.02));
    var trusses = sections + 1;
    // Each half of a truss: eave piece, lattice beams, half the ridge piece.
    var half = span / 2 / Math.cos((ROOF.pitch * Math.PI) / 180) - ROOF.eave - ROOF.ridge / 2;
    var beams = { wr_beam300: 0, wr_beam200: 0, wr_beam100: 0, wr_beam050: 0 };
    var left = Math.max(0, half);
    [[3, "wr_beam300"], [2, "wr_beam200"], [1, "wr_beam100"]].forEach(function (b) { var n = Math.floor(left / b[0] + 1e-6); beams[b[1]] += n; left -= n * b[0]; });
    if (left > 0.01) beams.wr_beam050 += Math.ceil(left / 0.5);
    var tarp = TARPS.filter(function (x) { return x[0] >= span; })[0] || TARPS[TARPS.length - 1];
    var parts = {
      wr_eaves: 2 * trusses, wr_ridges: trusses,
      wr_beam300: 2 * trusses * beams.wr_beam300, wr_beam200: 2 * trusses * beams.wr_beam200,
      wr_beam100: 2 * trusses * beams.wr_beam100, wr_beam050: 2 * trusses * beams.wr_beam050,
      wr_frames: 2 * sections, wr_ledgers: 3 * sections, wr_tarps: sections, wr_gableTarps: 2
    };
    return {
      span: Math.round(span * 100) / 100, length: Math.round(sections * ROOF.section * 100) / 100, pitch: ROOF.pitch,
      support: Math.round((SYS.jack + SYS.lift * lifts) * 100) / 100, lifts: lifts, sections: sections, tarpWidth: tarp[0],
      planM2: Math.round(span * sections * ROOF.section), parts: parts, tarpKg: sections * tarp[1] + 2 * tarp[2]
    };
  }

  /**
   * Weather protection follows the job: a temporary roof only for jobs with roof work (roof, roof and facade),
   * sheeting only for jobs with facade scaffolding on every level (facade, roof and facade).
   */
  var ROOF_JOBS = ["roof", "roof_facade"], SHEET_JOBS = ["facade", "roof_facade"];
  function weatherOptions(h) {
    return { weatherRoof: Boolean(h.weatherRoof) && ROOF_JOBS.indexOf(h.jobType) >= 0, sheeting: Boolean(h.sheeting) && SHEET_JOBS.indexOf(h.jobType) >= 0 };
  }

  /** A system's own rate where the office has set one; otherwise the general rate. */
  function rateOf(P, system, k) {
    var o = P.systems && P.systems[system];
    return o && typeof o[k] === "number" && o[k] > 0 ? o[k] : P[k];
  }

  function quote(est, sel, P) {
    var area = est.totals.area;
    var system = est.system || "layher";
    var rentDays = Math.max(sel.days || 0, P.minRentDays);
    var rent = area * rateOf(P, system, "rentPerM2Day") * rentDays;
    var erect = area * rateOf(P, system, "erectPerM2");
    var dismantle = area * rateOf(P, system, "dismantlePerM2");
    var roofCatch = est.totals.catchRunM * P.catchPerMetre;
    // Facade work decks every level; levels above the first add decks, guardrails and toe boards.
    var extraLevelM = est.totals.extraLevelM || 0;
    var extraLevels = extraLevelM * (P.extraLevelPerM || 0);
    var zone = P.zones[sel.zone] || P.zones.A;
    var trucks = Math.max(1, Math.ceil(est.totals.weightKg / P.truckCapacityKg));
    var transport = 2 * zone.trip * trucks;
    var tier = P.urgency[sel.urgency] || P.urgency.standard;
    // Weather protection: sheeting fitted and removed per m²; the temporary roof rented per m² of roof plan and
    // put up and taken down per m².
    var sheeting = est.sheeting ? est.sheeting.m2 * (P.sheetingPerM2 || 0) : 0;
    var roofRent = est.roof ? est.roof.planM2 * (P.roofRentPerM2Day || 0) * rentDays : 0;
    var roofWork = est.roof ? est.roof.planM2 * (P.roofWorkPerM2 || 0) : 0;
    rent += roofRent;
    var service = erect + dismantle + roofCatch + extraLevels + transport + sheeting + roofWork;
    var premium = (service * tier.pct) / 100;
    var lines = [
      { key: "rent", label: "Rent, " + rentDays + " days", amount: rent - roofRent, vars: { days: rentDays } },
      { key: "erect", label: "Erection and inspection", amount: erect },
      { key: "dismantle", label: "Dismantling", amount: dismantle }
    ];
    if (roofCatch > 0) lines.push({ key: "catch", label: "Roof-catch protection", amount: roofCatch });
    if (sheeting > 0) lines.push({ key: "sheeting", label: "Weather sheeting, " + est.sheeting.m2 + " m²", amount: sheeting, vars: { m2: est.sheeting.m2 } });
    if (roofRent > 0) lines.push({ key: "roofRent", label: "Temporary roof rent, " + est.roof.planM2 + " m², " + rentDays + " days", amount: roofRent, vars: { m2: est.roof.planM2, days: rentDays } });
    if (roofWork > 0) lines.push({ key: "roofWork", label: "Temporary roof, putting up and taking down", amount: roofWork, vars: { m2: est.roof.planM2 } });
    if (extraLevels > 0) lines.push({ key: "levels", label: "Extra working levels, " + Math.round(extraLevelM) + " m", amount: extraLevels, vars: { m: Math.round(extraLevelM) } });
    lines.push({ key: "transport", label: "Delivery and pickup" + (trucks > 1 ? ", " + trucks + " loads" : ""), amount: transport, vars: { loads: trucks } });
    if (premium > 0) lines.push({ key: "premium", label: tier.label + " premium (+" + tier.pct + "% on service)", amount: premium, vars: { tier: P.urgency[sel.urgency] ? sel.urgency : "standard", pct: tier.pct } });
    var net = rent + service + premium;
    var minAdj = Math.max(0, P.minOrder - net);
    if (minAdj > 0) lines.push({ key: "min", label: "Minimum order adjustment", amount: minAdj });
    net += minAdj;
    var vat = (net * P.vat) / 100;
    var total = net + vat;
    var labourGross = (erect + dismantle + roofWork + sheeting * 0.6) * (1 + tier.pct / 100) * (1 + P.vat / 100);
    return {
      system: system,
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
    weatherOptions: weatherOptions, ROOF_JOBS: ROOF_JOBS, SHEET_JOBS: SHEET_JOBS,
    sidesOf: function (h) { return ((Array.isArray(h.walls) && h.walls.length && wallSidesFor(h)) || sidesFor(h)).sides; },
    SYS: SYS, SYSTEMS: SYSTEMS, SYSTEM_KEYS: SYSTEM_KEYS, PARTS: PARTS, DEFAULT_PRICING: DEFAULT_PRICING, STATUSES: STATUSES,
    ROOF_TYPES: ROOF_TYPES, JOB_TYPES: JOB_TYPES, EAVE_BY_FLOORS: EAVE_BY_FLOORS,
    estimate: estimate, quote: quote, earliestStart: earliestStart,
    toISODate: toISODate, fromISODate: fromISODate, makeRef: makeRef
  };
})();
if (typeof module !== "undefined") module.exports = Engine;
