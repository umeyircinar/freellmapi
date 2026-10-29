#!/bin/bash
# Cloud sessions only: install dependencies and start the FreeLLMAPI server
# in the background on http://localhost:3001.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Run the install only if a listed file has changed since the install last succeeded.
# npm ci installs exactly what package-lock.json pins and never rewrites it.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm ci --no-audit --no-fund
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json \
    shared/package.json server/package.json client/package.json cli/package.json \
    2>/dev/null > "$hashes" || rm -f "$hashes"
fi

# ENCRYPTION_KEY from the environment's settings wins; otherwise keep a per-container key in .env.
if [ ! -f .env ]; then
  printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "${ENCRYPTION_KEY:-$(openssl rand -hex 32)}" > .env
fi

# Provider keys and the admin account come from FREEAPI_CONFIG_JSON, if the environment sets it
# (see "Declarative startup config" in docs/en/install/01-install.md).
log=/tmp/freellmapi-server.log
if ! curl -s -o /dev/null -m 2 http://localhost:3001/v1/models; then
  # Redirect the whole subshell so the hook's stdout is not held open by the server.
  (cd server && exec setsid nohup npx tsx src/index.ts) >> "$log" 2>&1 < /dev/null &
  for _ in $(seq 1 30); do
    curl -s -o /dev/null -m 2 http://localhost:3001/v1/models && break
    sleep 1
  done
fi

if curl -s -o /dev/null -m 2 http://localhost:3001/v1/models; then
  echo "FreeLLMAPI running on http://localhost:3001 (log: $log)"
else
  echo "FreeLLMAPI did not start; see $log" >&2
fi
