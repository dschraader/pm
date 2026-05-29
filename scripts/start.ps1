$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

docker compose up -d --build

Write-Host "PM backend is starting at http://localhost:8000"
Write-Host "Health check: curl http://localhost:8000/api/health"
