// Umzug alter Admin-Adressen in den neuen Admin (/admin/neu/…).
//
// NOCH NICHT AKTIV: Die alten Seiten leiten erst nach Oles Abnahme um (dann UMZUG_AKTIV = true und
// die Weiterleitung in src/middleware.ts einbauen). Bis dahin nutzt nur die neue Oberfläche die Tabelle:
// Links auf alte Seiten führen innerhalb der neuen Oberfläche schon auf fertige neue Seiten (`fertig` in navigation.ts).
//
// Die Tabelle entsteht aus `alt` der Seiten in navigation.ts, dazu die schon heute weitergeleiteten Adressen
// (ADMIN_WEITERLEITUNGEN, Ziel wie deren Ziel); Sonderfälle stehen in EXTRA.
// Reine Daten (keine Importe außer navigation.ts und admin-bereiche.ts), damit sie später auch in der Middleware läuft.

import { ADMIN_WEITERLEITUNGEN } from "../admin-bereiche";
import { SEITEN } from "./navigation";

export const UMZUG_AKTIV = false;

export type Umzug = { alt: string; neu: string; fertig: boolean; hinweis?: string };

/** Alte Adressen ohne eigene neue Seite (oder mit Suchparametern), von Hand. */
const EXTRA: Omit<Umzug, "fertig">[] = [
  { alt: "/admin", neu: "/admin/neu", hinweis: "Start" },
  { alt: "/admin/vertrieb/kunden", neu: "/admin/neu/kunden", hinweis: "Doppelung entfällt" },
  { alt: "/admin/buyers", neu: "/admin/neu/kunden", hinweis: "Logins je Kunde in der Kundenakte, Suche findet Logins" },
];

// Gleiche Escape-Regel wie in navigation.ts (Pfade mit [id] als Muster)
const muster = (pfad: string) => new RegExp(`^${pfad.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[a-z]+\]/gi, "([^/]+)")}$`);

/** Vollständige Zuordnungstabelle alt → neu (erste Fundstelle gewinnt; Muster mit [id]). */
export const UMZUG: Umzug[] = (() => {
  const seen = new Set<string>();
  const out: Umzug[] = [];
  for (const s of SEITEN) {
    for (const alt of s.alt) {
      if (seen.has(alt)) continue;
      seen.add(alt);
      out.push({ alt, neu: s.pfad, fertig: !!s.fertig });
    }
  }
  // Heute schon weitergeleitet (next.config.ts): gleiches Ziel wie die Zieladresse
  for (const w of ADMIN_WEITERLEITUNGEN) {
    const ziel = out.find((u) => u.alt === w.destination.split("?")[0]);
    if (!ziel || seen.has(w.source)) continue;
    seen.add(w.source);
    out.push({ alt: w.source, neu: ziel.neu, fertig: ziel.fertig, hinweis: w.was });
  }
  for (const e of EXTRA) {
    if (seen.has(e.alt)) continue;
    seen.add(e.alt);
    const ziel = SEITEN.find((s) => s.pfad === e.neu);
    out.push({ ...e, fertig: !!ziel?.fertig });
  }
  return out;
})();

/**
 * Neue Adresse für eine alte Admin-Adresse (Suchparameter und #Anker bleiben erhalten).
 * `nurFertige`: nur, wenn die neue Seite schon gebaut ist (Standard). Sonst null.
 */
export function neuerPfad(altHref: string, { nurFertige = true }: { nurFertige?: boolean } = {}): string | null {
  const m = /^([^?#]*)(.*)$/.exec(altHref);
  if (!m) return null;
  const pfad = m[1].replace(/\/+$/, "") || "/";
  const rest = m[2];
  if (pfad.startsWith("/admin/neu")) return null;
  for (const u of UMZUG) {
    if (nurFertige && !u.fertig) continue;
    if (!u.alt.includes("[")) {
      if (u.alt === pfad) return u.neu + rest;
      continue;
    }
    const treffer = muster(u.alt).exec(pfad);
    if (!treffer) continue;
    const werte = treffer.slice(1);
    let i = 0;
    return u.neu.replace(/\[[a-z]+\]/gi, () => werte[i++] ?? "") + rest;
  }
  return null;
}
