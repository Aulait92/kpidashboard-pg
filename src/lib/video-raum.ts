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

// Videoraum-Pflicht (Go-live-Prüfung Einrichtung, 22.11.2026): Meet- bzw. Teams-Links entstehen nur mit verbundenem
// Google- bzw. Microsoft-Kalender. App-Kalender, Kalender-Link (ICS), Allianz-Online-Kalender oder der Ausweg
// „Mein Versicherer erlaubt das nicht“ liefern keinen Raum, dann muss ein fester Link her.

export type KalenderVerbindung = { status: string; provider: string } | null | undefined;

/** Erstellt der verbundene Kalender selbst Meet- bzw. Teams-Links? (rein) */
export function meetOderTeams(conn: KalenderVerbindung): boolean {
  return conn?.status === "connected" && (conn.provider === "google" || conn.provider === "microsoft");
}

/** Braucht es einen festen Video-Link? Ja, solange weder Google noch Microsoft verbunden ist. (rein) */
export function videoLinkNoetig(conn: KalenderVerbindung): boolean {
  return !meetOderTeams(conn);
}

/**
 * Woher der Videoraum kommt (Hinweis am Video-Link, Ole 26.11.2026): google/microsoft = automatisch je Termin,
 * ohne = App-Kalender, Allianz, Kalender-Link oder übersprungen (Link nötig), offen = noch kein Weg gewählt. (rein)
 */
export type VideoWeg = "offen" | "ohne" | "google" | "microsoft";
export function videoWeg(o: { verbindung: KalenderVerbindung; hasIcs?: boolean; allianz?: boolean; uebersprungen?: boolean }): VideoWeg {
  if (meetOderTeams(o.verbindung)) return o.verbindung!.provider as "google" | "microsoft";
  const app = o.verbindung?.status === "connected" && o.verbindung.provider === "app";
  return app || o.hasIcs || o.allianz || o.uebersprungen ? "ohne" : "offen";
}

/** Hinweis unter „Ihr Link für Videotermine“: Text und ob er als Aufforderung (gelb) erscheint. (rein) */
export function videoLinkHinweis(weg: VideoWeg, hatLink: boolean, teamsLinkFehlt = false): { text: string; dringend: boolean } {
  if (weg === "microsoft" && teamsLinkFehlt && !hatLink)
    return { text: "Für Ihre Termine konnte kein Teams-Link erstellt werden. Bitte tragen Sie hier Ihren Videolink ein.", dringend: true };
  if (hatLink) return { text: "Diesen Link bekommen Ihre Kunden für jeden Videotermin.", dringend: false };
  if (weg === "ohne") return { text: "Bitte eintragen: Ohne Link haben Videotermine keinen Raum.", dringend: true };
  if (weg === "google") return { text: "Leer lassen, dann erstellen wir für jeden Termin einen Meet-Link.", dringend: false };
  if (weg === "microsoft")
    return { text: "Leer lassen, dann erstellen wir für jeden Termin einen Teams-Link. Das klappt nur mit einer Teams-Lizenz, sonst bitte Ihren Link eintragen.", dringend: false };
  return { text: "Mit Google oder Microsoft erstellen wir den Videoraum automatisch. Ohne diese tragen Sie hier Ihren Link ein, zum Beispiel Webex.", dringend: false };
}
