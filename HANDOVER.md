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
- Next: office layout editor (move bays, levels, consoles) and standard-configuration checks from the manufacturers'
  assembly instructions (MonZon Modular Light v2.1 ch. 7; Layher Blitz AuV — ask Layher for the current edition).

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
