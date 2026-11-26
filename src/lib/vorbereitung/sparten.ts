// Fragen je Sparte für die Terminvorbereitung im Chat (Engine: lib/vorbereitung/fragen.ts).
//
// WICHTIG (Ole, 26.11.2026): Die endgültigen Felder je Sparte kommen aus den Allianz-Onlinerechnern
// (docs/vertrieb/allianz-rechner-felder/, wird in einer anderen Sitzung erfasst). Hier steht bis dahin nur eine kleine
// VORLÄUFIGE Beispiel-Definition für Privatschutz, damit das Gerüst getestet werden kann. vorlaeufig: true heißt: im
// Betrieb aus (aktiveSparten), nur in Tests bzw. mit VORBEREITUNG_FRAGEN_VORLAEUFIG=1. Neue Sparte eintragen:
//   { sparte: "<Schlüssel wie in lib/preise/rechner-angaben.ts>", label, vorlaeufig: false, fragen: [
//       { key, typ: "knoepfe" | "liste" | "zahl" | "datum" | "versicherer" | "zusammengesetzt", pflicht,
//         frage: { sie, du }, label, feld (Angabe in der Terminvorbereitung), optionen | teile | min/max/einheit,
//         formular (Formularfeld, das die Frage schon beantwortet), bekanntWenn, geteilt, anhaengen } ] }
// Regeln: Pflichtfelder für den Beitrag zuerst (pflicht: true), optionale Bausteine danach; Knöpfe bzw. Liste, wo es
// feste Antworten gibt; Freitext nur für Zahlen, Daten und Versicherer; keine Gesundheitsfragen; Vorschäden höchstens
// der letzten 5 Jahre. Texte ohne Gedankenstriche, Sie und Du.

import type { FrageDef, SparteDef } from "@/lib/vorbereitung/fragen";

const mitversicherte: FrageDef = {
  key: "mitversicherte",
  typ: "knoepfe",
  pflicht: true,
  geteilt: true,
  label: "Wer wird mitversichert?",
  feld: "versichern",
  frage: { sie: "Wer soll mitversichert sein?", du: "Wer soll mitversichert sein?" },
  optionen: [
    { id: "single", titel: "Nur ich", wert: "Single", auch: /\b(nur ich|allein|single)\b/i },
    { id: "paar", titel: "Mit Partner", wert: "Paar", auch: /\b(partner|partnerin|paar|frau|mann|freundin|freund)\b/i },
    { id: "familie", titel: "Familie mit Kindern", wert: "Familie", auch: /\b(familie|kinder?)\b/i },
  ],
  formular: /lebenssituation|familienstand|f(ü|ue)r wen soll/i,
  bekanntWenn: true,
};

const beruf: FrageDef = {
  key: "beruf",
  typ: "knoepfe",
  pflicht: true,
  geteilt: true,
  label: "Beruf",
  feld: "beruf",
  frage: { sie: "Wie sind Sie beruflich tätig?", du: "Wie bist du beruflich tätig?" },
  optionen: [
    { id: "angestellt", titel: "Angestellt", auch: /angestellt|arbeitnehmer/i },
    { id: "selbststaendig", titel: "Selbstständig", auch: /selbst(st)?(ä|ae)ndig|freiberuf/i },
    { id: "oeffentlich", titel: "Öffentlicher Dienst", auch: /(ö|oe)ffentlich|beamt/i },
  ],
  formular: /^beruf|t(ä|a)tigkeit/i,
  bekanntWenn: true,
};

const vorvertrag = (sparte: string): FrageDef => ({
  key: "vorvertrag",
  typ: "zusammengesetzt",
  pflicht: false,
  anhaengen: true,
  label: `Bisheriger Vertrag (${sparte})`,
  feld: "vorhanden",
  frage: {
    sie: `Sind Sie bei ${sparte} schon versichert? Wenn ja: bei welcher Gesellschaft und bis wann (Monat/Jahr)?`,
    du: `Bist du bei ${sparte} schon versichert? Wenn ja: bei welcher Gesellschaft und bis wann (Monat/Jahr)?`,
  },
  teile: [
    { key: "versicherer", label: "Versicherer", typ: "versicherer" },
    { key: "ablauf", label: "Ablauf", typ: "monatJahr", pflicht: false },
  ],
  bekanntWenn: new RegExp(sparte, "i"),
});

