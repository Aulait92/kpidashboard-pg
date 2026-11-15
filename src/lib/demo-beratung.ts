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

/**
 * Rechtsschutz Privat (Kombischutz) in 4 Stufen, Beiträge und Merkmale aus dem Tarifrechner (Ole, 15.11.2026),
 * Selbstbeteiligung 150 €. Sichtbare Merkmale (Vorauswahl): Versicherungssumme, Beruf, Wohnen, Strafkaution.
 */
const rechtsschutz = (tarif: string, beitrag: number, x: { summe: string; bereiche: string; beruf: string; wohnen: string; kaution: string }, empfohlen = false) =>
  item({
    sparte: "Rechtsschutz",
    tarif: `Rechtsschutz ${tarif}`,
    beitragMonat: beitrag,
    selbstbeteiligung: "150 €",
    empfohlen,
    gewaehlt: empfohlen,
    leistungen: [
      x.bereiche,
      `Versicherungssumme ${x.summe}`,
      // in allen Tarifen enthalten
      "Telefonische Rechtsberatung, auch in nicht versicherten Fällen",
      "Kosten im Rechtsstreit",
      "Mediation zur Schlichtung",
    ],
    ausschluesse: ["Streit, der vor Vertragsbeginn entstanden ist"],
    merkmale: [m("Versicherungssumme", x.summe), m("Berufs-Rechtsschutz", x.beruf), m("Wohnen", x.wohnen), m("Strafkaution (als Darlehen)", x.kaution)],
  });

/** Angebote wie aus dem Tarifrechner: Haftpflicht in 3 Stufen, Hausrat in 2, Rechtsschutz in 4. */
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
      rechtsschutz("Basis", 24.29, { summe: "1 Mio. €", bereiche: "Privat und Verkehr", beruf: nein, wohnen: nein, kaution: "100.000 €" }),
      rechtsschutz("Smart", 29.58, { summe: "3 Mio. €", bereiche: "Privat, Beruf und Verkehr", beruf: ja, wohnen: nein, kaution: "300.000 €" }),
      rechtsschutz("Komfort", 35.69, { summe: "5 Mio. €", bereiche: "Privat, Beruf, Verkehr und Wohnen", beruf: ja, wohnen: ja, kaution: "500.000 €" }, true),
      rechtsschutz("Premium", 61.44, { summe: "unbegrenzt", bereiche: "Privat (erweitert), Beruf, Verkehr und Wohnen", beruf: ja, wohnen: ja, kaution: "1 Mio. €" }),
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
  return k.tarif != null ? (k.sparte ? sparteSchalten(d, k.tarif) : tarifWaehlen(d, k.tarif)) : bausteinSchalten(d, k.item, k.baustein, k.aktiv);
}
