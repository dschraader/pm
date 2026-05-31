import { execSync } from "node:child_process";
import { resolve } from "node:path";

const composeFile = resolve(__dirname, "..", "docker-compose.yml");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBackend() {
  for (let i = 0; i < 60; i++) {
    try {
      const out = execSync("curl -fsS http://127.0.0.1:8000/api/health", {
        stdio: ["pipe", "pipe", "ignore"],
      });
      if (out.toString().includes("ok")) return;
    } catch {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error("Backend never became reachable on /api/health within 60s");
}

export default async function globalSetup() {
  execSync(`docker compose -f "${composeFile}" down -v`, { stdio: "inherit" });
  execSync(`docker compose -f "${composeFile}" up -d --build`, {
    stdio: "inherit",
  });
  await waitForBackend();
}
