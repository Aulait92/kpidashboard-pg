// Infokarten auf der Login-Seite: Rotation und Ziel nach der Anmeldung.
// Ohne Datenbank (nur reine Daten-Imports): läuft auch in der Middleware und ist testbar.

import { ADMIN_START } from "@/lib/admin-neu/schalter";
import { neuerPfad } from "@/lib/admin-neu/umzug";

/** Zähler der Rotation (je Browser): bei jedem Aufruf der Login-Seite +1. */
export const LOGIN_CARD_COOKIE = "pg_login_karte";
/** Middleware → Login-Seite: aktueller Zählerstand. */
export const LOGIN_CARD_HEADER = "x-login-karte";

const MAX_COUNTER = 1_000_000;

/** Gespeicherter Zählerstand oder null (fehlt/ungültig). */
export function parseCardCounter(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,7}$/.test(raw)) return null;
  const n = Number(raw);
  return n < MAX_COUNTER ? n : null;
}

/** Nächster Zählerstand: +1, ohne Cookie zufällig (damit nicht alle mit derselben Karte starten). */
export function nextCardCounter(raw: string | null | undefined, random: () => number = Math.random): number {
  const n = parseCardCounter(raw);
  if (n === null) return Math.floor(random() * 1000);
  return (n + 1) % MAX_COUNTER;
}

/** Karte für diesen Aufruf: aktive Karten in Reihenfolge, reihum nach Zählerstand. */
export function pickCard<T>(cards: readonly T[], counter: number): T | null {
  if (!cards.length) return null;
  const i = ((Math.floor(counter) % cards.length) + cards.length) % cards.length;
  return cards[i] ?? null;
}

/** Link der Karte auf der Login-Seite: zählt den Klick und leitet weiter. */
export function cardClickHref(id: string): string {
  return `/api/login-info/klick?id=${encodeURIComponent(id)}`;
}

const BASE = "https://intern.invalid";

/** Nur Pfade innerhalb der App („/buyer/bestand“), sonst null: keine offenen Weiterleitungen. */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.length > 500) return null;
  // Backslash (/\evil.de), Steuerzeichen und Leerraum: Browser lesen das teils als fremden Host
  if (/[\\\s]/.test(s) || [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  try {
    const u = new URL(s, BASE);
    if (u.origin !== BASE) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * Bereiche des Kundenbereichs nur für Inhaber (die Seiten leiten Berater sonst
 * stumm auf /buyer um). Erstes Segment nach /buyer/.
 */
export const OWNER_ONLY_SECTIONS = ["konto", "empfehlen", "empfehlungen", "bestand", "bestellen", "team", "zahlen", "wachstum", "einrichtung"] as const;

/** Startseite für Berater mit Hinweis „Fragen Sie Ihren Inhaber“ (components/inhaber-hinweis.tsx). */
export const ADVISOR_BLOCKED_TARGET = "/buyer?hinweis=inhaber";

export type LoginWho = {
  role: "ADMIN" | "BUYER";
  /** Kundenbereich: owner = Inhaber, advisor = Berater */
  teamRole?: string | null;
  /** Admin hat eine Kunden-Vorschau offen (nur dann ist /buyer für ihn sichtbar). */
  preview?: boolean;
};

export function homeFor(who: LoginWho): string {
  return who.role === "BUYER" ? "/buyer" : ADMIN_START;
}

/** Ziel nach der Anmeldung: der gewünschte Pfad, wenn der Nutzer ihn sehen darf, sonst seine Startseite. */
export function loginTarget(who: LoginWho, next: unknown): string {
  const home = homeFor(who);
  const path = safeInternalPath(next);
  if (!path || path === "/login" || path.startsWith("/login?") || path.startsWith("/api/")) return home;
  const buyerArea = /^\/buyer(?=$|[/?#])/.test(path);
  if (who.role === "BUYER") {
    if (!buyerArea) return home;
    const section = /^\/buyer\/([^/?#]+)/.exec(path)?.[1] ?? "";
    if (who.teamRole === "advisor" && (OWNER_ONLY_SECTIONS as readonly string[]).includes(section)) return ADVISOR_BLOCKED_TARGET;
    return path;
  }
  // Admin: Kundenbereich nur mit offener Vorschau, sonst Admin-Startseite; alte Admin-Adressen führen auf ihr Gegenstück
  if (buyerArea && !who.preview) return home;
  return neuerPfad(path) ?? path;
}
