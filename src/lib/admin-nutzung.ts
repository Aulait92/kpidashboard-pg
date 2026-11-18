// Nutzungsmessung im Admin (Ole, 18.11.2026; docs/ux/admin-neu/nutzungs-audit-2026-11-17.md, Abschnitt „Vorschlag“).
// Reine Hilfen ohne Datenbank, im Browser (components/admin/nutzung-messung.tsx) und auf dem Server
// (lib/admin-nutzung-server.ts) gleich: Pfad normalisieren, Funktions-IDs aus data-funktion lesen, Ereignisse prüfen.
//
// Gemessen werden nur (a) Seitenaufrufe unter /admin (und die alte Startseite „/“ der Admins) und (b) Klicks auf
// bedienbare Elemente innerhalb eines Elements mit data-funktion (IDs aus docs/ux/admin-neu/funktionsinventar.json).
// Keine Inhalte, keine Suchbegriffe, keine Query-Parameter, IDs in Pfaden werden zu „:id“.

export type AdminNutzungArt = "seite" | "funktion" | "gruppe";
export type Oberflaeche = "alt" | "neu";

/** Ereignis, wie es der Browser schickt: Art, Schlüssel, Oberfläche, Zeitpunkt (ms, Uhr des Browsers). */
export type AdminNutzungEreignis = { a: AdminNutzungArt; k: string; o: Oberflaeche; t: number };

export const ADMIN_NUTZUNG_ROUTE = "/api/admin/nutzung";
/** Gleicher Schlüssel innerhalb dieser Zeit zählt nur einmal (Doppelklick, doppelter Effekt beim Seitenwechsel). */
export const DEDUPE_MS = 1000;
/** Höchstens so viele Ereignisse je Sendung (der Browser schickt spätestens alle 15 s). */
export const MAX_JE_SENDUNG = 50;
/** Ein Element mit mehreren Funktionen (Gruppe): höchstens so viele IDs je Klick. */
export const MAX_IDS_JE_GRUPPE = 20;

const WORT = /^[a-z]+(?:-[a-z]+)*$/;
const FUNKTIONS_ID = /^[a-z0-9]+(?:-{1,2}[a-z0-9]+)*$/;

/** Seite des Admins? Alles unter /admin und die alte Startseite „/“ (Zahlen) der Admins. */
export function istAdminPfad(pfad: string): boolean {
  return pfad === "/" || pfad === "/admin" || pfad.startsWith("/admin/");
}

export function oberflaecheFuer(pfad: string): Oberflaeche {
  return pfad === "/admin/neu" || pfad.startsWith("/admin/neu/") ? "neu" : "alt";
}

/**
 * Pfad ohne Query/Hash, IDs durch „:id“ ersetzt. Feste Abschnitte der Admin-Adressen sind nur Kleinbuchstaben mit
 * Bindestrich (Test prüft das gegen src/app/admin); alles andere (cuid, Zahlen, „cust_…“, „act_…“) ist eine ID.
 * Null für Pfade außerhalb des Admins (z. B. /buyer in der Vorschau „Als Kunde ansehen“).
 */
export function normalisiereAdminPfad(roh: string | null | undefined): string | null {
  if (typeof roh !== "string") return null;
  let pfad = roh.split(/[?#]/)[0] ?? "";
  if (!pfad.startsWith("/")) return null;
  pfad = pfad.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (!istAdminPfad(pfad)) return null;
  const teile = pfad.split("/").slice(1).filter(Boolean);
  if (teile.length > 10) return null;
  const norm = teile.map((t) => (t.length <= 40 && WORT.test(t) ? t : ":id"));
  return `/${norm.join("/")}`;
}

/** Funktions-IDs aus einem data-funktion-Wert (eine ID, mehrere mit Leerzeichen oder Komma getrennt). */
export function funktionsIds(wert: string | null | undefined): string[] {
  if (!wert) return [];
  const ids = wert
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 120 && FUNKTIONS_ID.test(s));
  return [...new Set(ids)].slice(0, MAX_IDS_JE_GRUPPE);
}

/** Bedienbare Elemente: nur Klicks darauf zählen (nicht ein Klick in eine leere Fläche einer Karte). */
export const BEDIENBAR =
  'a[href],button,input,select,textarea,summary,label,[role="button"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"],[role="option"],[role="link"],[tabindex]:not([tabindex="-1"])';

/**
 * Ereignisse zu einem Klick: eine ID → „funktion“, mehrere IDs am selben Element → je ID „gruppe“
 * (Klick gehört zu einer von mehreren Funktionen, welcher ist nicht bekannt).
 */
export function ereignisseFuerKlick(dataFunktion: string | null | undefined, o: Oberflaeche, t: number): AdminNutzungEreignis[] {
  const ids = funktionsIds(dataFunktion);
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ a: "funktion", k: ids[0], o, t }];
  return ids.map((k) => ({ a: "gruppe" as const, k, o, t }));
}

/**
 * Prüft und bereinigt Ereignisse (Server und Browser): nur bekannte Arten, Seiten normalisiert, Funktions-IDs im
 * Inventar-Format, gleicher Schlüssel innerhalb von 1 s nur einmal (zeitlich sortiert). `zuletzt` enthält den letzten
 * gespeicherten Zeitpunkt je Schlüssel („art|schluessel“) und wird fortgeschrieben.
 */
export function bereinige(roh: unknown[], zuletzt: Map<string, number> = new Map()): AdminNutzungEreignis[] {
  const gueltig: AdminNutzungEreignis[] = [];
  for (const r of roh.slice(0, MAX_JE_SENDUNG * 2)) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    const t = typeof e.t === "number" && Number.isFinite(e.t) ? e.t : NaN;
    if (Number.isNaN(t)) continue;
    if (e.a === "seite") {
      const k = normalisiereAdminPfad(typeof e.k === "string" ? e.k : null);
      if (k) gueltig.push({ a: "seite", k, o: oberflaecheFuer(k), t });
    } else if (e.a === "funktion" || e.a === "gruppe") {
      const k = typeof e.k === "string" ? e.k : "";
      const o = e.o === "neu" ? "neu" : e.o === "alt" ? "alt" : null;
      if (o && k.length <= 120 && FUNKTIONS_ID.test(k)) gueltig.push({ a: e.a, k, o, t });
    }
  }
  gueltig.sort((x, y) => x.t - y.t);
  const out: AdminNutzungEreignis[] = [];
  for (const e of gueltig) {
    const key = `${e.a}|${e.k}`;
    const vorher = zuletzt.get(key);
    if (vorher !== undefined && Math.abs(e.t - vorher) < DEDUPE_MS) continue;
    zuletzt.set(key, e.t);
    out.push(e);
    if (out.length >= MAX_JE_SENDUNG) break;
  }
  return out;
}
