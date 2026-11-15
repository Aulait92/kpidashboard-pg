// Öffentliche Live-Demo der Beratungspräsentation (Ole, 15.11.2026): www.dein-beratungstermin.de/demo bzw.
// app.performancegrowth.de/demo/beratung. Feste Beispieldaten im Code, keine Datenbank, nichts von echten Kunden.
// Neutrale Marke (PG-Blau), erfundene Tarifnamen, keine Logos echter Versicherer.
// Reine Funktionen: Die Demo rechnet im Browser (Stufe wählen, Bausteine an/aus), ein Neuladen setzt alles zurück.

import { bausteinSchalten, sparteSchalten, tarifWaehlen, type AngeboteDaten, type AngebotItem } from "@/lib/angebote-daten";
import { folien, praesentationCss, type Folie, type Marke } from "@/lib/praesentation";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

export const DEMO_KUNDE = "Dominik Schmid";
export const DEMO_BERATER = "Max Berger";

export const DEMO_MARKE: Marke = { name: "Max Berger Versicherungsberatung", gesellschaft: null, farbe: "#2563eb", farbeHell: "#e5edff", akzent: "#2563eb", logoUrl: null };

/** Termin und Angaben aus dem Chat (erfunden). startsAt = jetzt, damit „Schutz ab …“ immer in der Zukunft liegt. */
export function demoTermin(now = new Date()): VorbereitungDaten {
  return {
    lead: { name: DEMO_KUNDE, telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
    termin: { startsAt: now, mode: "video", berater: DEMO_BERATER, meetUrl: null },
    zusammenfassung: null,
    formular: [],
    angaben: {
      lebenssituation: "Single, zieht gerade in eine größere Mietwohnung",
      versichern: "nur Dominik",
      interesse: "Haftpflicht, Hausrat und Rechtsschutz, alles aus einer Hand",
      wohnflaeche: "68 m², ständig bewohnt",
      vorhanden: "alte Haftpflicht von 2012, sonst nichts",
    },
    vorbereitetAm: now,
  };
}

const ja = "ja";
const nein = "nein";
const m = (name: string, wert: string) => ({ name, wert });

function item(x: Partial<AngebotItem> & Pick<AngebotItem, "sparte" | "tarif" | "beitragMonat">): AngebotItem {
  return { gesellschaft: null, selbstbeteiligung: null, leistungen: [], ausschluesse: [], empfohlen: false, gewaehlt: false, merkmale: [], bausteine: [], ...x };
}

const hausratBausteine = () => [
  { name: "Fahrraddiebstahl", beitrag: 3.4, aktiv: true },
  { name: "Glasbruch", beitrag: 1.6, aktiv: false },
  { name: "Elementarschäden", beitrag: 2.9, aktiv: false },
];

/** Angebote wie aus dem Tarifrechner: Haftpflicht in 3 Stufen, Hausrat in 2, Rechtsschutz mit Baustein. */
export function demoAngebote(): AngeboteDaten {
  const haftpflicht = (tarif: string, beitrag: number, summe: string, extra: [string, string, string], empfohlen = false) =>
    item({
      sparte: "Privathaftpflicht",
      tarif: `Haftpflicht ${tarif}`,
      beitragMonat: beitrag,
      selbstbeteiligung: "keine",
      empfohlen,
      gewaehlt: empfohlen,
      leistungen: [`${summe} pauschal für Personen- und Sachschäden`, "Schäden an gemieteten Wohnräumen", "Weltweiter Schutz auf Reisen"],
      merkmale: [
        m("Versicherungssumme", summe),
        m("Forderungsausfall", extra[0]),
        m("Gefälligkeitsschäden", extra[1]),
        m("Schlüsselverlust beruflich", extra[2]),
        m("Deliktunfähige Kinder", ja),
        m("Mietsachschäden", ja),
      ],
    });
  const hausrat = (tarif: string, beitrag: number, fahrlaessig: string, hotel: string, empfohlen = false) =>
    item({
      sparte: "Hausrat",
      tarif: `Hausrat ${tarif}`,
      beitragMonat: beitrag,
      selbstbeteiligung: "keine",
      empfohlen,
      gewaehlt: empfohlen,
      leistungen: ["Einbruchdiebstahl, Feuer, Leitungswasser, Sturm", "Ersatz zum Neuwert", `Grobe Fahrlässigkeit ${fahrlaessig}`],
      merkmale: [
        m("Versicherungssumme", "65.000 €"),
        m("Neuwert", ja),
        m("Grobe Fahrlässigkeit", fahrlaessig),
        m("Überspannung durch Blitz", ja),
        m("Hotelkosten nach Schaden", hotel),
        m("Wertsachen", empfohlen ? "30 %" : "20 %"),
      ],
      bausteine: hausratBausteine(),
    });
  return {
    items: [
      haftpflicht("Basis", 4.2, "10 Mio. €", [nein, nein, nein]),
      haftpflicht("Smart", 5.9, "20 Mio. €", [ja, ja, nein]),
      haftpflicht("Komfort", 8.4, "50 Mio. €", [ja, ja, ja], true),
      hausrat("Smart", 7.6, "bis 10.000 €", "100 Tage"),
      hausrat("Komfort", 9.8, "bis zur Versicherungssumme", "200 Tage", true),
      item({
        sparte: "Rechtsschutz",
        tarif: "Rechtsschutz Privat, Beruf, Verkehr, Wohnen",
        beitragMonat: 24.9,
        selbstbeteiligung: "150 €",
        empfohlen: true,
        gewaehlt: true,
        leistungen: ["Privat, Beruf und Verkehr", "Wohnen als Mieter", "Telefonische Erstberatung durch einen Anwalt"],
        ausschluesse: ["Streit, der vor Vertragsbeginn entstanden ist"],
        bausteine: [{ name: "Ohne Selbstbeteiligung", beitrag: 4.2, aktiv: false }],
      }),
    ],
    quelle: ["Beispieldaten"],
  };
}

export const demoCss = () => praesentationCss(DEMO_MARKE);

/** Folien der Demo zum aktuellen Stand (Sie-Form, wie im Termin). */
export function demoFolien(angebote: AngeboteDaten, now = new Date()): Folie[] {
  return folien(demoTermin(now), angebote, DEMO_MARKE, "sie");
}

/** Klick auf einen Schalter der Folie (wie im Termin, nur im Browser). null = unbekannter Schalter. */
export function demoKlick(
  d: AngeboteDaten,
  k: { tarif: number | null; sparte: boolean; item: number; baustein: number; aktiv: boolean },
): AngeboteDaten | null {
  const neu = k.tarif != null ? (k.sparte ? sparteSchalten(d, k.tarif) : tarifWaehlen(d, k.tarif)) : bausteinSchalten(d, k.item, k.baustein, k.aktiv);
  if (!neu) return null;
  // Rechtsschutz: Baustein „Ohne Selbstbeteiligung“ ändert die angezeigte Selbstbeteiligung
  return {
    ...neu,
    items: neu.items.map((i) => {
      const sb = i.bausteine.find((b) => /^ohne selbstbeteiligung$/i.test(b.name));
      return sb ? { ...i, selbstbeteiligung: sb.aktiv ? "keine" : "150 €" } : i;
    }),
  };
}