const vorschaeden: FrageDef = {
  key: "vorschaeden",
  typ: "knoepfe",
  pflicht: false,
  geteilt: true,
  label: "Schäden in den letzten 5 Jahren",
  feld: "vorschaeden",
  bekanntWenn: true,
  frage: { sie: "Gab es in den letzten 5 Jahren Schäden?", du: "Gab es in den letzten 5 Jahren Schäden?" },
  optionen: [
    { id: "keine", titel: "Keine Schäden", wert: "keine", auch: /^(nein|keine?)\b/i },
    { id: "ja", titel: "Ja, gab es", wert: "ja (Einzelheiten im Termin)", auch: /^(ja|einen|zwei|mehrere)\b/i },
  ],
};

/** VORLÄUFIG (Beispiel für das Gerüst, nicht aus den Allianz-Rechnern). */
export const SPARTEN_DEFINITIONEN: SparteDef[] = [
  { sparte: "haftpflicht", label: "Haftpflicht", vorlaeufig: true, fragen: [mitversicherte, beruf, vorvertrag("Haftpflicht"), vorschaeden] },
  {
    sparte: "hausrat",
    label: "Hausrat",
    vorlaeufig: true,
    fragen: [
      mitversicherte,
      {
        key: "wohnung",
        typ: "zusammengesetzt",
        pflicht: true,
        label: "Wohnfläche und Baujahr",
        feld: "wohnflaeche",
        frage: { sie: "Wie groß ist Ihre Wohnung und wann wurde das Haus ungefähr gebaut? Zum Beispiel: 75 qm, 1990", du: "Wie groß ist deine Wohnung und wann wurde das Haus ungefähr gebaut? Zum Beispiel: 75 qm, 1990" },
        teile: [
          { key: "flaeche", label: "Wohnfläche", typ: "zahl", min: 10, max: 1000, einheit: "m²" },
          { key: "baujahr", label: "Baujahr", typ: "zahl", min: 1800, max: 2100, pflicht: false },
        ],
        formular: /wohnfl(ä|a)che/i,
        bekanntWenn: true,
      },
      vorvertrag("Hausrat"),
      vorschaeden,
    ],
  },
  { sparte: "rechtsschutz", label: "Rechtsschutz", vorlaeufig: true, fragen: [mitversicherte, beruf, vorvertrag("Rechtsschutz")] },
  {
    sparte: "wohngebaeude",
    label: "Wohngebäude",
    vorlaeufig: true,
    fragen: [
      {
        key: "gebaeude",
        typ: "zusammengesetzt",
        pflicht: true,
        label: "Wohnfläche und Baujahr des Hauses",
        feld: "gebaeude",
        frage: { sie: "Wie groß ist das Haus und wann wurde es ungefähr gebaut? Zum Beispiel: 140 qm, 1985", du: "Wie groß ist das Haus und wann wurde es ungefähr gebaut? Zum Beispiel: 140 qm, 1985" },
        teile: [
          { key: "flaeche", label: "Wohnfläche", typ: "zahl", min: 20, max: 2000, einheit: "m²" },
          { key: "baujahr", label: "Baujahr", typ: "zahl", min: 1800, max: 2100 },
        ],
        bekanntWenn: true,
      },
      vorvertrag("Wohngebäude"),
      vorschaeden,
    ],
  },
];

/** Vorläufige Definitionen zulassen? Nur mit Schalter (Tests, Testkunde), sonst nur endgültige. */
export function vorlaeufigeErlaubt(env: string | undefined = process.env.VORBEREITUNG_FRAGEN_VORLAEUFIG): boolean {
  return env === "1";
}

/** Definitionen, die im Chat gefragt werden (vorläufige nur mit Schalter). */
export function aktiveSparten(defs: readonly SparteDef[] = SPARTEN_DEFINITIONEN, vorlaeufig = vorlaeufigeErlaubt()): SparteDef[] {
  return defs.filter((d) => vorlaeufig || !d.vorlaeufig);
}
