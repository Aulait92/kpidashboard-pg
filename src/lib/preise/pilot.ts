// Beiträge rechnen (Pilot Allianz, Ole 16.11.2026; Machbarkeit und Entscheidung: docs/preise-pilot.md).
//
// Eine automatische Abfrage der Allianz-Rechner gibt es nicht: Die Nutzungsbedingungen von allianz.de verbieten das
// systematische Auslesen und Speichern von Preisen, die Schnittstellen sind zudem geschützt. Deshalb die Rückfall-Variante:
// offiziellen Rechner öffnen, Angaben aus dem Lead kopieren, Ergebnis über „Angebot ablegen“ einlesen. So gelesene
// Beiträge sind ein Richtwert („bitte prüfen“), bis der Vermittler sie bestätigt.
//
// Reine Funktionen (auch im Browser). Schalter laden und speichern: lib/preise/pilot-server.ts.

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
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

const formWert = (d: VorbereitungDaten, re: RegExp) => d.formular.find((f) => re.test(f.label))?.value?.replace(/\s+/g, " ").trim() || null;

/** Nur die Postleitzahl (Datensparsamkeit: die Straße braucht nur der Wohngebäude-Rechner). */
export function plzAus(...texte: (string | null | undefined)[]): string | null {
  for (const t of texte) {
    const m = t?.match(/\b\d{5}\b/);
    if (m) return m[0];
  }
  return null;
}

/**
 * Die Angaben, die der offizielle Rechner der Sparte fragt, aus Lead, Formular und Angaben des Assistenten.
 * Bewusst nicht dabei: Namen, Telefonnummer, E-Mail und Gesundheitsangaben zu Menschen. Fehlt eine Angabe, ist der
 * Wert null (die Oberfläche zeigt „im Termin klären“).
 */
export function rechnerAngaben(d: VorbereitungDaten, sparte: string): RechnerAngabe[] {
  const a = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const q = (k: QualificationKey): string | null => a[k]?.replace(/\s+/g, " ").trim() || null;
  const adresse = d.lead.adresse ?? formWert(d, /adresse|anschrift/i);
  const plz = plzAus(formWert(d, /postleitzahl|\bplz\b/i), adresse);
  const geburt = q("geburt");
  const leben = formWert(d, /lebenssituation|familienstand/i) ?? q("lebenssituation");
  const tierTeile = (art: string) => {
    const geburtTier = [formWert(d, /geburtsmonat/i), formWert(d, /geburtsjahr/i)].filter(Boolean).join(" ") || formWert(d, /geburtsdatum.*tier|alter.*tier/i);
    return [
      { label: "Tierart", wert: formWert(d, /tierart/i) ?? art },
      { label: "Rasse", wert: formWert(d, /rasse/i) },
      { label: "Geburtsmonat und -jahr des Tieres", wert: geburtTier },
      { label: "Geschlecht des Tieres", wert: formWert(d, /geschlecht/i) },
    ];
  };

  switch (sparte) {
    case "katze-kranken":
    case "katze-op":
      return [{ label: "Postleitzahl", wert: plz }, ...tierTeile("Katze"), { label: "Haltung (Wohnung oder Freigänger)", wert: formWert(d, /haltung/i) }];
    case "hund-kranken":
    case "hund-op":
      return [{ label: "Postleitzahl", wert: plz }, ...tierTeile("Hund")];
    case "haftpflicht":
      return [
        { label: "Geburtsdatum", wert: geburt },
        { label: "Familienstand (Single, Paar, Familie)", wert: leben },
        { label: "Postleitzahl", wert: plz },
        { label: "Öffentlicher Dienst", wert: q("beruf") },
      ];
    case "hausrat":
      return [
        { label: "Postleitzahl", wert: plz },
        { label: "Wohnfläche", wert: q("wohnflaeche") },
        { label: "Geburtsdatum", wert: geburt },
      ];
    case "rechtsschutz":
      return [
        { label: "Geburtsdatum", wert: geburt },
        { label: "Familienstand (Single, Paar, Familie)", wert: leben },
        { label: "Lebensbereiche", wert: q("bereiche") },
        { label: "Beruf", wert: q("beruf") },
      ];
    case "wohngebaeude":
      return [
        { label: "Adresse des Gebäudes", wert: adresse ?? plz },
        { label: "Gebäude (Fläche, Baujahr, Einheiten, Bauweise)", wert: q("gebaeude") },
      ];
    case "unfall":
      return [
        { label: "Wer versichert werden soll", wert: q("versichern") },
        { label: "Geburtsdatum", wert: geburt },
        { label: "Beruf", wert: q("beruf") },
      ];
    case "tierhalter-hund":
      return [
        { label: "Postleitzahl", wert: plz },
        { label: "Hunderasse", wert: formWert(d, /rasse/i) },
        { label: "Hunde (Anzahl, je Hund)", wert: formWert(d, /anzahl tiere/i) ?? q("tier") },
      ];
    case "tierhalter-pferd":
      return [
        { label: "Postleitzahl", wert: plz },
        { label: "Pferde (Anzahl, Rasse, Nutzung)", wert: formWert(d, /anzahl tiere/i) ?? q("tier") },
      ];
    default:
      return [];
  }
}

// ─── Richtwert „bitte prüfen“ ──────────────────────────────────────────────────────────────

/** Etikett an einem nicht bestätigten Beitrag: „Aus dem Angebot gelesen, Stand 16.11. 10:12, bitte prüfen“. */
export function pruefEtikett(p: { quelle: string; am: string }): string {
  const d = new Date(p.am);
  if (Number.isNaN(d.getTime())) return `${p.quelle}, bitte prüfen`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);
  const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${p.quelle}, Stand ${tag} ${uhr}, bitte prüfen`;
}
