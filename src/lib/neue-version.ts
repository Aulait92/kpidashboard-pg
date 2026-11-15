// Neue Version, alte Tabs (Sentry KPIDASHBOARD-PG-6, Go-live 15.11.2026): Nach einem Deploy kennt der
// Server die Server Actions der alten Seite nicht mehr (Next: UnrecognizedActionError, „Server Action
// … was not found on the server“). Dann die Seite einmal neu laden; gegen Schleifen über einen
// Zeitstempel in sessionStorage abgesichert. Klappt das nicht: Hinweis mit Knopf (components/neue-version.tsx).
//
// Navigationen in alten Tabs fängt Next selbst ab (deploymentId in next.config.ts → harter Reload).

export const NEUE_VERSION_EVENT = "pg:neue-version";
export const NEUE_VERSION_TEXT = "Es gibt eine neue Version. Bitte laden Sie die Seite neu.";

const KEY = "pg-neue-version-reload";
/** Innerhalb dieser Zeit kein zweiter automatischer Reload (sonst Schleife). */
export const RELOAD_GUARD_MS = 60_000;

export function isNewVersionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "UnrecognizedActionError") return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /Server Action ".*" was not found on the server|Failed to find Server Action/i.test(msg);
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
  } catch {
    return false;
  }
  (opts.reload ?? (() => window.location.reload()))();
  return true;
}

/** Fehler einer Server Action melden: neu laden oder Hinweis zeigen. true = war eine neue Version. */
export function handleNewVersionError(err: unknown): boolean {
  if (!isNewVersionError(err)) return false;
  if (!reloadForNewVersion()) window.dispatchEvent(new Event(NEUE_VERSION_EVENT));
  return true;
}
