# Scripts

Thin wrappers around `docker compose` for starting and stopping the app.

- `start.sh` / `start.ps1` - `docker compose up -d --build`, then print the URL.
- `stop.sh` / `stop.ps1` - `docker compose down`.

The `.sh` versions are for Mac and Linux (require `bash`). The `.ps1` versions are for Windows PowerShell. All scripts `cd` to the project root before invoking compose, so they can be run from any working directory.

Both rely on Docker Desktop (or an equivalent Docker engine) being installed and running. Optional `.env` at the project root supplies `OPENROUTER_API_KEY` (used from Part 8 onward) and `SESSION_SECRET` (used by the backend's session cookie signing; a dev default is built into the image).

The frontend's Playwright config invokes `start.sh` as one of its `webServer` entries with `reuseExistingServer: true`, so `npm run test:e2e` will spin up the container automatically if one isn't already running. Tear it down with `stop.sh` afterwards.
