// Einfaches Rate-Limiting (Drosselung) im Arbeitsspeicher – je App-Instanz.
//
// Reicht für eine Instanz (Railway: live-app läuft mit einer Replik). Bei
// mehreren Repliken zählt jede für sich (Limit wirkt dann effektiv × Anzahl).
// Später austauschbar gegen Redis (INCR + EXPIRE je Schlüssel): nur `hit()`
// muss dann asynchron gegen Redis zählen, die Aufrufer bleiben gleich.

type Entry = { count: number; resetAt: number };

export type RateLimitRule = {
  /** Erlaubte Anfragen je Fenster */
  limit: number;
  /** Fensterlänge in Millisekunden */
  windowMs: number;
};

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

const MAX_KEYS = 20_000;
const store = new Map<string, Entry>();

function sweep(now: number) {
  for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
  // Notbremse gegen Speicherwachstum (z. B. viele gefälschte IPs): älteste raus
  if (store.size > MAX_KEYS) {
    const drop = store.size - MAX_KEYS;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= drop) break;
      store.delete(k);
    }
  }
}

/** Zählt einen Aufruf für (bucket, key) und sagt, ob er noch erlaubt ist (festes Zeitfenster). */
export function hit(bucket: string, key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  if (store.size > MAX_KEYS / 2) sweep(now);
  const id = `${bucket}:${key}`;
  let e = store.get(id);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + rule.windowMs };
    store.set(id, e);
  }
  e.count += 1;
  const ok = e.count <= rule.limit;
  return { ok, remaining: Math.max(0, rule.limit - e.count), retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((e.resetAt - now) / 1000)) };
}

/** Nur für Tests. */
export function resetRateLimits() {
  store.clear();
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Zentrale Grenzwerte – großzügig für echte Nutzer, eng genug gegen Missbrauch und KI-Kosten. */
export const LIMITS = {
  // Anmeldung: zusätzlich zur Sperre je E-Mail (10 Fehlversuche / 15 Min) je IP
  login: { limit: 30, windowMs: 15 * MIN },
  totp: { limit: 20, windowMs: 15 * MIN },
  passwordReset: { limit: 5, windowMs: 15 * MIN },
  // KI (kostet je Aufruf)
  aiHelp: { limit: 30, windowMs: HOUR },
  aiTestChat: { limit: 60, windowMs: HOUR },
  transcribe: { limit: 60, windowMs: HOUR },
  // „Mit Mensch sprechen“ (benachrichtigt das Team per Push)
  supportEscalation: { limit: 10, windowMs: HOUR },
  // Öffentliche Seiten
  publicBooking: { limit: 20, windowMs: 10 * MIN },
  offerAccept: { limit: 10, windowMs: 10 * MIN },
  publicApi: { limit: 60, windowMs: MIN },
  cspReport: { limit: 30, windowMs: MIN },
  // Webhooks mit Signaturprüfung: nur grobe Obergrenze (Stripe/Meta senden Bursts)
  webhook: { limit: 1200, windowMs: MIN },
} satisfies Record<string, RateLimitRule>;

export type LimitName = keyof typeof LIMITS;

export const RATE_LIMIT_MESSAGE = "Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten und dann noch einmal versuchen.";

/**
 * Client-IP hinter dem Railway-Proxy: Railway setzt X-Real-IP am Edge (vom Client
 * nicht übernehmbar). Rückfall (lokal/anderer Hoster): letzter Eintrag in
 * X-Forwarded-For – vordere Einträge kann der Client selbst setzen.
 */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

/** Prüft ein benanntes Limit. */
export function checkLimit(name: LimitName, key: string): RateLimitResult {
  return hit(name, key, LIMITS[name]);
}

/** Für Route-Handler: 429-Antwort oder null, wenn erlaubt. */
export function limitResponse(name: LimitName, key: string, message = RATE_LIMIT_MESSAGE): Response | null {
  const r = checkLimit(name, key);
  if (r.ok) return null;
  return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } });
}

/** Für Server-Actions: IP aus den Request-Headern (next/headers). */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  return clientIp(await headers());
}
