#!/usr/bin/env bash
# Turns on automatic deploys: every 2 minutes the server checks GitHub and rebuilds when there is a new commit.
# Then runs the first deploy now and shows its progress.
# Turn it off again with:  sudo systemctl disable --now telinekiito-deploy.timer
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$(id -u)" -ne 0 ]; then echo "Run this as root (or with sudo)."; exit 1; fi

cat > /etc/systemd/system/telinekiito-deploy.service <<EOF
[Unit]
Description=Telinekiito: deploy new commits from GitHub
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash ${APP_DIR}/deploy/autodeploy.sh
TimeoutStartSec=30min
EOF

cat > /etc/systemd/system/telinekiito-deploy.timer <<'EOF'
[Unit]
Description=Telinekiito: check GitHub for new commits every 2 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now telinekiito-deploy.timer >/dev/null
echo "Automatic deploys are on (every 2 minutes)."
echo "Building the new website now. The first build downloads Next.js and takes a few minutes…"
echo
bash "${APP_DIR}/deploy/autodeploy.sh" --force --verbose | grep -E "^(==|#[0-9]+ (DONE|ERROR)|.*(error|Error|ERR!|Compiled|Generating|Export|Route|built|Deployed|TypeScript)).*" || true

SITE="$(grep -E '^SITE_ADDRESS=' "${APP_DIR}/.env" | cut -d= -f2-)"
PROFILES="$(grep -E '^COMPOSE_PROFILES=' "${APP_DIR}/.env" | cut -d= -f2-)"
BIND="$(grep -E '^APP_BIND=' "${APP_DIR}/.env" | cut -d= -f2-)"
if [ "$PROFILES" = "https" ]; then URL="https://${SITE}"; else URL="http://${SITE}:${BIND##*:}"; fi
echo
cat "${APP_DIR}/.deploy/status.json" 2>/dev/null || true
echo
echo "Website:      ${URL}"
echo "Office:       ${URL}/office"
echo "Old MVP page: ${URL}/mvp"
echo "Build status: ${URL}/healthz/deploy"
