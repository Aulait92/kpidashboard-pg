// Allianz-Vertreter-Seiten (vertretung.allianz.de/<name>) erkennen. Rein, auch im Browser nutzbar.
// Ole, 18.11.2026: Die Allianz lässt den Abruf dieser Seiten vom Server nicht zu (Cloudflare),
// deshalb holen wir dort kein Logo und bieten gleich das Hochladen an.

export const ALLIANZ_VERTRETER_HOST = "vertretung.allianz.de";

export function istAllianzVertreterSeite(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase() === ALLIANZ_VERTRETER_HOST;
  } catch {
    return false;
  }
}

/**
 * Allianz-Ausschließlichkeitsvertreter? (Einrichtung, Ole 20.11.2026: Bei der Allianz sind Microsoft 365, das
 * Veröffentlichen von Kalendern und der Abruf der Vertreter-Seite gesperrt; nur die Vertreternummer funktioniert.)
 * Nie für Makler und Mehrfachvertreter. Hinweise: Versicherer in der Erstinformation, Kundenname, gewählte Versicherer,
 * Webseite auf vertretung.allianz.de oder ein schon verbundener Allianz-Online-Kalender.
 */
export function istAllianzVertreter(o: {
  vermittlerTyp: string | null | undefined;
  versicherer?: readonly string[] | null;
  kundenName?: string | null;
  gesellschaften?: readonly string[] | null;
  webseite?: string | null;
  allianzVerbunden?: boolean;
}): boolean {
  if ((o.vermittlerTyp ?? "vertreter") !== "vertreter") return false;
  if (o.allianzVerbunden) return true;
  if ((o.versicherer ?? []).some((v) => /allianz/i.test(v))) return true;
  if ((o.gesellschaften ?? []).includes("allianz")) return true;
  if (/allianz/i.test(o.kundenName ?? "")) return true;
  return !!o.webseite && istAllianzVertreterSeite(o.webseite);
}
