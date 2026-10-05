# Telinekiito

Scaffolding rental MVP. Customers type their address (or upload a drawing), get an instant price for scaffolding including erection, delivery and daily rent, place an order and track it with their reference number. The office confirms orders, moves them through delivery and gets a load list for the crew.

- **Customer site** `/` – quote, order, tracking (reference + last 4 digits of phone), extend rental, request pickup, messages.
- **Office** `/office` – password login, order list and filters, status updates, crew and arrival window, load list, replies, pricing settings.
- **Address lookup** – OpenStreetMap (Nominatim + Overpass) for the building outline, the Ryhti building register for the number of floors. Eave height is estimated from floors; heights from 3D city models are a later step.
- **Drawing reading** – OpenAI vision model reads a floor plan, elevation or photo. Off until an API key is set; capped per visitor and per day.

- **Two languages** – Finnish (default) and English, switched with FI / EN in the header and remembered in the browser. Link straight to English with `?lang=en`. All text lives in `public/i18n.js`.

Plain Node 22, no npm packages. Orders live in SQLite (`node:sqlite`) in a Docker volume. Caddy in front provides HTTPS.

## Website

`web/` is the public website: Next.js (App Router, static export) + TypeScript + Tailwind CSS v4 + Framer Motion, in Finnish and English. It is a single page with the instant quote built in (address → house → job → timing → order), order tracking and a contact form. All prices and orders go through this app's API, so the website, the old MVP page (`/mvp`) and the office always agree.

