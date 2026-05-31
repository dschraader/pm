#!/usr/bin/env bash
set -euo pipefail

# Logs in and sends a single chat turn to /api/ai/chat. Prints the JSON
# response so you can inspect reply + appliedMutations + board.

cookie=$(mktemp)
trap 'rm -f "$cookie"' EXIT

curl -fsS -c "$cookie" -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}' > /dev/null

echo "User: What cards are currently in the Backlog column?"
curl -sS -b "$cookie" -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What cards are currently in the Backlog column?"}'
echo
