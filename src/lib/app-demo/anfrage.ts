// Ist die laufende Anfrage die öffentliche App-Demo? Synchron, damit die Prisma-Weiche (src/lib/prisma.ts) bei jedem
// Zugriff entscheiden kann. Liest die Anfrage-Header aus dem Request-Speicher von Next (derselbe, den headers() nutzt).
// Außerhalb einer Anfrage (Cron, Skripte, Tests) gibt es keinen Speicher → keine Demo.

import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { APP_DEMO_HEADER } from "./marke";
import { pruefeDemoMarke } from "./marke-pruefen";

type Speicher = { type?: string; phase?: string; headers?: { get(name: string): string | null } };

function speicher(): Speicher | undefined {
  try {
    return workUnitAsyncStorage.getStore() as Speicher | undefined;
  } catch {
    return undefined;
  }
}

/** Trägt die Anfrage ein gültiges Demo-Kennzeichen? Dann gehen ALLE Datenbankzugriffe an die Demo-Datenbank (nur lesend). */
export function istDemoAnfrage(): boolean {
  const s = speicher();
  if (!s?.headers || typeof s.headers.get !== "function") return false;
  return pruefeDemoMarke(s.headers.get(APP_DEMO_HEADER));
}

/**
 * Demo-Sicht im Kundenbereich (Buyer-Kontext): nur beim Rendern einer Seite, nie in einer Server Action.
 * Die Middleware lässt unter /app-demo ohnehin nur GET durch; das hier ist die zweite Sperre.
 */
export function istDemoAnsicht(h: { get(name: string): string | null }): boolean {
  if (!pruefeDemoMarke(h.get(APP_DEMO_HEADER))) return false;
  if (h.get("next-action")) return false;
  const ct = (h.get("content-type") ?? "").toLowerCase();
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded") || ct.includes("text/plain")) return false;
  if (speicher()?.phase === "action") return false;
  return true;
}
