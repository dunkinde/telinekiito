// Starts server.js against a fresh temp DATA_DIR with the built website (web/out), seeds example data
// with dev/seed.mjs and stops the server when the run ends.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OFFICE_PASSWORD, PORT } from "./env";

const ROOT = path.resolve(__dirname, "..");

async function waitForHealth(url: string, server: { exitCode: number | null }, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`server.js exited with code ${server.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not answer ${url} within ${ms} ms`);
}

export default async function globalSetup() {
  const siteDir = path.resolve(process.env.SITE_DIR || path.join(ROOT, "web", "out"));
  if (!existsSync(path.join(siteDir, "index.html"))) throw new Error(`No built website in ${siteDir}. Build it first: cd web && npm run build`);
  const dataDir = mkdtempSync(path.join(tmpdir(), "tk-e2e-"));
  const base = `http://127.0.0.1:${PORT}`;
  try {
    if ((await fetch(base + "/healthz")).ok) throw new Error(`Port ${PORT} is already in use – set E2E_PORT to a free port.`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Port")) throw e;
  }

  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_DIR: siteDir,
      DATA_DIR: dataDir,
      OFFICE_PASSWORD,
      SESSION_SECRET: "e2e-session-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      SEED_EXAMPLES: "0",
      // No outside services during tests.
      OPENAI_API_KEY: "",
      NLS_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const stop = () => {
    if (server.exitCode === null) server.kill();
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };

  try {
    await waitForHealth(base + "/healthz", server);
    const seed = spawnSync(process.execPath, ["dev/seed.mjs", String(PORT)], { cwd: ROOT, encoding: "utf8" });
    if (seed.status !== 0) throw new Error(`dev/seed.mjs failed:\n${seed.stdout}\n${seed.stderr}`);
  } catch (e) {
    stop();
    throw new Error(`${(e as Error).message}\n--- server log ---\n${log}`);
  }

  return async () => {
    if (process.env.E2E_SERVER_LOG) console.log(log);
    stop();
  };
}
