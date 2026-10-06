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
