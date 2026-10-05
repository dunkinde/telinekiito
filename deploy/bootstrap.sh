#!/usr/bin/env bash
# First install on a fresh server: makes a read-only deploy key, clones the private repo
# to /opt/telinekiito and runs deploy/setup.sh. The README has this as one paste block.
set -euo pipefail
REPO="dunkinde/telinekiito"
DIR="/opt/telinekiito"
KEY="/root/.ssh/telinekiito_deploy"

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq git curl ca-certificates openssh-client iproute2 >/dev/null
else
  dnf install -y -q git curl ca-certificates openssh-clients iproute
fi

mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "telinekiito-server" -f "$KEY"

try_url() { GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" git ls-remote "$1" >/dev/null 2>&1; }
URL=""
until [ -n "$URL" ]; do
  for u in "git@github.com:${REPO}.git" "ssh://git@ssh.github.com:443/${REPO}.git"; do
    if try_url "$u"; then URL="$u"; break; fi
  done
  if [ -z "$URL" ]; then
    printf '\n\033[1;33mAdd this key on GitHub: github.com/%s -> Settings -> Deploy keys -> Add deploy key.\nTitle: contabo. Leave "Allow write access" off.\033[0m\n\n' "$REPO"
    cat "$KEY.pub"
    printf '\nPress Enter here after you have added it... '
    read -r _ < /dev/tty
  fi
done

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes" git clone -q "$URL" "$DIR"
fi
git -C "$DIR" config core.sshCommand "ssh -i $KEY -o IdentitiesOnly=yes"
bash "$DIR/deploy/setup.sh"
