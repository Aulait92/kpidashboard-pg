// Pflichtangaben je Produkt, bevor der WhatsApp-Assistent einen Termin bucht (Ole, 15.11.2026):
// „gut wäre es, wenn alle Daten, die es zur Angebotserstellung braucht, vorhanden sind und der Kunde
// mit allen nötigen Unterlagen zum Termin erscheint“.
//
// Privatschutz: nach den Angaben, die die Allianz in ihren Beitragsrechnern abfragt (allianz.de,
// Stand 15.11.2026): Haftpflicht „Zu versichernde Person(en)“, Geburtsmonat/-jahr, PLZ, „Anzahl der
// Vorschäden in den letzten 5 Jahren“, Dienst-Haftpflicht für den öffentlichen Dienst; Hausrat
// Wohnfläche „ständig bewohnt“, PLZ, Fahrradschutz; Rechtsschutz Bereiche Privat/Beruf/Verkehr/Wohnen,
// kein Rechtsstreit in den letzten 5 Jahren; Unfall Alter und Berufsgruppe; Wohngebäude Haustyp, Baujahr,
// Wohnfläche, Keller, Elementar-Vorschäden; Tier Tierart, Alter, Vorerkrankungen. Sparten laut Leadformular
// (Ole, 15.11.2026): Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Tierkranken/Tierhalterhaftpflicht, Unfall. Tarif, Selbstbehalt und
// Versicherungssummen wählt der Berater im Termin.

export type ProduktCheckliste = {
  /** Für die Anzeige/Tests: welcher Katalog greift. */
  key: "privatschutz";
  /** Block für den System-Prompt: was vor der Qualifizierung geklärt sein muss. */
  fragen: string;
  /** Was der Lead zum Termin bereitlegen soll (Bot nennt es nach der Buchung). */
  unterlagen: string[];
};

const PRIVATSCHUTZ = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude|\bunfall/i;

export function produktCheckliste(product: string | null | undefined): ProduktCheckliste | null {
  const p = product ?? "";
  // Reine Tier-Produkte (TKV, Hundehalter) haben eigene Funnels; „Privatschutz“ greift immer
  if (!/privatschutz/i.test(p) && (!PRIVATSCHUTZ.test(p) || /tier|hund|katze|pferd/i.test(p))) return null;
  return {
    key: "privatschutz",
    fragen: [
      "Pflichtangaben für das Angebot (Privatschutz: Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Tierkranken bzw. Tierhalterhaftpflicht, Unfall). Der Berater soll im Termin direkt ein Angebot rechnen können.",
      "- Kläre vor qualifiziert=true die folgenden Punkte, aber nur, was noch nicht bekannt ist (Leadformular, Verlauf, 'Bisher erfasst'), und nur für die Sparten, für die sich der Lead interessiert. Weiter genau eine kurze Frage pro Nachricht, gern mit kurzer Auswahl (z. B. nur Sie, mit Partner oder die ganze Familie).",
      "- Für alle Sparten:",
      "  • Wer versichert werden soll: nur der Lead, mit Partner, mit Kind(ern) oder die ganze Familie (angaben.versichern)",
      "  • Geburtsmonat und -jahr des Leads, bei Partner auch dessen Geburtsjahr (angaben.geburt)",
      "  • Postleitzahl des Wohnorts (angaben.plz)",
      "  • Schäden bzw. Rechtsstreitigkeiten in den letzten 5 Jahren, Anzahl reicht (angaben.vorschaeden)",
      "  • Bestehende Verträge in diesen Sparten: bei welcher Gesellschaft, wann sie ablaufen bzw. ob schon gekündigt (angaben.vorhanden)",
      "- Nur Haftpflicht: im öffentlichen Dienst bzw. verbeamtet (Dienst-Haftpflicht) (angaben.beruf); Hund im Haushalt (Tierhalterhaftpflicht) (angaben.sonstiges)",
      "- Nur Hausrat: Wohnfläche in m² und ob die Wohnung ständig bewohnt ist (angaben.wohnflaeche); teure Fahrräder oder E-Bikes (angaben.sonstiges)",
      "- Nur Rechtsschutz: welche Bereiche gebraucht werden, also angestellt, verbeamtet oder selbstständig (Beruf), Auto vorhanden (Verkehr), Mieter, Eigentümer oder Vermieter (Wohnen) (angaben.bereiche)",
      "- Nur Unfall: ausgeübter Beruf bzw. Tätigkeit und riskante Sportarten (angaben.beruf)",
      "- Nur Wohngebäude: Haustyp (Einfamilien-, Zweifamilien- oder Mehrfamilienhaus), Baujahr, Wohnfläche und ob der Keller ausgebaut ist, Heizungsart, Solar- bzw. Photovoltaikanlage (angaben.gebaeude); Schäden durch Hochwasser, Starkregen oder Rückstau in den letzten 5 Jahren (angaben.vorschaeden)",
      "- Nur Tierkranken bzw. Tierhalterhaftpflicht: Tierart (Hund, Katze, Pferd), Rasse, Alter, Vorerkrankungen bzw. laufende Behandlungen (angaben.tier)",
      "- Weiß der Lead etwas nicht oder möchte es nicht sagen: nicht nachbohren, als „offen“ festhalten und weitermachen. Insgesamt höchstens 6 Fragen vor dem Terminangebot (mit Wohngebäude höchstens 8); den Rest klärt der Berater im Termin.",
      "- Erst wenn diese Punkte geklärt oder als offen festgehalten sind: qualifiziert=true und Termin anbieten.",
      "- Tarif, Versicherungssumme, Selbstbeteiligung und Preise fragst du nicht ab und nennst du nicht: das macht der Berater im Termin.",
    ].join("\n"),
    unterlagen: [
      "bisherige Police(n) bzw. Versicherungsnummer mit Ablaufdatum, falls vorhanden",
      "Geburtsdaten aller Personen, die mitversichert werden sollen",
      "IBAN für den Beitragseinzug, falls direkt abgeschlossen werden soll",
      "bei Hausrat: Wohnfläche und ungefährer Wert von Fahrrädern bzw. E-Bikes",
      "bei Wohngebäude: bisherige Gebäudepolice, Baujahr und Wohnfläche (z. B. aus Kaufvertrag oder Bauunterlagen)",
      "bei Tieren: Tierpass bzw. Chipnummer und Unterlagen zu Vorerkrankungen",
    ],
  };
}

/** Prompt-Block für die Zeit nach der Buchung: Unterlagen in der Bestätigung nennen. */
export function unterlagenRegel(c: ProduktCheckliste): string {
  return [
    "Nach der Buchung: Nenne in der Bestätigung (Datum und Uhrzeit) zusätzlich kurz als Liste, was der Lead zum Termin bereitlegen soll, damit direkt ein Angebot und auf Wunsch der Abschluss möglich ist:",
    ...c.unterlagen.map((u) => `• ${u}`),
    "Lass Punkte weg, die nicht passen (z. B. Hausrat, wenn es nur um Haftpflicht geht).",
  ].join("\n");
}
