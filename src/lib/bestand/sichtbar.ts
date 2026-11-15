// Bestandskunden-Modul vorerst für Kunden ausgeblendet (Ole, 15.11.2026: erst ausführlich testen).
// Reine Funktionen ohne Datenbank (auch im Browser nutzbar, testbar); Laden: lib/bestand/sichtbar-server.ts.
//
// Aus heißt: kein Menüeintrag, keine Seiten unter /buyer/bestand (Weiterleitung auf Heute), keine Tipps, Hinweise,
// Hilfe-Einträge oder Neuigkeiten zum Modul, nicht buchbar oder anfragbar, kein Halteangebot „Nur Bestand“, keine
// Kollegen-Prämie „Modul gratis“, nicht im Angebotsformular, Rechner und in der Web-Präsentation.
// Kunden mit aktivem Modul behalten es. Wieder für alle an: BESTAND_MODULE_AVAILABLE = true.

/** Modul für alle Kunden sichtbar und buchbar? (Ole, 15.11.2026: vorerst aus) */
export const BESTAND_MODULE_AVAILABLE = false;

export type BestandSichtKunde = {
  /** Modul aktiv (gebucht, kostenlos freigeschaltet oder Bestandsschutz; Zugang zu Import und Kampagnen). */
  existingCustomersEnabled: boolean;
  /** Schalter je Kunde (Admin → Abrechnung): Modul sichtbar, auch ohne Buchung (Testkunden). */
  bestandSichtbar: boolean;
};

/**
 * Sieht dieser Kunde das Modul? Verfügbar für alle ODER Admin (Vorschau) ODER Schalter an ODER Modul aktiv.
 * Ohne Kunde (nicht gefunden) nur, wenn es für alle verfügbar ist.
 */
export function bestandVisible(c: BestandSichtKunde | null | undefined, opts: { admin?: boolean } = {}): boolean {
  if (BESTAND_MODULE_AVAILABLE || opts.admin) return true;
  return !!c && (c.existingCustomersEnabled || c.bestandSichtbar);
}

/** Neuigkeiten zum Modul (ausgeblendet für Kunden ohne sichtbares Modul, nicht gelöscht). */
const BESTAND_UPDATE_IDS = new Set([
  "upd_2611_bestand_vertraege",
  "upd_2611_bestand_import_liste",
  "upd_2611_bestand_zusatzpakete",
  "upd_2611_bestand_email",
  "upd_2611_bestand_statistik",
  "upd_2611_modul_anfrage",
  "upd_2611_widerspruchshinweis",
]);

/** Gehört die Neuigkeit zum Bestandskunden-Modul? (feste Liste plus Stichworte im Titel für spätere Einträge) */
export function isBestandUpdate(u: { id: string; title: string }): boolean {
  return BESTAND_UPDATE_IDS.has(u.id) || /^Bestand\b|Bestandskunde|Bestandskampagne|Kampagnen-Nachricht/i.test(u.title);
}
