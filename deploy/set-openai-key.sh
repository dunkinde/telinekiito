#!/usr/bin/env bash
# Store the OpenAI API key in .env (never echoed) and restart the app.
# Usage (as root): bash /opt/telinekiito/deploy/set-openai-key.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

read -rsp "Paste your OpenAI API key (it stays hidden), then press Enter: " KEY < /dev/tty
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
if [[ ! "$KEY" =~ ^sk-[A-Za-z0-9_-]{20,}$ ]]; then
  echo "That doesn't look like an OpenAI key (they start with sk-). Nothing changed."; exit 1
fi

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Authorization: Bearer ${KEY}" https://api.openai.com/v1/models || true)"
case "$CODE" in
  200) echo "OpenAI accepted the key." ;;
  401) echo "OpenAI says this key is not valid. Nothing changed."; exit 1 ;;
  *)   echo "Couldn't check the key with OpenAI (answer: ${CODE:-none}). Saving it anyway." ;;
esac

umask 077
grep -v -E '^OPENAI_API_KEY=' .env > .env.tmp || true
printf 'OPENAI_API_KEY=%s\n' "$KEY" >> .env.tmp
mv .env.tmp .env
chmod 600 .env

docker compose up -d --force-recreate app >/dev/null
echo "Done. The upload box now shows on the quote page (reload it)."
