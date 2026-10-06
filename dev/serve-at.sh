#!/bin/bash
# Usage: serve-at.sh PORT NAME   → starts the platform on PORT with data in $TMPDIR/tkdata-NAME (office password: localpassword)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; TMP=${TMPDIR:-/tmp}
PORT=${1:-3995}; NAME=${2:-dev}
cd "$ROOT"
mkdir -p $TMP/tkdata-$NAME
PORT=$PORT SITE_DIR=$ROOT/dev/harness/out DATA_DIR=$TMP/tkdata-$NAME OFFICE_PASSWORD=localpassword SESSION_SECRET=localsecretlocalsecretlocalsecretlocalsecret \
  nohup node --disable-warning=ExperimentalWarning server.js > $TMP/server-$NAME.log 2>&1 &
for i in $(seq 1 50); do curl -s -o /dev/null http://127.0.0.1:$PORT/healthz && break; sleep 0.1; done
echo "server on http://127.0.0.1:$PORT (log: $TMP/server-$NAME.log)"
