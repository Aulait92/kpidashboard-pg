// Startet für die Klick-Tests einen Next-Server (Dev-Modus) auf E2E_PORT gegen die Test-Datenbank.
// Läuft schon einer unter E2E_BASE_URL, wird dieser genutzt (schneller beim wiederholten Ausführen).
import { spawn, type ChildProcess } from "node:child_process";

const PORT = Number(process.env.E2E_PORT ?? 3200);
export const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

let proc: ChildProcess | null = null;

async function up(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/login`, { redirect: "manual" });
    return r.status < 500;
  } catch {
    return false;
  }
}

export async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !/test|ci|localhost|127\.0\.0\.1|host=\/tmp/i.test(url)) {
    throw new Error("Klick-Tests nur gegen eine Test-Datenbank (DATABASE_URL mit test/ci/localhost).");
  }
  if (process.env.E2E_BASE_URL) {
    if (!(await up(BASE))) throw new Error(`E2E_BASE_URL ${BASE} antwortet nicht.`);
    return;
  }
  proc = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: {
      ...process.env,
      APP_URL: BASE,
      NODE_ENV: "development",
      // Online-Zahlung „eingerichtet“ (Platzhalter): Angebotsseite zeigt Bezahlfeld und „später zahlen“.
      // Stripe wird nur beim Klick auf „Zahlung einrichten“ aufgerufen, den die Tests nie auslösen.
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_platzhalter",
      OFFER_TERMS_URL: `${BASE}/rechtliches/agb`,
      OFFER_DPA_URL: `${BASE}/rechtliches/avv`,
      RESEND_API_KEY: "",
    },
    stdio: process.env.E2E_SERVER_LOG ? "inherit" : "ignore",
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    if (await up(BASE)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Next-Server für die Klick-Tests ist nicht hochgekommen.");
}

export async function teardown() {
  if (proc?.pid) {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      /* schon beendet */
    }
  }
}
