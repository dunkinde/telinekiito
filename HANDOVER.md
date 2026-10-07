# TelineKiito – handover (6 Oct 2026)

Scaffolding-rental platform for David (business idea; no real company yet). Finnish default, English too.

## Where things run
- Server: Contabo VM 169.58.228.43, app in `/opt/telinekiito` (Docker Compose: Node app + Caddy). Live site: https://169-58-228-43.sslip.io (office `/office`, old MVP `/mvp`, build status `/healthz/deploy`).
- Repo: GitHub `dunkinde/telinekiito`. **Pushing to `main` auto-deploys** within ~2 min (systemd timer runs `deploy/autodeploy.sh`). The Docker build runs `tsc` (reports errors, doesn't block) and `next build` for `web/`.
- Owner/office login on the server: `OFFICE_PASSWORD` in `/opt/telinekiito/.env` (never paste secrets into chat). David prefers one combined copy-paste block for server commands.
- Commit messages end with the Co-Authored-By / Claude-Session lines given by the session.

## Branches
- `main` = what's live: website (Next.js static export in `web/`), quote engine, old office, block-to-block desktop scrolling.
- `platform-wip` = **unfinished platform work, not deployed**. Merge into `main` only when tested.

## Done on `platform-wip`
- **Backend (tested, `npm test` = 22 passing):** `server.js`, `lib/platform.js` (staff/roles owner·leader·worker with phone+PIN, crews, scheduling, crew job flow, change requests, hours, invoices with Finnish reference no., partner accounts with discount code, reviews, editable FAQ/contact, dashboard, margins), `lib/stock.js` (live stock: every order holds its parts for its dates; website refuses oversold dates and offers the first free date; demo orders excluded), `lib/notify.js` + `lib/smtp.js` (FI/EN templates, outbox; email via SMTP and SMS via Twilio/BulkGate switch on with `.env` vars SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM, SMS_PROVIDER + keys; until then messages wait in the outbox), `lib/weather.js` (FMI wind warnings), `lib/docs.js` (printable confirmation, inspection record, invoice; customer access via signed `?t=` link), `lib/auth.js`.
- **Web client contract:** `web/lib/platform.ts` (typed API for office and crew apps).
- **Office app** `web/components/office/**` (route `/office`) and **crew app** `web/components/crew/**` + `web/public/crew*` (route `/crew`, FI/EN/RU, offline queue, PWA): written by builders, they compile, but **not fully tested** (stopped by a usage limit).

## Done in the 6 Oct session (2nd)
- Office and crew apps tested: owner/leader/worker, FI/EN (crew RU), 1280×630, 1440×900, phone 390×844 (real mobile emulation);
  every office section and action (schedule+confirm, messages, invoice draft→sent→paid, approvals, stock, team, crews,
  customers, settings), the full crew job (load → drive → build → inspect+signature → hand over → count → dismantle) and the
  offline queue. Only bug: office login page was laid out 563px wide on phones (fixed).
- Website (step 2) and audit fixes (step 3, M1 skipped) are done – see the commit message of "Website: live availability…".
- Privacy notice `/privacy`: controller name, business ID, address, email and contact person are **placeholders** in
  `web/lib/privacy.ts` (CONTROLLER) – fill them in, and check the retention times with the accountant.
- Social links in `web/lib/site.ts` are empty (hidden) until real profiles exist. Phone/email there are still placeholders
  (M1); the office can override them under Settings → Website.
- Tall buildings (3+ storeys in the register) are ordered with an office note "Check the price" and an alert.

## Business customer portal (/business) – added 6 Oct
- People of a business customer account (Office → Business customers → Portal users) log in at `/business` with phone + PIN.
  Roles: admin (also manages the company's users), site manager (orders and changes), accountant (invoices only). FI/EN/RU.
- They see all the company's sites live (refresh every 20 s): status, schedule, crew progress, photos, cost so far,
  documents and invoices; order new sites (company discount, first free dates, PO / project / cost centre / site contact);
  ask for changes with the price before → after – **the office always approves**; request pickup; message the office.
- Code: `lib/business.js`, `/api/biz/*` in `server.js` (cookie `tk_biz`, separate from staff logins), `web/components/business/*`,
  `web/lib/business.ts`. Tests: `test/business.test.js`.
- E-invoicing: `lib/finvoice.js` makes a Finvoice 3.0 file per invoice (download in the portal and in Office → Invoices).
  Account fields: e-invoice address (OVT) + operator ID; our own in Settings → Company. **Sending through an operator
  (Maventa, Apix, Netvisor…) is not connected yet** – pick an operator, then add its API like SMTP/SMS.

## Size check (added 6 Oct)
- The address lookup flags `size_mismatch` when the map outline and the register floor area per storey differ by >20 %
  (e.g. a rough box drawn on OpenStreetMap). Such warnings travel with the order (`checks`), and the server sets
  `needsReview` + `sizeCheck.reasons` + an internal note: the office sees a "Check size" badge, a notice with a
  satellite link, and the customer's tracking page / business portal asks for a photo of each side
  (`POST /api/orders/:ref/photos`, `/api/biz/orders/:ref/photos`, max 12, stage "customer").
- Where there's no 3D model, the price engine models a rectangle; L-shapes need the office's check.

## 3D building model (added 6 Oct)
- `lib/nls3d.js`: National Land Survey 3D buildings (LoD2 CityGML, OGC API Processes, key `NLS_API_KEY`).
  The address lookup finds the 1:10 000 map sheet (e.g. Päätie 39 → L4133D), downloads it once (a few seconds),
  keeps a compact index in `DATA_DIR/nls3d/<sheet>.json` ("none" is rechecked after 30 days) and picks the building.
  Coverage is mostly larger cities (Helsinki yes, Hamina no); elsewhere everything works as before.
- Each wall on the outline gets its own eave and top height (a wall that drops under a porch roof is split), a
  `gable` flag (top rises > 5°) and `ext` = outer corners at its ends. `Engine.estimate` prices `house.walls` side by
  side ("Wall N" / "Gable end N"): 1 m past outer corners only, real run length for the area, whole bays for parts.
- The page only sends `model: {id, lat, lon}`; the server takes the walls from its own copy (`withModel` in
  server.js), so walls can't be faked. A size change request drops the walls. Attribution "Contains data from the
  National Land Survey of Finland, 3D buildings" (CC BY 4.0) shows with the model on the website.

## Two scaffold systems (added 6 Oct)
- `lib/engine.js` SYSTEMS: **layher** (Layher Blitz 70 Alu, 3.07 m bays, frames; sizes from Layher's Blitz catalogue
  04.2019) and **monzon** (MonZon Modular Light, aluminium modular system on the same 3.07 × 0.73 m grid; part numbers
  and weights from the MonZon Modular Light catalogue 2022, rules from its assembly instruction v2.1). Each system has
  its own parts with unique keys (MonZon keys start with `mz_`), so stock, crew loading lists and documents never mix
  them. The roof-catch net weights are estimates (not in either catalogue).
- `house.system` on quotes and orders (missing = layher). `/api/quote` returns `options` (the price with each system
  that is switched on); the website calculator and the business portal let the customer choose.
- Office → Settings → Prices → Scaffold systems: switch a system on/off and give it its own rent, erection and
  dismantling rates (empty = the general rate). One system always stays on.
- Stock: a system with no parts entered isn't stock-checked (e.g. MonZon rented from a partner when needed); enter its
  quantities to start checking it.

## 3D scaffold plan (added 7 Oct)
- `lib/layout.js` builds the plan from the same estimate as the price: house walls/roofs (real NLS polygons when the
  house was measured, `house.shape` on the order; otherwise a box with its roof) and each side's position, bays,
  levels, decks and roof-catch. NLS index format v2 stores each building's polygons (sheets ~19 MB; old ones re-download).
- Viewer: `web/components/scaffold3d` (three.js, loaded on demand). Used in the calculator ("Näytä 3D:nä"), office
  order → Teline ja hinta (3D card + copy share link), crew job card ("Avaa 3D-malli"), tracking page, and `/3d?t=…`.
- API: GET /api/office/orders/:ref/plan, POST …/share, GET /api/crew/jobs/:ref/plan, POST /api/orders/:ref/plan {phone},
  GET /api/plan/:token (no personal data).
- Office layout editor (7 Oct): per side bays, levels, decks, roof-catch or off, stored in `house.adjust` (by side name);
  POST /api/office/orders/:ref/layout/preview and …/layout reprice the order. Dropped when the house size changes.
- Weather protection (7 Oct): `house.sheeting` (plastic sheeting on the outer face of every side; every standard line
  anchored on every level) and `house.weatherRoof` (MonZon PROTECT IT keder roof, 18°, 2.50 m sections, spanning the
  scaffold; every side is raised so the trusses clear the ridge, roof-catch dropped). Parts with prefixes wp_/wr_ (own
  "weather" stock group), quote lines sheeting/roofRent/roofWork, prices sheetingPerM2/roofRentPerM2Day/roofWorkPerM2
  (starting values, editable in Office → Settings → Prices). Drawn in the 3D view.
- Standard-configuration checks (`lib/checks.js`): height limit, load class, anchoring and sheeting reminders per system
  with document + page; "engineer" when over the limit. Shown in the office (Teline ja hinta) and the crew job card.
  Layher rules come from the 2013 AuV – replace the numbers in RULES.layher when Layher sends the current edition.
  Layher anchors in the engine now follow AuV p. 14 (one level: every second frame; one level with roof-catch: every frame).

## Scaffold rules (7 Oct, strict pass)

- Deck heights (lib/engine.js `deckFor`, `eaveTarget`): eave sides have the deck at most 1.5 m under the eave (DIN 4420-1, which Layher AuV §17 refers to; MonZon has no rules of its own). A 1.00 m compensation frame at the bottom (Layher 1714.101, MonZon 240.100) is used where 2 m lifts alone miss that window. Gables reach the ridge from 2 m below it. web/lib/geometry.ts mirrors this for the website drawing.
- Roof-catch (every roof job, with or without the temporary roof): the catch wall is b ≥ 0.70 m out from the eave edge and reaches 1.5 − b above the eave. The eave overhang is not in the building model, so it is assumed to be 0.5 m. Normal sides put the wall (2 m posts 1748.003, two grids per bay) on an outer 0.36 m console (b = 0.89). Sides raised for a temporary roof hang the grids on the outer standards (b = 0.83).
- Temporary roof: carrying sides stand 0.6 m from the wall, clear of the overhang, with 0.36 m inner consoles at the working decks. They share one frame grid (`roofGrid`), chosen so the working decks stay under the eave. On measured L/T houses the work scaffold follows the walls, and "Roof support N" runs carry the roof where its edge crosses open ground (`roofSupport`).
- Anchors: consoles, roof-catch and the temporary roof densify the anchor grid to every standard line every 2 m (Layher AuV p. 19).
- MonZon: the instruction v2.1 §1.11 does not cover sheeting or weather roofs, so check `mz_not_covered` is "engineer": get a calculation from MonZon or use Layher.
- The checks list shows the worst roof-catch side against the DIN figures (`catch_din`).

## Engineering audit (7 Oct, 2nd pass)

- Corners (`resolveEnds`): one scaffold per corner. At an outer corner the through side runs past to the other side's outer edge, and the butting side runs 0.2 m past its wall end. At an inner corner the through side stops at the other wall's gap and the butting side stops 1.13 m short. Through = roof-catch side, then the taller side, then long sides / the side ending there; short jogs always run through. Free ends: 1 m, or for roof-catch 2 m past the 0.5 m overhang (Austrian BauV §88 (4), the strictest rule found; `CATCH.lateral`). The price length (`runM`) is still measured the usual way, 1 m past outer corners; material, 3D, sheeting and catch metres use the run as built (`run`).
- Measured houses: steps in the facade (≥ 0.5 m) are their own short sides (no longer merged into the next wall). `unclash` tests every footprint on the real outline and shortens the lower-priority run where two clash, keeping 0.1 m clear. A run left under 0.7 m is dropped; cuts over 1 m show as `tight_spots`. Bays never stretch past 3.07 m.
- Temporary roof: only the walls on the roof's edge set its level; scaffolds inside the outline must clear the trusses (`interiorDeck`). The truss underside also clears every carrying wall's eave by 0.2 m at a 0.5 m overhang. Low-pitch roofs therefore get a higher roof than before; the old one would have sat on the eaves.
- Layher parts per the catalogue and AuV: alu double guardrail 1732.307 (one per bay and level), toe board 6.8 kg, end toe boards, diagonal 8.3 kg, a horizontal brace at the foot of each braced bay (1727.307), start ledgers plus a base deck for the lowest ladder, end frames closing a catch level, 1 m frames braced with tubes and couplers, and a ladder (Layher) or 1 m stair (MonZon) to the first deck over a 1 m base lift.
- Access: hatch-deck towers per connected scaffold (sides that share a deck height at a corner), one more every 50 m (TRBS 2121-1), not one per side.
- MonZon: V ties on every 5th pair of standards and in the end bays; 18 m height limit with brackets; guardrail/ledger counts at the catch level.
- Roof rules (BG BAU B 121): roof-catch for roofs over 22.5° up to 60°; on flatter roofs the protection reaches 1.0 m above the eave; over 45° → note on special work positions; over 60° → engineer; roof rising more than 5 m above the eave → note on roof protection walls. Raised scaffold above the eave under a temporary roof → engineer (`roof_anchor`).
- Stock: weather kits are tracked separately (wp_/wr_/lr_). In a tracked system every part counts, so enter the new parts (consoles, 1 m frames, grid posts, start ledgers, horizontal braces, end toe boards, tubes, couplers, ladders) in the office stock, or orders will be refused for lack of them.
- Tests: rectangle and L-shaped corner tests in test/unit.test.js. For a full sweep over real buildings, run the overlap and coverage scripts against tkdata (see the 7 Oct session): 0 clashes in 200 cases, 97% of wall face covered (the rest is inner-corner gaps).

## What's left
- Merge `platform-wip` → `main`, check `/healthz/deploy` and the live site (if not done yet).
- Company details (M1 phone, privacy controller details), email/SMS keys in `.env`.

## Local testing
- On a normal machine (Windows too): `cd web && npm install && npm run build`, then run `server.js` with `SITE_DIR=<abs path to web/out>` (use a Windows path on Windows), `DATA_DIR`, `OFFICE_PASSWORD=localpassword`, `SESSION_SECRET=<32+ chars>`. Playwright can drive the installed Edge (`channel: "msedge"`).

### In the old sandbox (no npm registry)
- Build all pages: `node dev/harness/build.mjs` (or `office`, `crew`, `site`). Uses esbuild + tailwindcss from `/opt/npm-tools/node_modules`; framer-motion is stubbed (final states).
- Run: `bash dev/serve-at.sh 3995 office` → http://127.0.0.1:3995 (owner password `localpassword`), seed: `node dev/seed.mjs 3995` (crews, staff: leader 040 100 0001/1111, worker RU 040 100 0002/2222, worker 040 100 0003/3333, leader EN 040 100 0004/4444; orders around today; stock; partner code KATTO10).
- Screenshots with Playwright (python, chromium preinstalled; don't run `playwright install`). `dev/fit.py` checks every website block fits one screen; `dev/snaptest.py` checks block-to-block scrolling.
- Don't `pkill node` (kills other things); kill servers by PID.
