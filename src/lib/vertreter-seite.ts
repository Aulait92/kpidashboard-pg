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
