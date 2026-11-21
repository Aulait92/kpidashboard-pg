// Fester Video-Link für Videotermine (Ole, 20./21.11.2026): Prüfung gemeinsam für Einrichtung, Kalender und Admin.
// Links zu einem einzelnen Webex-Meeting (…/meeting/download/<ID>?MTID=…, j.php?MTID=…) verfallen nach dem Termin und
// werden abgelehnt; gebraucht wird der persönliche Raum (…/meet/vorname.nachname).

export const VIDEO_LINK_BEISPIEL = "https://allianz.webex.com/meet/vorname.nachname";

/** Link zu einem einzelnen, geplanten Webex-Meeting statt zum persönlichen Raum? (rein) */
export function istEinzelMeetingLink(url: string): boolean {
  return /webex\.com/i.test(url) && /\/meeting\/download\/|[?&]MTID=|\/j\.php|\/wbxmjs\/joinservice\//i.test(url);
}

/** Eingabe prüfen und normalisieren: leer = entfernen (null). (rein) */
export function pruefeVideoLink(raw: string): { ok: true; url: string | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, url: null };
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return { ok: false, error: `Bitte den ganzen Link einfügen, z. B. ${VIDEO_LINK_BEISPIEL}.` };
  if (istEinzelMeetingLink(url))
    return { ok: false, error: "Das ist der Link zu einem einzelnen Meeting, er verfällt danach. Bitte den Link Ihres persönlichen Raums nehmen, er endet auf /meet/vorname.nachname." };
  return { ok: true, url };
}
