#!/usr/bin/env bash
# Deploys new commits from GitHub. The telinekiito-deploy systemd timer runs this every 2 minutes.
# It only rebuilds when origin/main has a new commit (or with --force). If the build fails,
# the old version keeps running. Status and the build log are shown at https://<site>/healthz/deploy.
#
#   bash deploy/autodeploy.sh            # deploy if there is something new
#   bash deploy/autodeploy.sh --force    # rebuild now
#   add --verbose to also print the build log to the terminal
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
STATE="$APP_DIR/.deploy"
mkdir -p "$STATE"
FORCE=0; VERBOSE=0
for a in "$@"; do
  case "$a" in --force) FORCE=1 ;; --verbose) VERBOSE=1 ;; esac
done

# One deploy at a time.
exec 9>"$STATE/lock"
flock -n 9 || { [ "$VERBOSE" = 1 ] && echo "Another deploy is running."; exit 0; }

json_escape() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\t'/ }; s=${s//$'\r'/}; s=${s//$'\n'/ }; printf '%s' "$s"; }
write_status() { # status, commit, subject, started, finished, message
  printf '{"status":"%s","commit":"%s","subject":"%s","startedAt":"%s","finishedAt":"%s","message":"%s"}\n' \
    "$1" "$2" "$(json_escape "$3")" "$4" "$5" "$(json_escape "$6")" > "$STATE/status.json.tmp"
  mv "$STATE/status.json.tmp" "$STATE/status.json"
}
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

git fetch -q origin main 2>/dev/null || { [ "$VERBOSE" = 1 ] && echo "git fetch failed"; exit 0; }
LOCAL="$(git rev-parse HEAD)"; REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = 0 ]; then exit 0; fi

git merge -q --ff-only origin/main || { write_status failed "$LOCAL" "" "$(now)" "$(now)" "git pull failed (local changes on the server?)"; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"; SUBJECT="$(git log -1 --format=%s)"; STARTED="$(now)"
write_status building "$COMMIT" "$SUBJECT" "$STARTED" "" "Building"

run() { if [ "$VERBOSE" = 1 ]; then "$@" 2>&1 | tee -a "$STATE/build.log"; return "${PIPESTATUS[0]}"; else "$@" >> "$STATE/build.log" 2>&1; fi; }
: > "$STATE/build.log"
echo "== $(now) deploying $COMMIT: $SUBJECT" >> "$STATE/build.log"

if ! run env BUILDKIT_PROGRESS=plain docker compose build; then
  write_status failed "$COMMIT" "$SUBJECT" "$STARTED" "$(now)" "Build failed; the previous version is still running"
  exit 1
fi
if ! run docker compose up -d --remove-orphans; then
  write_status failed "$COMMIT" "$SUBJECT" "$STARTED" "$(now)" "Start failed"
  exit 1
fi
docker image prune -f >/dev/null 2>&1 || true

BIND="$(grep -E '^APP_BIND=' .env | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${BIND##*:}/healthz" >/dev/null 2>&1; then
    write_status ok "$COMMIT" "$SUBJECT" "$STARTED" "$(now)" "Running"
    [ "$VERBOSE" = 1 ] && echo "Deployed $COMMIT: $SUBJECT"
    exit 0
  fi
  sleep 2
done
run docker compose logs --tail 40 app
write_status failed "$COMMIT" "$SUBJECT" "$STARTED" "$(now)" "The app did not answer after starting"
exit 1
