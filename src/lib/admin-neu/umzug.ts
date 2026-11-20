// Umzug alter Admin-Adressen in den neuen Admin (/admin/neu/…).
//
// AKTIV seit dem Admin-Umbau 20.11.2026 (Auftrag Ole 19.11.: „der neue Admin ist DER Admin“): Die alte Oberfläche ist
// entfernt. Jede alte Adresse leitet dauerhaft (308) auf ihr Gegenstück (src/middleware.ts), Push-Ziele werden schon beim
// Senden umgeschrieben (push-ziel.ts). Die Tabelle bleibt für alte Lesezeichen, Mails und bereits verschickte Pushes.
//
// Die Tabelle entsteht aus `alt` der Seiten in navigation.ts; Sonderfälle (auch die früheren Weiterleitungen aus
// next.config.ts und lib/admin-bereiche.ts) stehen in EXTRA.
// Reine Daten (keine Importe außer navigation.ts), damit sie auch in der Middleware läuft.

import { SEITEN } from "./navigation";

export const UMZUG_AKTIV = true;

export type Umzug = { alt: string; neu: string; fertig: boolean; hinweis?: string };

/** Alte Adressen ohne eigene neue Seite (oder mit Suchparametern), von Hand. Gehen der Tabelle aus navigation.ts vor. */
const EXTRA: Omit<Umzug, "fertig">[] = [
  { alt: "/admin", neu: "/admin/neu", hinweis: "Start" },
  { alt: "/admin/vertrieb/kunden", neu: "/admin/neu/kunden", hinweis: "Doppelung entfällt" },
  { alt: "/admin/buyers", neu: "/admin/neu/kunden", hinweis: "Logins je Kunde in der Kundenakte, Suche findet Logins" },
  // Früher in next.config.ts weitergeleitet (Admin-Makeover 14. und 16.11.2026)
  { alt: "/admin/vertrieb", neu: "/admin/neu/vertrieb", hinweis: "Vertrieb-Übersicht: Kennzahlen, Termine, Pipeline" },
  { alt: "/admin/vertrieb/aufgaben", neu: "/admin/neu/vertrieb/aufgaben", hinweis: "Aufgaben" },
  { alt: "/admin/vertrieb/linkedin", neu: "/admin/neu/marketing", hinweis: "LinkedIn liegt unter Marketing" },
  { alt: "/admin/vertrieb/empfehlungen", neu: "/admin/neu/marketing/empfehlungen", hinweis: "Empfehlungen liegen unter Marketing" },
  { alt: "/admin/vertrieb/unterlagen", neu: "/admin/neu/marketing/unterlagen", hinweis: "Unterlagen liegen unter Marketing" },
  { alt: "/admin/vertrieb/unterlagen/praesentation/[audience]", neu: "/admin/neu/marketing/unterlagen/praesentation/[audience]", hinweis: "Unterlagen liegen unter Marketing" },
];

// Gleiche Escape-Regel wie in navigation.ts (Pfade mit [id] als Muster)
const muster = (pfad: string) => new RegExp(`^${pfad.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[a-z]+\]/gi, "([^/]+)")}$`);

/** Vollständige Zuordnungstabelle alt → neu (erste Fundstelle gewinnt; Muster mit [id]). */
export const UMZUG: Umzug[] = (() => {
  const seen = new Set<string>();
  const out: Umzug[] = [];
  for (const e of EXTRA) {
    if (seen.has(e.alt)) continue;
    seen.add(e.alt);
    const ziel = SEITEN.find((s) => s.pfad === e.neu);
    out.push({ ...e, fertig: !!ziel?.fertig });
  }
  for (const s of SEITEN) {
    for (const alt of s.alt) {
      if (seen.has(alt)) continue;
      seen.add(alt);
      out.push({ alt, neu: s.pfad, fertig: !!s.fertig });
    }
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
  const akte = kundeWhatsApp(pfad, rest, nurFertige);
  if (akte) return akte;
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

/**
 * WhatsApp-Einstellungen eines Kunden (/admin/whatsapp/settings?kunde=<id>, ?c=<id> oder #kunde-<id>) gehören im neuen
 * Admin in die Kundenakte, Reiter WhatsApp (?wa= bleibt für die Rückmeldung). Ohne Kunde: Einstellungen → WhatsApp.
 */
function kundeWhatsApp(pfad: string, rest: string, nurFertige: boolean): string | null {
  if (pfad !== "/admin/whatsapp/settings") return null;
  const [anfrage, anker = ""] = rest.split("#");
  const q = new URLSearchParams(anfrage.replace(/^\?/, ""));
  const kunde = q.get("kunde") ?? q.get("c") ?? /^kunde-(.+)$/.exec(anker)?.[1] ?? null;
  if (!kunde || !/^[A-Za-z0-9_-]+$/.test(kunde)) return null;
  const ziel = SEITEN.find((s) => s.pfad === "/admin/neu/kunden/[id]/whatsapp");
  if (!ziel || (nurFertige && !ziel.fertig)) return null;
  const wa = q.get("wa");
  return `/admin/neu/kunden/${kunde}/whatsapp${wa ? `?wa=${encodeURIComponent(wa)}` : ""}`;
}
