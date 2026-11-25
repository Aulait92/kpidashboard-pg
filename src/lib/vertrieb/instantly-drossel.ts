// Instantly-API gedrosselt (Usability-Check 25.11.2026, Sentry: 37 Ereignisse „429“): ein gemeinsamer Abruf für
// lib/vertrieb/instantly.ts und nie-kontaktieren-server.ts. Mindestabstand zwischen Aufrufen, bei 429 warten laut
// Retry-After (Sekunden oder Datum), sonst wachsender Abstand; nach den Versuchen InstantlyRateLimitError. Sentry für
// 429 höchstens einmal je Cron-Lauf (meldeInstantlyFehler), andere Fehler wie bisher.

import { reportError } from "@/lib/monitoring";

export const INSTANTLY_API = "https://api.instantly.ai/api/v2";
/** Mindestabstand zwischen zwei Aufrufen aus diesem Prozess */
export const INSTANTLY_ABSTAND_MS = 150;
const MAX_WARTEN_MS = 30_000;

export class InstantlyRateLimitError extends Error {
  constructor(path: string) {
    super(`Instantly ${path}: 429 gedrosselt, später erneut`);
    this.name = "InstantlyRateLimitError";
  }
}

/** Wartezeit nach 429: Retry-After (Sekunden oder HTTP-Datum), sonst 2, 4, 8, 16 s; höchstens 30 s. */
export function wartezeitNach429(retryAfter: string | null | undefined, versuch: number, now = Date.now()): number {
  const v = (retryAfter ?? "").trim();
  if (v) {
    const sek = Number(v);
    if (Number.isFinite(sek) && sek >= 0) return Math.min(MAX_WARTEN_MS, Math.ceil(sek * 1000));
    const at = Date.parse(v);
    if (!Number.isNaN(at)) return Math.min(MAX_WARTEN_MS, Math.max(0, at - now));
  }
  return Math.min(MAX_WARTEN_MS, 2000 * 2 ** versuch);
}

type Deps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };
const schlafen = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let letzterAufruf = 0;

/** Abruf mit Drossel und Retry-After. Gibt die Antwort zurück (auch Fehlerstatus außer 429), wirft nach zu vielen 429. */
export async function instantlyFetch(path: string, init: RequestInit | undefined, o: { versuche?: number } & Deps = {}): Promise<Response> {
  const f = o.fetch ?? fetch;
  const sleep = o.sleep ?? schlafen;
  const now = o.now ?? Date.now;
  const versuche = o.versuche ?? 5;
  for (let versuch = 0; ; versuch++) {
    const abstand = letzterAufruf + INSTANTLY_ABSTAND_MS - now();
    if (abstand > 0) await sleep(abstand);
    letzterAufruf = now();
    const res = await f(INSTANTLY_API + path, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (res.status !== 429) return res;
    if (versuch >= versuche) throw new InstantlyRateLimitError(path.split("?")[0]);
    await sleep(wartezeitNach429(res.headers.get("retry-after"), versuch, now()));
  }
}

let letzte429Meldung = 0;
/** Abstand, in dem eine Drosselung höchstens einmal nach Sentry geht (ein Cron-Lauf alle 15 Minuten). */
export const MELDE_ABSTAND_MS = 10 * 60_000;

/** Fehler melden: 429 höchstens einmal je Lauf (10 Minuten), alles andere wie reportError. */
export function meldeInstantlyFehler(err: unknown, where: string, extra?: Record<string, string | number | boolean | null>, now = Date.now()): void {
  const gedrosselt = err instanceof InstantlyRateLimitError || /Instantly [^:]*: 429\b/.test(err instanceof Error ? err.message : String(err));
  if (!gedrosselt) return reportError(err, where, extra);
  if (now - letzte429Meldung < MELDE_ABSTAND_MS) {
    console.warn(`[instantly] ${where}: weiter gedrosselt (429), nächster Versuch im nächsten Lauf`);
    return;
  }
  letzte429Meldung = now;
  reportError(err, where, extra);
}

/** Nur für Tests: Zustand zurücksetzen. */
export function _resetInstantlyDrossel() {
  letzterAufruf = 0;
  letzte429Meldung = 0;
}
