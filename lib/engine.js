// Telinekiito estimating engine: house -> scaffold sides -> parts list -> price.
// Plain script (no modules) so the same file is inlined into the page and tested in Node.
var Engine = (function () {
  // Geometry shared by both systems: 2.00 m lifts, base jacks set about 0.4 m, scaffold runs 1 m past outer corners.
  // A 1.00 m compensation frame at the bottom (Layher Ausgleichsrahmen 1714.101; MonZon 1.00 m standards) moves the
  // decks by 1 m, so a deck can always be set within the heights the rules below allow.
  var SYS = { bay: 3.07, width: 0.73, lift: 2.0, jack: 0.4, extend: 1.0, half: 1.0, gap: 0.3 };

  /*
   * Roof-edge protection (roof-catch scaffold, "Dachfanggerüst"). Layher's assembly instruction (AuV §17) refers to
   * DIN 4420-1 and MonZon gives no rules of its own, so both follow DIN 4420-1: the deck at most 1.50 m below the
   * eave, the catch wall at least b = 0.70 m out from the eave edge and reaching at least 1.50 − b above it.
   * The building model has no eave overhang: we assume 0.5 m (the crew checks it on site). A 0.73 m frame 0.3 m from
   * the wall leaves only b = 0.53 m, so the catch wall (2.00 m posts, Layher 1748.003) stands on an outer 0.36 m
   * console: b = 0.89 m.
   */
  // Roof-catch is for roofs over 22.5° up to 60° (BG BAU B 121); on flatter roofs the edge protection is side
  // protection at least 1.0 m above the eave edge. Steeper than 60° is outside the rules (lib/checks.js). Where a
  // roof-catch ends without a neighbouring scaffold it runs 2.0 m past the roof edge (the eave overhang): the lateral
  // overlap of Austrian BauV §88 (4), the strictest rule we found.
  var CATCH = { maxBelow: 1.5, minB: 0.7, reach: 1.5, wall: 2.0, overhang: 0.5, console: 0.36, flatPitch: 22.5, flatReach: 1.0, maxPitch: 60, lateral: 2.0 };
  // Under a temporary roof the standards rise past the eave, so the scaffold stands clear of the overhang (0.6 m out)
  // and 0.36 m inner consoles keep each working deck within 0.3 m of the wall. Its outer face is then b = 0.83 m out.
  var RAISED_GAP = CATCH.overhang + 0.1;
  function catchB(raised) { return raised ? RAISED_GAP + SYS.width - CATCH.overhang : SYS.gap + SYS.width + CATCH.console - CATCH.overhang; }
  /** How far the catch wall must reach above the eave: 1.5 − b, and at least 1.0 m on roofs of 20° or less. */
  function catchNeed(raised, pitch) {
    var need = CATCH.reach - catchB(raised);
    return pitch != null && pitch <= CATCH.flatPitch ? Math.max(need, CATCH.flatReach) : need;
  }
  /** Lowest deck height that satisfies the roof-edge rules at this eave. */
  function eaveTarget(eave, catchOn, raised, pitch) {
    var t = eave - CATCH.maxBelow;
    return catchOn ? Math.max(t, eave + catchNeed(raised, pitch) - CATCH.wall) : t;
  }
  /** The lowest top deck at or above a height: 2.00 m lifts on 0.4 m base jacks, with or without the 1.00 m frame. */
  function deckFor(target) {
    var a = Math.max(1, Math.ceil((target - SYS.jack) / SYS.lift - 1e-9));
    var b = Math.max(1, Math.ceil((target - SYS.jack - SYS.half) / SYS.lift - 1e-9));
    var ha = SYS.jack + SYS.lift * a, hb = SYS.jack + SYS.half + SYS.lift * b;
    return hb < ha - 1e-9 ? { lifts: b, half: 1, deckH: hb } : { lifts: a, half: 0, deckH: ha };
  }
  /**
   * The frame grid for sides that carry a temporary roof: the roof needs one level height all round, at least `need`.
   * Of the two grids (with or without the 1.00 m frame) take the one where most sides still get a working deck inside
   * their rules (eave sides: from their target up to 0.2 m under the eave), then the lower one.
   */
  function roofGrid(need, sides) {
    var best = null;
    [0, 1].forEach(function (half) {
      var lifts = Math.max(1, Math.ceil((need - SYS.jack - half * SYS.half) / SYS.lift - 1e-9)), g = { lifts: lifts, half: half };
      g.deckH = deckHeight(g, lifts);
      g.fit = sides.filter(function (s) { return workLevel(g, s) != null; }).length;
      if (!best || g.fit > best.fit || (g.fit === best.fit && g.deckH < best.deckH)) best = g;
    });
    return best;
  }
  /** Lowest level of grid g that meets a side's work target and stays under its eave; null if none. */
  function workLevel(g, s) {
    var t = s.catchOn ? Math.max(s.target || 0, eaveTarget(s.eave || 0, true, true, s.pitch)) : s.target || 0;
    var upper = s.kind === "eaves" && s.eave ? s.eave - 0.2 : Infinity;
    for (var l = 1; l <= g.lifts; l++) { var z = deckHeight(g, l); if (z >= t - 1e-9) return z <= upper + 1e-9 ? l : null; }
    return null;
  }
  function deckHeight(s, l) { return SYS.jack + (s.half ? SYS.half : 0) + SYS.lift * l; }

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
    { key: "frames1", system: "layher", name: "Aluminium compensation frame 1.00 × 0.73 m (1714.101)", kg: 5.2 },
    { key: "consoles", system: "layher", name: "Console 0.36 m (1745.319)", kg: 3.5 },
    { key: "baseJacks", system: "layher", name: "Base jack 0.6 m", kg: 3.8 },
    { key: "decks", system: "layher", name: "Deck 3.07 × 0.32 m", kg: 12.5 },
    { key: "hatchDecks", system: "layher", name: "Access deck with hatch and ladder 3.07 m", kg: 28 },
    { key: "guardrails", system: "layher", name: "Double guardrail 3.07 m, aluminium (1732.307)", kg: 6.7 },
    { key: "toeBoards", system: "layher", name: "Toe board 3.07 m (1757.307)", kg: 6.8 },
    { key: "endGuards", system: "layher", name: "Double end guardrail 0.73 m (1728.719)", kg: 4.4 },
    { key: "endToeBoards", system: "layher", name: "End toe board 0.73 m (1757.073)", kg: 1.8 },
    { key: "diagonals", system: "layher", name: "Diagonal brace 3.07 × 2.00 m (1736.307)", kg: 8.3 },
    { key: "hBraces", system: "layher", name: "Horizontal brace 3.07 m at the foot of each braced bay (1727.307)", kg: 10.4 },
    { key: "startLedgers", system: "layher", name: "U-start ledger 0.73 m, deck for the lowest ladder (1751.073)", kg: 3.8 },
    { key: "ladders", system: "layher", name: "Ladder T15 2.15 m from the ground to the 1 m level (4008.007)", kg: 7.6 },
    { key: "tubes", system: "layher", name: "Scaffold tube 3.5 m, steel, bracing the 1 m frames", kg: 12.5 },
    { key: "couplers", system: "layher", name: "Swivel coupler", kg: 1.5 },
    { key: "topPosts", system: "layher", name: "Top guardrail post 1.0 m", kg: 2.6 },
    { key: "catchPosts", system: "layher", name: "Protective grid post 2.00 m (1748.003)", kg: 12.1 },
    { key: "catchMesh", system: "layher", name: "Side protection grid 3.07 m (two per bay)", kg: 14 },
    { key: "anchors", system: "layher", name: "Wall anchor with eye bolt", kg: 1.6 },

    { key: "mz_baseJacks", system: "monzon", name: "Base jack 0.60 m (111.060)", kg: 3.5 },
    { key: "mz_baseCollars", system: "monzon", name: "Base collar 0.43 m (201.000)", kg: 2.3 },
    { key: "mz_standards", system: "monzon", name: "Standard 2.00 m, aluminium (240.200)", kg: 4.1 },
    { key: "mz_standards1", system: "monzon", name: "Standard 1.00 m, aluminium (240.100)", kg: 2.2 },
    { key: "mz_brackets", system: "monzon", name: "U-bracket 0.36 m (250.037)", kg: 1.5 },
    { key: "mz_stairs1", system: "monzon", name: "U-staircase 1.30 × 1.00 m up the 1 m base lift (400.100)", kg: 12.7 },
    { key: "mz_tubes", system: "monzon", name: "Scaffold tube 3.5 m, steel, bracing the 1 m lift", kg: 12.5 },
    { key: "mz_couplers", system: "monzon", name: "Swivel coupler", kg: 1.5 },
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
    { key: "mz_anchors", system: "monzon", name: "Wall tie 0.50 m with eyebolt (112.050 + 112.120), V ties as two", kg: 2.3 }
  ];

  /**
   * Parts for one side, by system. n = frame lines, Lf = lifts, D = decked levels. s.half: 1.00 m frame at the bottom;
   * s.inner: 0.36 m inner console and deck on every decked level; s.catchOn with s.catchConsole: catch wall on an
   * outer 0.36 m console at the top deck (otherwise the grids hang on the frames' outer standards).
   */
  function sideParts(sys, s, bays, n, Lf, D) {
    // s.innerRail: guardrail on the inside of the top deck (above the eave there is no wall within 0.3 m), so no
    // inner console there.
    var hf = s.half ? 1 : 0, rail = s.innerRail ? 1 : 0, innerLv = s.inner ? Math.max(0, D - rail) : 0;
    var cons = (s.catchOn && s.catchConsole ? n : 0) + n * innerLv;
    var consDecks = (s.catchOn && s.catchConsole ? bays : 0) + bays * innerLv;
    var posts = s.catchOn && s.catchConsole;
    // At the roof-catch level the catch wall is the side protection: no guardrails there.
    var cL = s.catchOn ? 1 : 0, fields = Math.ceil(bays / 5);
    // Access bay: the lowest ladder needs a deck to stand on (Layher catalogue p. 16: on U-start ledgers). Over a
    // 1 m base lift the hatch ladders start on a deck on the 1 m frames, reached by a ladder (Layher) or a 1 m
    // staircase (MonZon) from the ground. The 1 m frames are braced with tubes and couplers (Layher AuV step 9).
    var acc = s.accessN != null ? s.accessN : 1, accessDecks = 2 * acc;
    // Consoles, roof-catch and a temporary roof load the scaffold more: the anchor grid is densified to every
    // standard line every 2 m (Layher AuV p. 19; MonZon ties every 2 m instead of 4 m).
    var dense = Boolean(s.catchOn || s.inner || cons);
    if (sys.key === "monzon") {
      // Modular: two standards per frame line on every lift, transoms on every lift and at the base, ledgers along
      // the base (inside and out), along the inside of every lift, and outside where no double guardrail is fitted.
      return {
        mz_baseJacks: n * 2,
        mz_baseCollars: n * 2,
        mz_standards: n * 2 * Lf,
        mz_standards1: n * 2 * hf,
        mz_brackets: cons,
        mz_transoms: n * (Lf + 1 + hf),
        mz_ledgers: bays * 2 + bays * (Lf + hf) + bays * (Lf + hf - (D - cL)),
        mz_decks: Math.max(0, D * bays * 2 - 2 * D * acc) + consDecks + accessDecks,
        mz_accessDecks: Lf * acc,
        mz_stairs1: hf * acc,
        mz_tubes: hf * fields,
        mz_couplers: hf * fields * 2,
        mz_guardrails: bays * (D - cL) + bays * rail,
        mz_endGuards: 2 * D,
        mz_toeBoards: bays * D,
        mz_endToeBoards: 2 * D,
        mz_braces: Lf * Math.ceil(bays / 5),
        mz_topPosts: (posts ? 0 : n) + n * rail,
        mz_catchPosts: posts ? n : 0,
        mz_catchMesh: s.catchOn ? bays : 0,
        // Ties on every inner standard every 4 m and under the top transoms (every 2 m when dense), plus the second
        // tie of a V tie on every 5th pair of standards and always in the end bays (instruction v2.1, p. 28).
        mz_anchors: (n + Math.min(n, 2 + Math.floor((n - 1) / 5))) * (dense ? Math.max(1, Lf) : Math.max(1, Math.ceil(Lf / 2)))
      };
    }
    return {
      // A catch level on consoles is closed at both ends with frames (Layher catalogue p. 28).
      frames: n * Lf + (posts ? 2 : 0),
      frames1: n * hf,
      consoles: cons,
      baseJacks: n * 2,
      decks: Math.max(0, D * bays * 2 - 2 * D * acc) + consDecks + accessDecks,
      hatchDecks: Lf * acc,
      startLedgers: hf ? 0 : 2 * acc,
      ladders: hf * acc,
      tubes: hf * fields,
      couplers: hf * fields * 2,
      guardrails: bays * (D - cL) + bays * rail,
      toeBoards: bays * D,
      endGuards: 2 * (D - (posts ? 1 : 0)),
      endToeBoards: 2 * D,
      // A diagonal for at most five bays on every lift, and a horizontal brace at the foot of each braced bay (AuV p. 11).
      diagonals: Lf * fields,
      hBraces: fields,
      topPosts: (posts ? 0 : n) + n * rail,
      catchPosts: posts ? n : 0,
      // Layher: two side protection grids per bay (catalogue p. 28).
      catchMesh: s.catchOn ? 2 * bays : 0,
      // Layher Blitz AuV p. 14: one level – anchor every second frame; one level with roof-catch – every frame.
      anchors: Lf === 1 ? (s.catchOn ? n : Math.ceil(n / 2)) : dense ? n * Lf : Math.ceil(n / 2) * Lf
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


  function sidesFor(h) {
    var L = h.length, W = h.width;
    var rise = h.roofType === "flat" ? 0 : (W / 2) * Math.tan((h.pitch * Math.PI) / 180);
    var ridge = h.eave + rise;
    // Work deck targets: eave sides within 1.50 m of the eave (higher with roof-catch, see eaveTarget); gables reach
    // the ridge from 2.00 m below it.
    var eaveLifts = h.eave - CATCH.maxBelow;
    var gableLifts = h.roofType === "gable" ? Math.max(eaveLifts, ridge - 2.0) : eaveLifts;
    var sides = [];
    function add(name, len, target, catchOn, deckAll, kind) {
      var t = catchOn ? Math.max(target, eaveTarget(h.eave, true, false, h.pitch)) : target, d = deckFor(t);
      sides.push({ name: name, len: len, lifts: d.lifts, half: d.half, target: t, eave: h.eave, pitch: h.pitch, catchOn: catchOn, catchConsole: catchOn, deckAll: deckAll, kind: kind });
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
    // Around the box: front (Long side A) → right (… B) → back (Long side B) → left (… A); every corner is outer.
    var role = function (n) { return /^Long side A/.test(n) ? 0 : /^Long side B/.test(n) ? 2 : / A$/.test(n) ? 3 : 1; };
    var at = {};
    sides.forEach(function (x) { at[role(x.name)] = x.name; });
    sides.forEach(function (x) {
      var r = role(x.name);
      x.c0 = x.c1 = "outer";
      x.n0 = at[(r + 3) % 4] || null;
      x.n1 = at[(r + 1) % 4] || null;
      x.through = r % 2 === 0; // long sides run through at corners when nothing else decides
    });
    return { sides: sides, ridge: ridge, rise: rise };
  }

  /**
   * Sides from measured walls (the 3D building model): h.walls lists the walls around the outline in order, each
   * { edge, len, eave, top, gable, ext } in metres. ext is how many of its ends are outer corners, where the scaffold
   * runs 1 m past (inner corners and height steps along one wall need none). A step in the facade (a short wall
   * between two corners) is a short side of its own that runs through both corners (see resolveEnds); only scraps
   * under 0.5 m (model noise) are merged into the piece before them on the same wall, or dropped. Job rules are the same as for the rectangle. The scaffold area uses the real
   * run length (crews mix shorter bays on broken walls); the parts list still rounds up to whole 3.07 m bays.
   */
  var MIN_WALL = 0.5;
  function wallSidesFor(h) {
    var along = {}; // where each piece starts along its outline edge (pieces of one edge follow each other)
    var N = h.walls.length;
    var ws = h.walls.map(function (w, i) {
      var prev = h.walls[(i - 1 + N) % N], next = h.walls[(i + 1) % N];
      var t0 = along[w.edge] || 0;
      along[w.edge] = t0 + w.len;
      var first = !prev || prev.edge !== w.edge || N === 1, last = !next || next.edge !== w.edge || N === 1;
      var ext = w.ext != null ? w.ext : (first ? 1 : 0) + (last ? 1 : 0);
      var e0 = w.e0 != null ? w.e0 : first && ext > 0 ? 1 : 0, e1 = w.e1 != null ? w.e1 : Math.max(0, ext - e0);
      return {
        edge: w.edge, t0: t0, e0: e0, len: w.len, eave: w.eave, top: Math.max(w.top, w.eave),
        gable: w.gable != null ? Boolean(w.gable) : w.top - w.eave > 1.0,
        // What each end meets: an outer corner, an inner corner, or the next piece of the same wall (height step).
        c0: first ? (e0 ? "outer" : "inner") : "joint", c1: last ? (e1 ? "outer" : "inner") : "joint"
      };
    });
    var kept = [];
    ws.forEach(function (w, i) {
      if (w.len >= MIN_WALL) kept.push(w);
      else if (kept.length && kept[kept.length - 1].edge === w.edge) { kept[kept.length - 1].len += w.len; kept[kept.length - 1].c1 = w.c1; }
      else if (ws[i + 1] && ws[i + 1].edge === w.edge) { ws[i + 1].len += w.len; ws[i + 1].t0 = w.t0; ws[i + 1].c0 = w.c0; }
    });
    if (!kept.length) return null;
    var sides = [], ridge = 0;
    var job = h.jobType, deck = job === "facade" || job === "roof_facade";
    var made = kept.map(function () { return null; });
    kept.forEach(function (w, i) {
      ridge = Math.max(ridge, w.top);
      if (w.gable && (job === "gutters" || (job === "roof" && !h.gables))) return;
      made[i] = sides.length;
      var catchOn = !w.gable && (job === "roof" || job === "roof_facade");
      var t = w.gable ? Math.max(w.eave - CATCH.maxBelow, w.top - 2.0) : eaveTarget(w.eave, catchOn, false, h.pitch), d = deckFor(t);
      sides.push({
        name: (w.gable ? "Gable end " : "Wall ") + (sides.length + 1), len: Math.round(w.len * 100) / 100, lifts: d.lifts, half: d.half,
        target: t, eave: w.eave, pitch: h.pitch, catchOn: catchOn, catchConsole: catchOn, deckAll: deck, kind: w.gable ? "gable" : "eaves", exact: true,
        edge: w.edge, t0: w.t0, e0: w.e0, c0: w.c0, c1: w.c1
      });
    });
    if (!sides.length) return null;
    // Neighbours round the outline (a wall left unscaffolded leaves a free end).
    var K = kept.length;
    kept.forEach(function (w, i) {
      if (made[i] == null) return;
      var a = K > 1 ? made[(i - 1 + K) % K] : null, b = K > 1 ? made[(i + 1) % K] : null;
      sides[made[i]].n0 = a != null && a !== made[i] ? sides[a].name : null;
      sides[made[i]].n1 = b != null && b !== made[i] ? sides[b].name : null;
    });
    return { sides: sides, ridge: ridge, rise: 0 };
  }

  /**
   * Where each side ends (ext0/ext1, metres past its wall's ends; negative = stops short). Scaffolds can't share a
   * corner: at an outer corner one side runs through past the corner to the other's outer edge and the other runs
   * just past its wall end up to the through side's inner edge; at an inner corner one runs up to the other wall's
   * gap and the other stops at its outer edge. The roof-catch side
   * runs through (its protection must not break at the corner), else the taller, else the long side / the side
   * ending there. A free end runs 1 m past the corner, a roof-catch 2 m past the eave overhang.
   * areaExt0/1: the pricing length, measured the usual way to 1 m past outer corners and free ends.
   */
  function resolveEnds(sides) {
    var by = {};
    sides.forEach(function (x) { by[x.name] = x; });
    var W = function (x) { return (x.gap || SYS.gap) + SYS.width; };
    var top = function (x) { return deckHeight(x, x.lifts); };
    function through(a, ka, b) {
      if (Boolean(a.short) !== Boolean(b.short)) return a.short ? a : b;
      if (Boolean(a.catchOn) !== Boolean(b.catchOn)) return a.catchOn ? a : b;
      if (Math.abs(top(a) - top(b)) > 0.01) return top(a) > top(b) ? a : b;
      if (a.through != null && a.through !== b.through) return a.through ? a : b;
      return ka === 1 ? a : b;
    }
    // A side too short to butt at both ends (a jog between two corners) runs through instead.
    for (var pass = 0; pass < 3; pass++) {
      sides.forEach(ends);
      var again = false;
      sides.forEach(function (x) { if (!x.short && x.len + x.ext0 + x.ext1 < MIN_RUN) { x.short = true; again = true; } });
      if (!again) break;
    }
    return sides;
    function ends(x) {
      [0, 1].forEach(function (k) {
        var c = x["c" + k], nb = x["n" + k] && by[x["n" + k]], e, ae;
        if (!c || c === "fixed") { e = 0; ae = 0; }
        else if (!nb) {
          var free = x.catchOn ? CATCH.overhang + CATCH.lateral : SYS.extend;
          e = c === "inner" ? -SYS.gap : free;
          ae = c === "inner" ? 0 : e;
        } else if (c === "joint") { e = 0; ae = 0; }
        else {
          var t = through(x, k, nb), other = t === x ? nb : x;
          // A butting side keeps 0.1 m clear of the through side (measured corners are seldom exactly square).
          if (c === "outer") e = t === x ? W(other) : (t.gap || SYS.gap) - CLEAR;
          else e = t === x ? -(other.gap || SYS.gap) : -W(t) - CLEAR;
          ae = c === "outer" ? SYS.extend : 0;
        }
        x["ext" + k] = e;
        x["areaExt" + k] = ae;
      });
    }
  }
  var MIN_RUN = 0.7, CLEAR = 0.1;

  /**
   * Access towers (hatch decks with ladders): one per connected scaffold, and one more for every 50 m of it (access
   * at most every 50 m, TRBS 2121-1). Sides joined at a corner with a deck at the same height are one scaffold; the
   * towers go on its longest sides. Roof supports are reached from the walls at the roof deck.
   */
  function accessTowers(sides) {
    var by = {}, heights = function (x) {
      var lv = x.deckLevels || (x.deckAll ? Array.from({ length: x.lifts }, function (_, k) { return k + 1; }) : [x.lifts]);
      return lv.map(function (l) { return Math.round(deckHeight(x, l) * 10); });
    };
    sides.forEach(function (x) { by[x.name] = x; x.accessN = 0; });
    var seen = {};
    sides.forEach(function (x) {
      if (seen[x.name]) return;
      var group = [], stack = [x];
      seen[x.name] = true;
      while (stack.length) {
        var y = stack.pop(), hy = heights(y);
        group.push(y);
        [y.n0, y.n1].forEach(function (nm) {
          var z = nm && by[nm];
          if (!z || seen[z.name]) return;
          if (heights(z).some(function (v) { return hy.indexOf(v) >= 0; })) { seen[z.name] = true; stack.push(z); }
        });
      }
      var walls = group.filter(function (y) { return y.kind !== "support"; });
      if (!walls.length) { if (!sides.some(function (y) { return y.kind !== "support"; })) group[0].accessN = 1; return; }
      var run = walls.reduce(function (m, y) { return m + y.len + (y.ext0 || 0) + (y.ext1 || 0); }, 0);
      var n = Math.max(1, Math.ceil(run / 50));
      walls.sort(function (p, q) { return q.len - p.len; });
      for (var i = 0; i < n; i++) walls[i % walls.length].accessN += 1;
    });
    return sides;
  }

  /**
   * Measured houses: a last check on the real outline. Each side's footprint (its run, from the wall gap to the outer
   * standards) is tested against every other; where two clash (wings, jogs, free ends, roof supports), the one that
   * matters less is shortened at that end to stay 0.1 m clear. Order: short jog > roof-catch > taller > others >
   * roof support. A roof support left shorter than 0.7 m isn't needed (the walls carry the roof there).
   */
  function unclash(sides, outline) {
    var area2 = 0;
    outline.forEach(function (p, i) { var q = outline[(i + 1) % outline.length]; area2 += p[0] * q[1] - q[0] * p[1]; });
    var sign = area2 > 0 ? 1 : -1;
    var lane = function (x) {
      var at, dir, out, a, b;
      if (x.geom) { at = x.geom.at; dir = x.geom.dir; out = x.geom.out; a = -(x.ext0 || 0); b = x.len + (x.ext1 || 0); }
      else {
        var p = outline[x.edge], q = outline[(x.edge + 1) % outline.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        at = p; dir = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; out = [dir[1] * sign, -dir[0] * sign];
        a = (x.t0 || 0) - x.ext0; b = (x.t0 || 0) + x.len + x.ext1;
      }
      var g = x.gap || SYS.gap, w = SYS.width;
      var P = function (t, k) { return [at[0] + dir[0] * t + out[0] * k, at[1] + dir[1] * t + out[1] * k]; };
      return { at: at, dir: dir, a: a, b: b, q: [P(a, g), P(b, g), P(b, g + w), P(a, g + w)] };
    };
    var hit = function (A, B) {
      var polys = [A, B];
      for (var m = 0; m < 2; m++) for (var i = 0; i < 4; i++) {
        var p = polys[m][i], q = polys[m][(i + 1) % 4], n = [q[1] - p[1], p[0] - q[0]], L = Math.hypot(n[0], n[1]) || 1;
        var pa = A.map(function (v) { return (v[0] * n[0] + v[1] * n[1]) / L; }), pb = B.map(function (v) { return (v[0] * n[0] + v[1] * n[1]) / L; });
        if (Math.max.apply(null, pa) - 0.02 <= Math.min.apply(null, pb) || Math.max.apply(null, pb) - 0.02 <= Math.min.apply(null, pa)) return false;
      }
      return true;
    };
    var rank = function (x) { return x.kind === "support" ? 0 : 1 + (x.short ? 8 : 0) + (x.catchOn ? 4 : 0) + deckHeight(x, x.lifts) / 100; };
    for (var it = 0; it < 3000; it++) {
      var L = sides.map(lane), done = true;
      for (var i = 0; i < sides.length && done; i++) for (var j = i + 1; j < sides.length && done; j++) {
        if (sides[i].gone || sides[j].gone || !hit(L[i].q, L[j].q)) continue;
        var lose = rank(sides[i]) < rank(sides[j]) ? i : rank(sides[i]) > rank(sides[j]) ? j : (sides[i].len < sides[j].len ? i : j);
        var win = lose === i ? j : i, l = L[lose];
        var proj = L[win].q.map(function (v) { return (v[0] - l.at[0]) * l.dir[0] + (v[1] - l.at[1]) * l.dir[1]; });
        var lo = Math.min.apply(null, proj), hi = Math.max.apply(null, proj), x = sides[lose];
        var cut0 = hi + CLEAR - l.a, cut1 = l.b - (lo - CLEAR);
        // Cut the end nearer the clash; a run that would drop under 0.7 m is covered by the scaffolds round it.
        if (l.b - l.a - Math.min(cut0, cut1) < MIN_RUN) x.gone = true;
        else if (cut0 < cut1) { x.ext0 -= cut0; x.cut = (x.cut || 0) + cut0; } else { x.ext1 -= cut1; x.cut = (x.cut || 0) + cut1; }
        done = false;
      }
      if (done) break;
    }
    // A run squeezed below 0.7 m is covered by the scaffolds round it (a short jog's face is worked from their corner
    // bays; a roof support there isn't needed): it gets no scaffold of its own.
    return sides.filter(function (x) { return !x.gone && x.len + x.ext0 + x.ext1 >= MIN_RUN; });
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
    // run: the scaffold as built (bays may not stretch past 3.07 m); runM: the length the price is measured on.
    var e0 = s.ext0 != null ? s.ext0 : SYS.extend, e1 = s.ext1 != null ? s.ext1 : SYS.extend;
    var a0 = s.areaExt0 != null ? s.areaExt0 : SYS.extend, a1 = s.areaExt1 != null ? s.areaExt1 : SYS.extend;
    var matRun = Math.max(0.5, s.len + e0 + e1), areaRun = Math.max(0.5, s.len + a0 + a1);
    var bays = s.fixedBays || Math.max(1, Math.ceil(matRun / sys.bay - 0.01));
    var run = s.fixedBays ? bays * sys.bay : matRun;
    var runM = s.fixedBays ? bays * sys.bay : s.exact ? areaRun : Math.max(1, Math.ceil(areaRun / sys.bay - 0.05)) * sys.bay;
    var n = bays + 1, Lf = s.lifts;
    // Decked levels (1 = lowest lift): every level for facade work, otherwise the top one. A side raised to carry
    // a temporary roof keeps its working decks and gets one more on top for putting the roof up.
    var levels = s.deckLevels || (s.deckAll ? Array.from({ length: Lf }, function (_, k) { return k + 1; }) : [Lf]);
    // Work on the walls (facade jobs) needs a walking platform on every level, the top of a 1 m base frame included.
    var halfDeck = Boolean(s.half && s.deckAll);
    var D = levels.length + (halfDeck ? 1 : 0);
    var deckH = deckHeight(s, Lf);
    var workH = deckH + 2;
    var area = runM * workH;
    var parts = sideParts(sys, s, bays, n, Lf, D);
    return {
      name: s.name, kind: s.kind, len: s.len, lifts: Lf, half: s.half ? 1 : 0, catchOn: s.catchOn, deckAll: s.deckAll,
      cut: s.cut ? Math.round(s.cut * 100) / 100 : 0, accessN: s.accessN != null ? s.accessN : 1, gap: s.gap || SYS.gap, inner: Boolean(s.inner), innerRail: Boolean(s.innerRail), pitch: s.pitch, catchConsole: Boolean(s.catchOn && s.catchConsole), catchLevel: s.catchOn ? s.catchLevel || Lf : null, eave: s.eave,
      bays: bays, run: run, runM: runM, ext0: e0, ext1: e1, deckH: deckH, halfDeck: halfDeck, decked: D, workH: workH, area: area, parts: parts, deckLevels: levels,
      // Where the side stands (for drawings): outline edge, start along it, overhang before the start.
      edge: s.edge, t0: s.t0, geom: s.geom
    };
  }

  function estimate(h) {
    var sys = systemOf(h.system);
    var w = weatherOptions(h);
    var wallGeo = Array.isArray(h.walls) && h.walls.length ? wallSidesFor(h) : null;
    var geo = wallGeo || sidesFor(h);
    // A temporary roof needs a rectangular scaffold under its edges: on a measured L- or T-shaped house the
    // scaffold goes round the whole house as a rectangle (length × width), and the roof clears the real ridge.
    var outline = h.shape && Array.isArray(h.shape.outline) && h.shape.outline.length > 2 ? h.shape.outline : null;
    // Without the outline (older orders) a measured house under a temporary roof falls back to a plain rectangle.
    var aroundHouse = Boolean(w.weatherRoof && wallGeo && !outline);
    if (aroundHouse) { geo = sidesFor(h); geo.ridge = Math.max(geo.ridge, wallGeo.ridge); }
    var raw = applyAdjust(geo.sides, h.adjust);
    var rect = w.weatherRoof && wallGeo && outline ? minRect(outline) : null;
    // The roof rests level on every side that carries it: high enough to clear the ridge and their working decks.
    // On a measured house only the walls on the roof's edge carry it; scaffolds inside its outline must stay clear
    // of the trusses above them (the roof goes up if one doesn't).
    var carriers = rect ? raw.filter(function (s) { return onRoofEdge(rect, outline, s); }) : raw;
    if (!carriers.length) carriers = raw;
    var dims = rect ? { length: rect.len, width: rect.wid } : h;
    var roof = w.weatherRoof ? weatherRoof(dims, sys, geo.ridge, carriers) : null;
    if (roof && rect) {
      var inside = raw.filter(function (s) { return carriers.indexOf(s) < 0; });
      var low = interiorDeck(rect, outline, inside, sys.key === "layher" ? LROOF.depth : ROOF.depth);
      if (low > roof.support + 1e-9) roof = weatherRoof(dims, sys, geo.ridge, carriers, low);
    }
    if (roof && rect) {
      // Measured L/T house: the work scaffold follows the walls (at most 0.3 m from the wall, as the assembly
      // instructions require). Walls on the roof's edge carry the roof, so their scaffold goes up; where the roof's
      // edge crosses open ground (inner corners), a support scaffold with a deck only on top carries it.
      var sup = roofSupport(rect, outline, raw, roof);
      raw = sup.sides.concat(sup.extra);
    } else if (roof) {
      raw = raw.map(function (s) { return raiseSide(s, roof); });
    }
    raw = resolveEnds(raw);
    // A wall with no room for a scaffold of its own (a niche narrower than a run) is worked from its neighbours.
    var fits = raw.filter(function (s) { return s.len + s.ext0 + s.ext1 >= MIN_RUN; });
    if (fits.length && fits.length < raw.length) raw = resolveEnds(fits);
    if (wallGeo && outline && !aroundHouse) raw = unclash(raw, outline);
    var sides = accessTowers(raw).map(function (s) { return sideCalc(s, sys); });
    var parts = {};
    PARTS.forEach(function (p) { if (p.system === sys.key) parts[p.key] = 0; });
    var sheetM2 = 0;
    if (w.sheeting) {
      sides.forEach(function (s) {
        sheetM2 += s.run * Math.max(s.deckH + 1, s.catchOn ? deckHeight(s, s.catchLevel || s.lifts) + CATCH.wall : 0);
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
      if (s.catchOn) catchRunM += s.run;
      // Facade work: decked levels above the first add decks, guardrails and toe boards.
      if (s.deckAll && s.decked > 1) extraLevelM += s.runM * (s.decked - 1);
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
  /** Smallest rectangle round a polygon [[x, y], …]: centre, unit direction of its long side, length, width. */
  function minRect(pts) {
    var best = null;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), sn = Math.sin(ang);
      var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      pts.forEach(function (p) { var x = p[0] * c + p[1] * sn, y = -p[0] * sn + p[1] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      var area = (x1 - x0) * (y1 - y0);
      if (!best || area < best.area) best = { area: area, ang: ang, c: c, s: sn, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    }
    var long = best.w >= best.h, ang2 = long ? best.ang : best.ang + Math.PI / 2;
    return {
      cx: best.x * best.c - best.y * best.s, cy: best.x * best.s + best.y * best.c,
      dir: [Math.cos(ang2), Math.sin(ang2)], len: long ? best.w : best.h, wid: long ? best.h : best.w
    };
  }

  /**
   * A side that carries the temporary roof: it goes up to the roof's deck on the roof's frame grid, stands 0.6 m out
   * with 0.36 m inner consoles, keeps its working deck(s) (the lowest level that meets its work target; facade work:
   * every level up to it) and gets a deck on top for putting the roof up. Roof-catch stays where there is roof work:
   * the grids hang on the outer standards from the working deck up 2 m.
   */
  function raiseSide(s, roof) {
    var o = {};
    for (var k in s) o[k] = s[k];
    o.lifts = roof.lifts;
    o.half = roof.half;
    o.gap = RAISED_GAP;
    o.inner = true;
    o.catchConsole = false;
    // If the roof's grid leaves no deck inside the rules (eaves of different heights), the highest under the eave.
    var work = workLevel(o, s);
    if (work == null) { work = 1; for (var l = 1; l <= o.lifts; l++) if (deckHeight(o, l) <= (s.eave || Infinity) - 0.2) work = l; }
    var levels = s.deckAll ? Array.from({ length: work }, function (_, k) { return k + 1; }) : [work];
    if (levels.indexOf(o.lifts) < 0) levels.push(o.lifts);
    o.deckLevels = levels;
    o.catchLevel = s.catchOn ? work : null;
    // Above the eave there is no wall within 0.3 m of the top deck: guardrail on its inside instead of a console.
    o.innerRail = deckHeight(o, o.lifts) > (s.eave || 0) - 0.2;
    // The office's own deck choice on a side still applies to its working levels only.
    return o;
  }

  /**
   * Under a temporary roof on a measured house: which wall sides lie on the roof's edge (raised to carry it) and
   * the extra support scaffold where the edge has no wall under it. Positions are in outline coordinates.
   */
  /** A side's wall ends in the roof rectangle's own axes (u along the ridge, v across), or null for other sides. */
  function rectUV(rect, outline, s) {
    if (s.edge == null) return null;
    var d = rect.dir, n = [-d[1], d[0]];
    var uv = function (p) { var x = p[0] - rect.cx, y = p[1] - rect.cy; return [x * d[0] + y * d[1], x * n[0] + y * n[1]]; };
    var p = outline[s.edge], q = outline[(s.edge + 1) % outline.length];
    var L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    var p0 = [p[0] + ((q[0] - p[0]) * (s.t0 || 0)) / L, p[1] + ((q[1] - p[1]) * (s.t0 || 0)) / L];
    var p1 = [p0[0] + ((q[0] - p[0]) * s.len) / L, p0[1] + ((q[1] - p[1]) * s.len) / L];
    return [uv(p0), uv(p1)];
  }
  /** Does this wall lie on the roof rectangle's edge (so its scaffold carries the roof)? */
  function onRoofEdge(rect, outline, s) {
    var AB = rectUV(rect, outline, s), a = rect.len / 2, b = rect.wid / 2, tol = 0.6;
    if (!AB) return false;
    return [[1, -b], [0, a], [1, b], [0, -a]].some(function (e) { return Math.abs(AB[0][e[0]] - e[1]) < tol && Math.abs(AB[1][e[0]] - e[1]) < tol; });
  }
  /**
   * The lowest roof deck that keeps the scaffolds inside the roof outline 0.2 m under the trusses: their top
   * (guardrail, or roof-catch wall) against the truss underside, which rises from the roof's long edges.
   */
  function interiorDeck(rect, outline, inside, depth) {
    var b = rect.wid / 2, t = Math.tan((18 * Math.PI) / 180), need = 0;
    inside.forEach(function (s) {
      var AB = rectUV(rect, outline, s);
      if (!AB) return;
      var top = Math.max(deckHeight(s, s.lifts) + 1, s.catchOn ? deckHeight(s, s.catchLevel || s.lifts) + CATCH.wall : 0);
      var dist = Math.max(0, b - Math.max(Math.abs(AB[0][1]), Math.abs(AB[1][1])) - (SYS.gap + SYS.width));
      need = Math.max(need, top + 0.2 - 1.0 + depth - dist * t);
    });
    return need;
  }

  function roofSupport(rect, outline, raw, roof) {
    var d = rect.dir, n = [-d[1], d[0]], a = rect.len / 2, b = rect.wid / 2, tol = 0.6;
    var uv = function (p) { var x = p[0] - rect.cx, y = p[1] - rect.cy; return [x * d[0] + y * d[1], x * n[0] + y * n[1]]; };
    // The four roof edges: fixed coordinate (axis 1 = v, axis 0 = u), its value, and the range along it.
    var edges = [
      { axis: 1, at: -b, from: -a, to: a }, { axis: 0, at: a, from: -b, to: b },
      { axis: 1, at: b, from: -a, to: a }, { axis: 0, at: -a, from: -b, to: b }
    ].map(function (e) { e.covered = []; return e; });
    var sides = raw.map(function (s) {
      var o = {};
      for (var k in s) o[k] = s[k];
      if (s.edge == null) return o;
      var p = outline[s.edge], q = outline[(s.edge + 1) % outline.length];
      var L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      var p0 = [p[0] + ((q[0] - p[0]) * (s.t0 || 0)) / L, p[1] + ((q[1] - p[1]) * (s.t0 || 0)) / L];
      var p1 = [p0[0] + ((q[0] - p[0]) * s.len) / L, p0[1] + ((q[1] - p[1]) * s.len) / L];
      var A = uv(p0), B = uv(p1);
      edges.forEach(function (e) {
        if (o.onRoofEdge) return;
        if (Math.abs(A[e.axis] - e.at) < tol && Math.abs(B[e.axis] - e.at) < tol) {
          var RW = RAISED_GAP + SYS.width, ea = s.c0 === "outer" ? RW : 0, eb = s.c1 === "outer" ? RW : 0;
          var ua = A[1 - e.axis], ub = B[1 - e.axis];
          e.covered.push(ua <= ub ? [ua - ea, ub + eb] : [ub - eb, ua + ea]);
          o.onRoofEdge = true;
        }
      });
      return o.onRoofEdge ? raiseSide(o, roof) : o;
    });
    var extra = [];
    edges.forEach(function (e) {
      // Gaps along the edge that no raised wall scaffold covers.
      var cov = e.covered.sort(function (x, y) { return x[0] - y[0]; }), gaps = [], at = e.from;
      cov.forEach(function (c) { if (c[0] > at) gaps.push([at, c[0]]); at = Math.max(at, c[1]); });
      if (at < e.to) gaps.push([at, e.to]);
      gaps.forEach(function (g) {
        var len = g[1] - g[0];
        if (len < 0.8) return;
        // Back from (u, v) to outline coordinates; outward is away from the rectangle's centre.
        var P = function (t) { var u = e.axis === 1 ? t : e.at, v = e.axis === 1 ? e.at : t; return [rect.cx + u * d[0] + v * n[0], rect.cy + u * d[1] + v * n[1]]; };
        var a0 = P(g[0]), a1 = P(g[1]);
        var dir = [(a1[0] - a0[0]) / len, (a1[1] - a0[1]) / len];
        var out = e.axis === 1 ? [n[0] * Math.sign(e.at), n[1] * Math.sign(e.at)] : [d[0] * Math.sign(e.at), d[1] * Math.sign(e.at)];
        extra.push({
          name: "Roof support " + (extra.length + 1), kind: "support", len: Math.round(len * 100) / 100, lifts: roof.lifts, half: roof.half,
          deckLevels: [roof.lifts], catchOn: false, deckAll: false, c0: "fixed", c1: "fixed", exact: true, gap: RAISED_GAP, innerRail: true,
          geom: { at: a0, dir: dir, out: out }
        });
      });
    });
    return { sides: sides, extra: extra };
  }

  function weatherRoof(h, sys, ridge, sides, minDeck) {
    return sys.key === "layher" ? layherRoof(h, sys, ridge, sides, minDeck) : monzonRoof(h, sys, ridge, sides, minDeck);
  }

  function layherRoof(h, sys, ridge, sides, minDeck) {
    var R = LROOF, off = 2 * (RAISED_GAP + sys.width);
    var span = h.width + off, length = h.length + off;
    var rad = (R.pitch * Math.PI) / 180, t = Math.tan(rad);
    var support = ridge + R.clear + R.depth - (span / 2) * t;
    // The roof supports stand on the top standards, about 1 m above the top deck; the deck also clears every working deck.
    var top = Math.max.apply(null, (sides || []).map(function (s) { return deckHeight(s, s.lifts); }).concat([0]));
    // The truss underside must also clear the house's eaves (at the tip of a 0.5 m overhang) by 0.2 m.
    var eaveDeck = Math.max.apply(null, (sides || []).filter(function (x) { return x.eave; }).map(function (x) { return x.eave + 0.2 + R.depth - 1.0 - (RAISED_GAP + sys.width - CATCH.overhang) * t; }).concat([0]));
    var dk = roofGrid(Math.max(support - 1.0, top, minDeck || 0, eaveDeck), sides || []), lifts = dk.lifts;
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
      support: Math.round(dk.deckH * 100) / 100, lifts: lifts, half: dk.half, sections: sections, tarpWidth: tarpLen,
      planM2: Math.round(span * sections * R.section), parts: parts, tarpKg: Math.round(0.65 * (sections * R.section * tarpLen + 2 * gable))
    };
  }

  function monzonRoof(h, sys, ridge, sides, minDeck) {
    var off = 2 * (RAISED_GAP + sys.width);
    var span = h.width + off, length = h.length + off;
    var t = Math.tan((ROOF.pitch * Math.PI) / 180);
    // Deck level the trusses sit on: their underside at mid-span must clear the ridge.
    var support = ridge + ROOF.clear + ROOF.depth - (span / 2) * t;
    // The roof supports stand on the top standards, about 1 m above the top deck; the deck also clears every working deck.
    var top = Math.max.apply(null, (sides || []).map(function (s) { return deckHeight(s, s.lifts); }).concat([0]));
    var eaveDeck = Math.max.apply(null, (sides || []).filter(function (x) { return x.eave; }).map(function (x) { return x.eave + 0.2 + ROOF.depth - 1.0 - (RAISED_GAP + sys.width - CATCH.overhang) * t; }).concat([0]));
    var dk = roofGrid(Math.max(support - 1.0, top, minDeck || 0, eaveDeck), sides || []), lifts = dk.lifts;
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
      support: Math.round(dk.deckH * 100) / 100, lifts: lifts, half: dk.half, sections: sections, tarpWidth: tarp[0],
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
    minRect: minRect, CATCH: CATCH, catchNeed: catchNeed, RAISED_GAP: RAISED_GAP, catchB: catchB, deckFor: deckFor,
    sidesOf: function (h) { return ((Array.isArray(h.walls) && h.walls.length && wallSidesFor(h)) || sidesFor(h)).sides; },
    SYS: SYS, SYSTEMS: SYSTEMS, SYSTEM_KEYS: SYSTEM_KEYS, PARTS: PARTS, DEFAULT_PRICING: DEFAULT_PRICING, STATUSES: STATUSES,
    ROOF_TYPES: ROOF_TYPES, JOB_TYPES: JOB_TYPES, EAVE_BY_FLOORS: EAVE_BY_FLOORS,
    estimate: estimate, quote: quote, earliestStart: earliestStart,
    toISODate: toISODate, fromISODate: fromISODate, makeRef: makeRef
  };
})();
if (typeof module !== "undefined") module.exports = Engine;
