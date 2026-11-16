// Bereiche der Admin-Oberfläche (Ole, 16.11.2026, Admin-Makeover Runde 2):
// Heute, Vertrieb, Kunden, Chats, Zahlen in der Leiste; Einstellungen im Profilmenü.
// Welche Adresse zu welchem Bereich gehört und welche alten Adressen weiterleiten,
// steht nur hier (Menü, Kopfzeile, Weiterleitungen in next.config.ts, Test).

export type AdminBereich = "Heute" | "Vertrieb" | "Kunden" | "Chats" | "Zahlen" | "Einstellungen";

/** Seiten, die über Einstellungen erreicht werden (Menü: „Einstellungen“ markiert). */
const EINSTELLUNGEN = ["/admin/einstellungen", "/admin/lead-eingang", "/admin/whatsapp/settings", "/admin/vertrieb/import", "/admin/buyers"];
/** Laufende Kosten sind eine Einstellung, gehören aber inhaltlich zu Zahlen (Link aus Zahlen). */
const ZAHLEN_AUSNAHMEN = ["/admin/einstellungen/kosten"];

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);

/** Bereich einer Admin-Adresse (null = keiner, z. B. Login). */
export function adminBereich(pathname: string): AdminBereich | null {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (ZAHLEN_AUSNAHMEN.some((b) => under(p, b))) return "Zahlen";
  if (EINSTELLUNGEN.some((b) => under(p, b))) return "Einstellungen";
  if (under(p, "/admin/heute")) return "Heute";
  if (under(p, "/admin/vertrieb") || under(p, "/admin/marketing")) return "Vertrieb";
  if (
    under(p, "/admin/kunden") ||
    under(p, "/admin/leads") ||
    under(p, "/admin/ppl") ||
    under(p, "/admin/media-buyer") ||
    under(p, "/admin/monatsberichte") ||
    under(p, "/admin/optimierung")
  )
    return "Kunden";
  if (under(p, "/admin/whatsapp")) return "Chats";
  if (p === "/" || under(p, "/admin/zahlen") || under(p, "/admin/nutzung")) return "Zahlen";
  return null;
}

/**
 * Alte Adressen, die es als eigene Seite nicht mehr gibt. Weiterleitung in next.config.ts
 * (vorübergehend, 307; Suchparameter wie ?view=done&type=ANRUF werden mitgenommen).
 * Lesezeichen, Push-Mitteilungen und alte E-Mails an Ole funktionieren damit weiter.
 */
export const ADMIN_WEITERLEITUNGEN: { source: string; destination: string; was: string }[] = [
  { source: "/admin/vertrieb", destination: "/admin/heute?bereich=vertrieb", was: "Vertrieb-Übersicht: Kennzahlen, Termine, Pipeline stehen auf Heute (Karte „Vertrieb“)" },
  { source: "/admin/vertrieb/aufgaben", destination: "/admin/heute/aufgaben", was: "Aufgaben: Reiter „Aufgaben“ in Heute" },
];
