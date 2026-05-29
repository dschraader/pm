#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up -d --build

echo "PM backend is starting at http://localhost:8000"
echo "Health check: curl http://localhost:8000/api/health"
