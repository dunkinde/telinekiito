#!/usr/bin/env bash
# First-time setup on the server. Safe to run again: it keeps an existing .env.
# Usage (as root): bash /opt/telinekiito/deploy/setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

say()  { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m!! %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root (or with sudo)."; exit 1
fi

# ---------- Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  say "Installing the Docker Compose plugin"
  if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq docker-compose-plugin
  else dnf install -y docker-compose-plugin; fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# ---------- Public IP ----------
is_private() { [[ "$1" =~ ^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.) ]]; }
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')" || true
if [ -z "${IP:-}" ] || is_private "$IP"; then
  IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org || curl -4 -fsS --max-time 5 https://ifconfig.me || true)"
fi
if [ -z "${IP:-}" ]; then warn "Couldn't find the server's public IP."; exit 1; fi

# ---------- .env ----------
port_busy() { ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
rand() { ( set +o pipefail; LC_ALL=C tr -dc "$1" </dev/urandom | head -c "$2" ); }

if [ -f .env ]; then
  say "Keeping the existing .env"
else
  say "Writing .env"
  if port_busy 80 || port_busy 443; then
    warn "Ports 80/443 are already used by another program on this server:"
    ss -ltnpH '( sport = :80 or sport = :443 )' || true
    warn "Running without HTTPS on port 8080 instead. Get a domain later to switch on HTTPS."
    PROFILES=""; BIND="0.0.0.0:8080"; SITE="${IP}"
  else
    PROFILES="https"; BIND="127.0.0.1:3000"; SITE="${IP//./-}.sslip.io"
  fi
  umask 077
  cat > .env <<EOF
SITE_ADDRESS=${SITE}
COMPOSE_PROFILES=${PROFILES}
APP_BIND=${BIND}
OFFICE_PASSWORD=$(rand 'A-HJ-NP-Za-km-z2-9' 14)
SESSION_SECRET=$(rand 'a-f0-9' 64)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-luna
AI_DAILY_LIMIT=40
SEED_EXAMPLES=1
EOF
  chmod 600 .env
fi

getenv() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }
SITE="$(getenv SITE_ADDRESS)"
PROFILES="$(getenv COMPOSE_PROFILES)"
BIND="$(getenv APP_BIND)"

# ---------- Firewall ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  say "Opening the firewall"
  if [ "$PROFILES" = "https" ]; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  else ufw allow "${BIND##*:}/tcp" >/dev/null; fi
fi

# ---------- Start ----------
say "Building and starting Telinekiito (first time takes a minute or two)"
docker compose up -d --build --remove-orphans

LOCAL_PORT="${BIND##*:}"
printf 'Waiting for the app'
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${LOCAL_PORT}/healthz" >/dev/null 2>&1; then OK=1; break; fi
  printf '.'; sleep 2
done
echo
if [ "${OK:-0}" != 1 ]; then
  warn "The app didn't start. Its log:"
  docker compose logs --tail 40 app
  exit 1
fi

if [ "$PROFILES" = "https" ]; then
  URL="https://${SITE}"
  printf 'Getting the HTTPS certificate'
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 4 "${URL}/healthz" >/dev/null 2>&1; then CERT=1; break; fi
    printf '.'; sleep 3
  done
  echo
  if [ "${CERT:-0}" != 1 ]; then
    warn "HTTPS isn't ready yet. Give it a few minutes, then open the address below."
    warn "If it still fails, check: docker compose -f ${APP_DIR}/docker-compose.yml logs caddy"
  fi
else
  URL="http://${SITE}:${LOCAL_PORT}"
fi

cat <<EOF

=====================================================================
 Telinekiito is running.

   Customer site:   ${URL}
   Office:          ${URL}/office
   Office password: $(getenv OFFICE_PASSWORD)

 Switch on drawing reading (asks for your OpenAI key, hidden):
   sudo bash ${APP_DIR}/deploy/set-openai-key.sh

 Update to the newest code later:
   sudo bash ${APP_DIR}/deploy/update.sh
=====================================================================
EOF
