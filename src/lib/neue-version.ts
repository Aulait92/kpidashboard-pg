// Neue Version, alte Tabs (Sentry KPIDASHBOARD-PG-6, Go-live 15.11.2026): Nach einem Deploy kennt der
// Server die Server Actions der alten Seite nicht mehr (Next: UnrecognizedActionError, „Server Action
// … was not found on the server“). Dann die Seite einmal neu laden; gegen Schleifen über einen
// Zeitstempel in sessionStorage abgesichert. Klappt das nicht: Hinweis mit Knopf (components/neue-version.tsx).
//
// Navigationen in alten Tabs fängt Next selbst ab (deploymentId in next.config.ts → harter Reload).
//
// Ole, 20.11.2026 (Onboarding Herr Lohmann): Nach dem automatischen Reload stand der Kunde ohne Erklärung wieder auf
// der Seite. Jetzt merkt sich der Reload einen Hinweis, die neu geladene Seite zeigt ihn kurz (components/neue-version.tsx).
// Erkannt werden auch fehlende Code-Teile (ChunkLoadError) und die Antwort 409 „Server Action unavailable.“.

export const NEUE_VERSION_EVENT = "pg:neue-version";
export const NEUE_VERSION_TEXT = "Es gibt eine neue Version. Bitte laden Sie die Seite neu.";
/** Kurzer Hinweis nach dem automatischen Reload (ein Satz, an Kunden: keine Gedankenstriche). */
export const AKTUALISIERT_TEXT = "Die App wurde aktualisiert. Bitte noch einmal tippen.";

const KEY = "pg-neue-version-reload";
/** Nach dem Reload: Hinweis zeigen (Zeitstempel des Reloads). */
const HINWEIS_KEY = "pg-neue-version-hinweis";
/** Innerhalb dieser Zeit kein zweiter automatischer Reload (sonst Schleife). */
export const RELOAD_GUARD_MS = 30_000;

export function isNewVersionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "UnrecognizedActionError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  // Code-Teile der alten Version gibt es nach dem Deploy nicht mehr (Webpack/Turbopack, Safari, Chrome, Firefox)
  if (e.name === "ChunkLoadError") return true;
  return /Server Action ".*" was not found on the server|Failed to find Server Action|^Server Action unavailable\.?$|Loading (CSS )?chunk [\w./-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    msg.trim(),
  );
}

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * true: Reload ist angestoßen. false: kurz zuvor schon neu geladen (oder kein Speicher),
 * dann soll der Hinweis erscheinen.
 */
export function reloadForNewVersion(opts: { now?: number; storage?: Store | null; reload?: () => void } = {}): boolean {
  const now = opts.now ?? Date.now();
  let storage: Store | null = null;
  try {
    storage = opts.storage !== undefined ? opts.storage : window.sessionStorage;
  } catch {
    storage = null;
  }
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(KEY) ?? 0);
    if (last && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(KEY, String(now));
    storage.setItem(HINWEIS_KEY, String(now));
  } catch {
    return false;
  }
  (opts.reload ?? (() => window.location.reload()))();
  return true;
}

/**
 * Nach einem automatischen Reload einmal true (Hinweis „Die App wurde aktualisiert …“ zeigen), danach false.
 * Nur, wenn der Reload höchstens eine Minute her ist (sonst wäre der Hinweis aus dem Zusammenhang).
 */
export function takeReloadHinweis(opts: { now?: number; storage?: Pick<Storage, "getItem" | "removeItem"> | null } = {}): boolean {
  const now = opts.now ?? Date.now();
  try {
    const storage = opts.storage !== undefined ? opts.storage : window.sessionStorage;
    if (!storage) return false;
    const at = Number(storage.getItem(HINWEIS_KEY) ?? 0);
    if (!at) return false;
    storage.removeItem(HINWEIS_KEY);
    return now - at >= 0 && now - at < 60_000;
  } catch {
    return false;
  }
}

/** Fehler einer Server Action melden: neu laden oder Hinweis zeigen. true = war eine neue Version. */
export function handleNewVersionError(err: unknown): boolean {
  if (!isNewVersionError(err)) return false;
  if (!reloadForNewVersion()) window.dispatchEvent(new Event(NEUE_VERSION_EVENT));
  return true;
}
