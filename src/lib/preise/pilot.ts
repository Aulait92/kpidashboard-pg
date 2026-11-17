// Beiträge rechnen (Pilot Allianz, Ole 16.11.2026; Machbarkeit und Entscheidung: docs/preise-pilot.md).
//
// Eine automatische Abfrage der Allianz-Rechner gibt es nicht: Die Nutzungsbedingungen von allianz.de verbieten das
// systematische Auslesen und Speichern von Preisen, die Schnittstellen sind zudem geschützt. Deshalb die Rückfall-Variante:
// im eigenen Vertriebssystem rechnen (Ole, 16.11.2026; öffentlicher Rechner als zweite Wahl), Angaben aus dem Lead
// kopieren, Ergebnis über „Angebot ablegen“ einlesen. So gelesene
// Beiträge sind ein Richtwert („bitte prüfen“), bis der Vermittler sie bestätigt.
//
// Reine Funktionen (auch im Browser). Schalter laden und speichern: lib/preise/pilot-server.ts.

import { angabenFuerSparte, plzAus } from "@/lib/preise/rechner-angaben";

export { plzAus };
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

/** Offizielle Rechner je Gesellschaft und Sparte (Schlüssel wie im Tarifkatalog). */
export const RECHNER: Record<string, Record<string, string>> = {
  allianz: {
    "katze-kranken": "https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=katze",
    "katze-op": "https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=katze",
    "hund-kranken": "https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=hund",
    "hund-op": "https://www.allianz.de/gesundheit/tierkrankenversicherung/rechner/#tier=hund",
    haftpflicht: "https://www.allianz.de/recht-und-eigentum/privat-haftpflichtversicherung/rechner/",
    hausrat: "https://www.allianz.de/recht-und-eigentum/hausratversicherung/rechner/",
    rechtsschutz: "https://www.allianz.de/recht-und-eigentum/rechtsschutzversicherung/rechner/",
    wohngebaeude: "https://www.allianz.de/recht-und-eigentum/wohngebaeudeversicherung/rechner/",
    unfall: "https://www.allianz.de/vorsorge/unfallversicherung/rechner/",
    "tierhalter-hund": "https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/rechner/#tier=hund",
    "tierhalter-pferd": "https://www.allianz.de/recht-und-eigentum/tierhalterhaftpflicht/rechner/#tier=pferd",
  },
};

/** Alle Pilot-Schlüssel „<gesellschaft>/<sparte>“ in fester Reihenfolge (Admin-Liste). */
export const PILOT_SCHLUESSEL: string[] = Object.entries(RECHNER).flatMap(([g, s]) => Object.keys(s).map((k) => `${g}/${k}`));

export const pilotSchluessel = (gesellschaft: string, sparte: string) => `${gesellschaft}/${sparte}`;

/** Gespeicherte Liste defensiv lesen: nur bekannte Schlüssel, ohne Doppelte. */
export function cleanPilot(v: unknown): string[] {
  const roh = Array.isArray(v) ? v : [];
  return PILOT_SCHLUESSEL.filter((k) => roh.includes(k));
}

/** Rechner-Adresse, wenn der Pilot für Gesellschaft und Sparte an ist; sonst null (Standard: aus). */
export function rechnerUrl(aktiv: readonly string[], gesellschaft: string | null | undefined, sparte: string): string | null {
  if (!gesellschaft) return null;
  const url = RECHNER[gesellschaft]?.[sparte];
  return url && aktiv.includes(pilotSchluessel(gesellschaft, sparte)) ? url : null;
}

// ─── Angaben für den Rechner ────────────────────────────────────────────────────────────────

export type RechnerAngabe = { label: string; wert: string | null };

/**
 * Die Angaben, die der offizielle Rechner der Sparte fragt, aus Lead, Formular und Angaben des Assistenten. Quelle je
 * Sparte: lib/preise/rechner-angaben.ts (dieselbe wie für die Folgefragen des Assistenten). Bewusst nicht dabei: Namen,
 * Telefonnummer, E-Mail und Gesundheitsangaben zu Menschen. Fehlt eine Angabe, ist der Wert null (die Oberfläche zeigt
 * „im Termin klären“).
 */
export function rechnerAngaben(d: VorbereitungDaten, sparte: string): RechnerAngabe[] {
  return angabenFuerSparte({ formular: d.formular, angaben: d.angaben, adresse: d.lead.adresse }, sparte).map(({ label, wert }) => ({ label, wert }));
}

/**
 * Alle bekannten Angaben als Text zum Einfügen im eigenen Vertriebssystem (Knopf „In Ihrem Allianz-System berechnen“,
 * Ole 16.11.2026): eine Zeile je Angabe, fehlende weggelassen; null, wenn keine Angabe bekannt ist.
 */
export function angabenText(angaben: RechnerAngabe[]): string | null {
  const zeilen = angaben.filter((a) => a.wert).map((a) => `${a.label}: ${a.wert}`);
  return zeilen.length ? zeilen.join("\n") : null;
}

// ─── Richtwert „bitte prüfen“──────────────────────────────────────────────────────────────

/** Etikett an einem nicht bestätigten Beitrag: „Aus dem Angebot gelesen, Stand 16.11. 10:12, bitte prüfen“. */
export function pruefEtikett(p: { quelle: string; am: string }): string {
  const d = new Date(p.am);
  if (Number.isNaN(d.getTime())) return `${p.quelle}, bitte prüfen`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);
  const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${p.quelle}, Stand ${tag} ${uhr}, bitte prüfen`;
}