- The Dockerfile builds it (`npm install`, a TypeScript check that is reported but doesn't block, `next build`) and copies `web/out` into the app image, which serves it at `/`.
- Text: short strings in `web/lib/i18n.tsx`, section content in `web/lib/content.ts`, company contact details (placeholders) in `web/lib/site.ts`.
- Real photos for the gallery: put the file in `web/public/projects/` and set `photo: "/projects/<file>.jpg"` on the project in `web/lib/content.ts`; it replaces the drawing. The installation-day timeline (`BUILD_STEPS`) and the delivery rings on the map (`COVERAGE`) are in the same file.
- The 3D house model (`web/components/HouseModel.tsx`) uses the quote engine's scaffold rules (`web/lib/geometry.ts`, a port of `sidesFor` in `lib/engine.js`) — change both together.
- Desktop scrolling goes block by block: every section is one screen tall (`.snap-screen` in `web/app/globals.css`, sizes scale with window height) and `web/components/BlockScroll.tsx` moves one block per wheel step, swipe or arrow key (the installation-day timelapse has five stops). Phones scroll normally. If you add a section, give it `snap-screen section-pad` and check it still fits on a 1280 × 630 window.
- Contact-form messages appear in the office under **Contact messages**.

Work on it locally:

```bash
cd web && npm install && npm run build && cd ..
SITE_DIR=web/out OFFICE_PASSWORD=localpassword npm start   # http://localhost:3000
```

## Automatic deploys

`deploy/enable-autodeploy.sh` installs a systemd timer that checks GitHub every 2 minutes and rebuilds when `main` has a new commit. A failed build leaves the running version untouched. The latest build status and log are at `/healthz/deploy`.

```bash
sudo systemctl disable --now telinekiito-deploy.timer   # turn automatic deploys off
sudo bash /opt/telinekiito/deploy/autodeploy.sh --force --verbose   # rebuild by hand
```

## Install on the server

Ubuntu or Debian server, logged in as root (or a user with sudo). Paste this whole block into the server's terminal:

```bash
cat > /tmp/tk-bootstrap.sh <<'EOF'
set -euo pipefail
REPO="dunkinde/telinekiito"; DIR="/opt/telinekiito"; KEY="/root/.ssh/telinekiito_deploy"
apt-get update -qq && apt-get install -y -qq git curl ca-certificates openssh-client iproute2 >/dev/null
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "telinekiito-server" -f "$KEY"
try_url() { GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" git ls-remote "$1" >/dev/null 2>&1; }
URL=""
until [ -n "$URL" ]; do
  for u in "git@github.com:${REPO}.git" "ssh://git@ssh.github.com:443/${REPO}.git"; do try_url "$u" && { URL="$u"; break; }; done
  if [ -z "$URL" ]; then
    printf '\n\033[1;33mAdd this key on GitHub: github.com/%s -> Settings -> Deploy keys -> Add deploy key.\nTitle: contabo. Leave "Allow write access" off.\033[0m\n\n' "$REPO"
    cat "$KEY.pub"; printf '\nPress Enter here after you have added it... '; read -r _ < /dev/tty
  fi
done
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes" git clone -q "$URL" "$DIR"; fi
git -C "$DIR" config core.sshCommand "ssh -i $KEY -o IdentitiesOnly=yes"
bash "$DIR/deploy/setup.sh"
EOF
if [ "$(id -u)" -eq 0 ]; then bash /tmp/tk-bootstrap.sh; else sudo bash /tmp/tk-bootstrap.sh; fi
```

It prints a key and waits. Add that key to this repository under **Settings → Deploy keys → Add deploy key** (read-only), then press Enter. The script then installs Docker, writes `.env` with a generated office password, starts the app and prints the address and the office password.

Without a domain the site runs at `https://<server-ip-with-dashes>.sslip.io` (sslip.io resolves to the IP, so Caddy can get a real certificate). If ports 80/443 are already taken by another program, it runs without HTTPS at `http://<server-ip>:8080` instead.

### Switch on drawing reading

Needs API credit on platform.openai.com (a ChatGPT subscription balance doesn't work for the API).

```bash
sudo bash /opt/telinekiito/deploy/set-openai-key.sh
```

The key is typed hidden, checked with OpenAI and stored in `/opt/telinekiito/.env` (readable by root only). `AI_DAILY_LIMIT` (default 40 readings a day) protects the credit.

### Update after new code is pushed

```bash
sudo bash /opt/telinekiito/deploy/update.sh
```

### Useful commands

```bash
cd /opt/telinekiito
docker compose ps                 # what's running
docker compose logs -f app        # app log (orders, errors)
docker compose logs caddy         # HTTPS certificate problems
grep OFFICE_PASSWORD .env         # office password
nano .env && docker compose up -d # change settings, then restart
```

### When you get a domain

Point the domain's A record at the server, set `SITE_ADDRESS=yourdomain.fi` in `.env` (and `COMPOSE_PROFILES=https`, `APP_BIND=127.0.0.1:3000` if it was running on 8080), then `docker compose up -d`.

### Backup

Orders are in the `telinekiito_appdata` Docker volume:

```bash
docker compose -f /opt/telinekiito/docker-compose.yml exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/telinekiito.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker cp "$(docker compose -f /opt/telinekiito/docker-compose.yml ps -q app)":/data/backup.db ./telinekiito-backup.db
```

## Run locally

```bash
OFFICE_PASSWORD=localpassword npm start   # http://localhost:3000
npm test                                  # unit + API tests
```

## Settings (`.env`)

| Variable | Meaning |
| --- | --- |
| `SITE_ADDRESS` | Domain or `<ip>.sslip.io` for HTTPS |
| `OFFICE_PASSWORD` | Office login, at least 8 characters |
| `SESSION_SECRET` | Signs the office login cookie |
| `OPENAI_API_KEY` | Empty = drawing upload hidden |
| `OPENAI_MODEL` | Vision model, default `gpt-6-luna` |
| `AI_DAILY_LIMIT` | Max drawing readings per day |
| `SEED_EXAMPLES` | `0` = start without the three example orders |

## Layout

```
server.js            HTTP server and API routes
lib/engine.js        scaffold estimate and price (also served to the browser)
lib/orders.js        validation, order rules, customer/office actions
lib/address.js       address -> building size (OSM + Ryhti)
lib/ai.js            drawing reading (OpenAI)
lib/store.js         SQLite storage
lib/auth.js          office login
public/              customer page, office page, styles
deploy/              setup, update, OpenAI key, Caddy config
test/                node:test unit and API tests
```

The prices in the engine are placeholders until replaced with real costs and a supplier quote; the office can change them under Pricing settings.
