#!/usr/bin/env bash
set -euo pipefail

# Logs in as the default user, then calls /api/ai/ping. Prints the JSON
# response (or the server's error detail if something is off).

cookie=$(mktemp)
trap 'rm -f "$cookie"' EXIT

curl -fsS -c "$cookie" -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}' > /dev/null

echo "Asking the AI: what is 2+2?"
curl -sS -b "$cookie" -X POST http://localhost:8000/api/ai/ping
echo
