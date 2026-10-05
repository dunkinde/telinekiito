#!/usr/bin/env bash
# Pull the newest code from GitHub and restart. Orders and settings are kept (they live in a Docker volume).
# Usage (as root): bash /opt/telinekiito/deploy/update.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

git pull --ff-only
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

BIND="$(grep -E '^APP_BIND=' .env | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${BIND##*:}/healthz" >/dev/null 2>&1; then
    echo "Updated to $(git log -1 --format='%h %s')"; exit 0
  fi
  sleep 2
done
echo "The app didn't come back up. Its log:"
docker compose logs --tail 40 app
exit 1
