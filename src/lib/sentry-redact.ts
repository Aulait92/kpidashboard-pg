// Sentry: geheime Link-Tokens aus Pfaden entfernen (Art. 5 Abs. 1 lit. c, Art. 32 DSGVO).
//
// Viele öffentliche Seiten tragen einen geheimen Token im Pfad (z. B. /beratung/<token>). Wer den Link
// kennt, sieht Daten eines Leads. Deshalb ersetzen wir das Segment nach diesen Präfixen überall, wo
// Sentry Adressen speichert (Fehler, Breadcrumbs, Transaktionen, Replay), durch „[token]“.
// Genutzt in src/instrumentation-client.ts (Browser) und src/lib/monitoring.ts (Server und Edge).

/**
 * Präfixe, deren nächstes Pfadsegment ein Geheimnis ist. Bei verschachtelten Präfixen steht der
 * längere zuerst (/einwilligung/bestaetigen vor /einwilligung). /book/<slug> ist der öffentliche,
 * lesbare Buchungslink des Vermittlers und bleibt stehen; geheim ist nur /book/manage/<token>.
 */
export const TOKEN_PATH_PREFIXES = [
  "/beratung", // Beratungspräsentation zum Nachlesen
  "/praesentation", // Vertriebspräsentation je Kontakt
  "/empfehlen", // „Kollegen empfehlen“: Empfehlungscode
  "/erstinformation", // Erstinformation des Vermittlers
  "/angebot", // Angebot/Auftragsbestätigung
  "/buchen",
  "/abmelden", // Abmeldelink in Kampagnen-Mails
  "/api/abmelden", // List-Unsubscribe One-Click
  "/book/manage", // „Termin verwalten“
  "/einwilligung/bestaetigen", // Double-Opt-in-Bestätigung
  "/einwilligung", // Einwilligungs-Abfrage
  "/vollmacht", // Maklervollmacht je Kunde
  "/dokumentation", // Beratungsdokumentation je Fassung (Bestätigung per Klick)
  "/empfehlung/g", // Google-Bewertungslink je Kontakt
  "/empfehlung", // Empfehlungsseite je Kontakt
  "/feedback", // Kunden-Feedback per Mail-Link
  "/api/admin/support-zugriff", // Support-Zugriff auf ein Dokument im Chat (signiert, 15 Minuten)
] as const;

export const REDACTED_TOKEN = "[token]";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Anfang einer Adresse: Textanfang, Leerzeichen/Anführungszeichen/Klammer/=, oder Schema+Host.
// So bleiben Dateipfade wie „src/app/beratung/[token]/page.tsx“ im Stacktrace unberührt.
const START = String.raw`(^|[\s"'(=<,]|[a-z][a-z0-9+.-]*:\/\/[^/\s"'?#]*)`;
const PREFIX_RE = new RegExp(
  `${START}(${TOKEN_PATH_PREFIXES.map(escape).join("|")})\\/([^/?#\\s"')<>]+)`,
  "gi",
);

/** Ersetzt geheime Pfadsegmente in einem beliebigen Text (Pfad, volle URL oder Fehlermeldung). */
export function redactTokenPaths(text: string): string {
  if (!text || text.indexOf("/") === -1) return text;
  return text.replace(PREFIX_RE, (_m, start: string, prefix: string) => `${start}${prefix}/${REDACTED_TOKEN}`).replace(ID_SEGMENT_RE, "/[id]");
}

/**
 * Kennungen einzelner Leads, Kontakte, Termine in Pfaden (cuid bzw. UUID), z. B. /buyer/kontakte/ckx…:
 * durch „[id]“ ersetzen (Sitzungsaufnahme, Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md).
 */
const ID_SEGMENT_RE = /\/(?:c[a-z0-9]{20,32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#\s"')<>]|$)/g;

/** Sitzungsaufnahme nur im eingeloggten Vermittlerbereich (Positivliste), nie auf Endkunden- oder Token-Seiten. */
export function isReplayAllowedPath(pathOrUrl: string): boolean {
  let path = pathOrUrl;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname;
  } catch {
    // ungültige URL: als Pfad prüfen
  }
  path = path.split(/[?#]/)[0].toLowerCase();
  return (path === "/buyer" || path.startsWith("/buyer/")) && !isReplayBlockedPath(path);
}

/** Pfad ohne Query und Hash und ohne geheime Segmente (für request.url). */
export function redactUrl(url: string): string {
  return redactTokenPaths(url.split(/[?#]/)[0]);
}

/** Liegt der Pfad (oder die URL) auf einer Seite mit geheimem Token? Dort läuft kein Replay. */
export function isTokenPath(pathOrUrl: string): boolean {
  let path = pathOrUrl;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname;
  } catch {
    // ungültige URL: als Pfad prüfen
  }
  path = path.split(/[?#]/)[0].toLowerCase();
  return TOKEN_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Endkundenseiten (Middleware setzt dort x-bare-layout=lead; zusätzlich alle Token-Seiten):
 * Hier wird Session Replay gar nicht erst gestartet.
 */
const LEAD_PAGE_PREFIXES = ["/book", "/empfehlung", "/einwilligung", "/vollmacht", "/dokumentation", "/abmelden", "/erstinformation", "/beratung", "/demo"];

export function isReplayBlockedPath(pathOrUrl: string): boolean {
  if (isTokenPath(pathOrUrl)) return true;
  let path = pathOrUrl;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname;
  } catch {
    // ungültige URL: als Pfad prüfen
  }
  path = path.split(/[?#]/)[0].toLowerCase();
  return LEAD_PAGE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Geht rekursiv durch ein Sentry-Objekt (Event, Breadcrumb, Replay-Ereignis) und ersetzt in allen
 * Texten die geheimen Segmente. Verändert das Objekt an Ort und Stelle und gibt es zurück.
 */
export function redactDeep<T>(value: T, seen: WeakSet<object> = new WeakSet(), depth = 0): T {
  if (typeof value === "string") return redactTokenPaths(value) as T;
  if (!value || typeof value !== "object" || depth > 12) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = redactDeep(value[i], seen, depth + 1);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === "string") obj[key] = redactTokenPaths(v);
    else if (v && typeof v === "object") obj[key] = redactDeep(v, seen, depth + 1);
  }
  return value;
}

type RequestLike = { url?: string; query_string?: unknown; cookies?: unknown; headers?: unknown; data?: unknown };
type EventLike = { request?: RequestLike; user?: unknown };

/**
 * Gemeinsames beforeSend für Fehler und Transaktionen: Query weg, Nutzer weg, Token-Segmente weg.
 * `server`: zusätzlich Cookies, Header und Body entfernen.
 */
export function scrubSentryEvent<E extends EventLike>(event: E, opts: { server?: boolean } = {}): E {
  if (event.request) {
    delete event.request.query_string;
    if (opts.server) {
      delete event.request.cookies;
      delete event.request.headers;
      delete event.request.data;
    }
    if (event.request.url) event.request.url = redactUrl(event.request.url);
  }
  delete event.user;
  return redactDeep(event);
}

/** beforeBreadcrumb: Navigation, fetch/xhr und Meldungen ohne geheime Segmente und ohne Query. */
export function scrubBreadcrumb<B extends { data?: Record<string, unknown>; message?: string }>(crumb: B): B {
  const data = crumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = redactUrl(data[key] as string);
    }
  }
  return redactDeep(crumb);
}
