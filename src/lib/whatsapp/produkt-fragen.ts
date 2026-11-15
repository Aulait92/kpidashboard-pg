// Pflichtangaben je Produkt, bevor der WhatsApp-Assistent einen Termin bucht (Ole, 15.11.2026):
// „gut wäre es, wenn alle Daten, die es zur Angebotserstellung braucht, vorhanden sind und der Kunde
// mit allen nötigen Unterlagen zum Termin erscheint“.
//
// Privatschutz: nach den Angaben, die die Allianz in ihren Online-Tarifrechnern abfragt (Screenshots von Ole,
// allianz.de, 15.11.2026; Unfall aus der Produktseite): Haftpflicht „Zu versichernde Person(en)“, Geburtsmonat/-jahr, PLZ, „Anzahl der
// Vorschäden in den letzten 5 Jahren“, Dienst-Haftpflicht für den öffentlichen Dienst; Hausrat
// Wohnfläche „ständig bewohnt“, PLZ, Fahrradschutz; Rechtsschutz Bereiche Privat/Beruf/Verkehr/Wohnen,
// kein Rechtsstreit in den letzten 5 Jahren; Unfall Alter und Berufsgruppe; Wohngebäude Haustyp, Baujahr,
// Wohnfläche, Keller, Elementar-Vorschäden; Tier Tierart, Alter, Vorerkrankungen. Sparten laut Leadformular
// (Ole, 15.11.2026): Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Tierkranken/Tierhalterhaftpflicht, Unfall. Tarif, Selbstbehalt und
// Versicherungssummen wählt der Berater im Termin.

export type ProduktCheckliste = {
  /** Für die Anzeige/Tests: welcher Katalog greift. */
  key: "privatschutz" | "tier";
  /** Block für den System-Prompt: was vor der Qualifizierung geklärt sein muss. */
  fragen: string;
  /** Was der Lead zum Termin bereitlegen soll (Bot nennt es nach der Buchung). */
  unterlagen: string[];
};

const PRIVATSCHUTZ = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude|\bunfall/i;

/** Tierkrankenversicherung (TKV), z. B. „TKV-Katze“; nicht Hundefutter oder Hundehalter-Haftpflicht. */
const TKV = /\btkv\b|tierkranken|tier-?op|katze/i;

/**
 * TKV (Ole, 15.11.2026): Gesundheitsfragen fragt das Formular nicht ab, und das Geburtsdatum des Halters braucht
 * der Vermittler für den Antrag. Nach dem Allianz-Tarifrechner Tierkranken (Screenshot von Ole): Tierart,
 * Geschlecht, Name, Geburtsdatum, Rasse, Haltung (Wohnung/Freigänger), Krankheiten, Unfallfolgen, Symptome,
 * Beeinträchtigungen, Verhaltensauffälligkeiten oder Befunde in den letzten 24 Monaten und betroffene Bereiche.
 * Haltung und Adresse/PLZ liefert das Meta-Formular; genaues Geburtsdatum des Tieres ist nicht nötig, zum Termin
 * reicht die Chipnummer (Ole, 15.11.2026).
 */
function tierCheckliste(): ProduktCheckliste {
  return {
    key: "tier",
    fragen: [
      "Pflichtangaben für das Angebot (Tierkrankenversicherung). Es sind die Angaben, die der Allianz-Tarifrechner und der Antrag brauchen, damit der Berater im Termin direkt ein Angebot rechnen kann.",
      "- Kläre vor qualifiziert=true die folgenden Punkte, aber nur, was noch nicht bekannt ist (Leadformular, Verlauf, 'Bisher erfasst'). Tierart, Rasse, Name, Geschlecht, Geburtsmonat und -jahr, Haltung (Wohnungskatze oder Freigänger) und die Adresse kommen aus dem Formular: nicht erneut fragen.",
      "- Weiter genau eine Frage pro Nachricht, gern mit kurzer Auswahl.",
      "- Mehrere Katzen: Ob es eine oder mehrere sind, steht im Formular (Anzahl Tiere). Bei mehreren nimmst du jede Katze einzeln auf: Das Formular liefert die Angaben nur für eine, frag für jede weitere Name, männlich oder weiblich, Alter bzw. Geburtsjahr, Rasse und Wohnungskatze oder Freigänger, und die Gesundheitsfrage für jede Katze. Halte jede Katze in angaben.tier fest (z. B. „Katze 1: Bernd, männlich, 2023, Abessinier, Wohnung, gesund; Katze 2: …“).",
      "  • Gesundheit des Tieres: Hatte oder hat es in den letzten 24 Monaten Krankheiten, Unfallfolgen, Symptome, Beeinträchtigungen, Verhaltensauffälligkeiten oder Befunde, die noch keine Behandlung brauchen? Erst ja oder nein fragen; bei ja, welche Bereiche betroffen sind (z. B. Zähne, Haut und Fell, Augen, Ohren, Magen und Darm, Gelenke bzw. Bewegungsapparat, Herz, Harnorgane) (angaben.tier)",
      "  • Genaues Geburtsdatum des Tieres: nur nebenbei, wenn es sich ergibt. Monat und Jahr aus dem Formular reichen, nicht extra fragen (angaben.tier)",
      "  • Geburtsdatum des Halters, also des Leads (für den Antrag) (angaben.geburt)",
      "  • Besteht schon eine Tierversicherung, und wenn ja, wann läuft sie ab (angaben.vorhanden)",
      "  • Welcher Schutz gewünscht ist: nur Operationen (OP-Schutz) oder volle Krankenversicherung, also auch Tierarztbehandlungen ohne OP. Neutral fragen, ohne zu empfehlen (angaben.tarifwunsch)",
      "- Gesundheitsangaben zum Tier sachlich und ohne Wertung aufnehmen. Sag nichts dazu, ob oder wie sie den Versicherungsschutz beeinflussen: das klärt der Berater.",
      "- Weiß der Lead etwas nicht oder möchte es nicht sagen: nicht nachbohren, als „offen“ festhalten und weitermachen. Wird es dem Lead zu viel, biete direkt den Termin an und lass den Rest offen.",
      "- Erst wenn diese Punkte geklärt oder als offen festgehalten sind: qualifiziert=true und Termin anbieten.",
      "- Versicherungssumme, Selbstbeteiligung und Preise fragst du nicht ab und nennst du nicht: das macht der Berater im Termin.",
    ].join("\n"),
    unterlagen: [
      "Chipnummer jedes Tieres",
      "bisherige Police mit Ablaufdatum, falls vorhanden",
      "IBAN für den Beitragseinzug, falls direkt abgeschlossen werden soll",
    ],
  };
}

export function produktCheckliste(product: string | null | undefined): ProduktCheckliste | null {
  const p = product ?? "";
  if (!/privatschutz/i.test(p) && TKV.test(p) && !/futter|halter/i.test(p)) return tierCheckliste();
  // Reine Tier-Produkte (TKV, Hundehalter) haben eigene Funnels; „Privatschutz“ greift immer
  if (!/privatschutz/i.test(p) && (!PRIVATSCHUTZ.test(p) || /tier|hund|katze|pferd/i.test(p))) return null;
  return {
    key: "privatschutz",
    fragen: [
      "Pflichtangaben für das Angebot (Privatschutz: Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Tierkranken bzw. Tierhalterhaftpflicht, Unfall). Es sind die Angaben, die der Allianz-Tarifrechner abfragt, damit der Berater im Termin direkt ein Angebot rechnen kann.",
      "- Kläre vor qualifiziert=true die folgenden Punkte, aber nur, was noch nicht bekannt ist (Leadformular, Verlauf, 'Bisher erfasst'), und nur für die Sparten, für die sich der Lead interessiert.",
      "- Weiter genau eine Frage pro Nachricht. Eine Frage darf eine kurze Auswahl oder Liste enthalten (z. B. „Trifft etwas davon zu: Flachdach, Holzbauweise, Reetdach oder Schwimmbad?“). Mehrere Sparten mit derselben Angabe (Adresse, Geburtsdatum, Vorschäden) fragst du nur einmal.",
      "- Für alle Sparten:",
      "  • Wer versichert werden soll: nur der Lead, mit Partner, mit Kind(ern) oder die ganze Familie (angaben.versichern)",
      "  • Geburtsdatum des Leads (angaben.geburt)",
      "  • Adresse und Postleitzahl kommen aus dem Leadformular: nicht fragen.",
      "  • Bestehende Verträge in diesen Sparten: bei welcher Gesellschaft, wann sie ablaufen bzw. ob schon gekündigt; bei Wohngebäude auch, ob in den letzten 5 Jahren eine Gebäudeversicherung bestand (angaben.vorhanden)",
      "- Vorschäden in den letzten 5 Jahren, jeweils mit Anzahl (angaben.vorschaeden):",
      "  • Haftpflicht: Haftpflichtschäden",
      "  • Tierhalterhaftpflicht: Tierhalter-Haftpflichtschäden",
      "  • Hausrat: Hausratschäden, Fahrraddiebstahl, Naturgefahren (Elementar)",
      "  • Rechtsschutz: Rechtsstreit oder Rechtsberatung",
      "  • Wohngebäude: Feuer, Leitungswasser, Sturm oder Hagel, Naturgefahren (Elementar)",
      "- Nur Hausrat: Wohnfläche in m², ständig bewohnt, im Einfamilien- oder Mehrfamilienhaus (angaben.wohnflaeche)",
      "- Nur Rechtsschutz: welche Lebensbereiche (Privat, Beruf, Verkehr, Wohnen oder nur ein Teil davon) (angaben.bereiche); ob der Lead oder sein Partner im öffentlichen Dienst, selbstständig oder Geschäftsführer ist (angaben.beruf). Hinweis: eine selbstständige Tätigkeit ist im Privat-Rechtsschutz nicht mitversichert, das klärt der Berater.",
      "- Nur Wohngebäude (angaben.gebaeude): Wohnfläche und Baujahr; Anzahl Wohneinheiten (eine, zwei, drei oder mehr); Nutzung (selbst bewohnt, ganz oder teilweise vermietet, leerstehend, Ferienhaus); Besonderheiten (Flachdach, Dach aus Naturschiefer, Holz, Reet oder Stroh, Außenwände überwiegend aus Holz, Keller mit oder ohne Wohnfläche, Schwimmbad); Heizung und Haustechnik (Gas, Öl, Fernwärme, Pellets, Wärmepumpe, Solarthermie, Photovoltaik); weitere Gebäude auf dem Grundstück außer Garage oder Carport, mit ungefährer Fläche",
      "- Nur Tierkranken (angaben.tier): Zuerst, welche Tiere es sind (Katze, Hund oder Pferd) und wie viele. Dann nimmst du jedes Tier einzeln auf: Tierart, Name, männlich oder weiblich, Alter bzw. Geburtsjahr (genaues Datum nicht nötig), Rasse; bei Katzen Wohnungskatze oder Freigänger; je Tier Krankheiten, Unfallfolgen, Symptome oder Befunde in den letzten 24 Monaten (erst ja oder nein, bei ja welche Bereiche, z. B. Zähne, Haut, Gelenke); einmal, ob nur OP-Schutz oder volle Krankenversicherung gewünscht ist (angaben.tarifwunsch). Halte jedes Tier in angaben.tier fest (z. B. „Katze 1: Bernd, männlich, 2023, Abessinier, Wohnung, gesund; Katze 2: …“).",
      "- Nur Tierhalterhaftpflicht (Hund oder Pferd, nach dem Allianz-Tarifrechner) (angaben.tier): ob Hund oder Pferd und wie viele; die Rasse jedes Tieres (bei Mischlingen: klein oder groß, groß heißt Widerristhöhe ab 45 cm); Tierhalter-Haftpflichtschäden in den letzten 5 Jahren mit Anzahl (angaben.vorschaeden). Name, Alter und Gesundheit braucht es dafür nicht. Katzen brauchen keine Tierhalterhaftpflicht (sind über die Privathaftpflicht mitversichert); das sagt der Berater, nicht du.",
      "- Nur Unfall: ausgeübter Beruf bzw. Tätigkeit und riskante Sportarten (angaben.beruf)",
      "- Haftpflicht: frage zusätzlich, ob ein Hund oder Pferd im Haushalt lebt (Tierhalterhaftpflicht) (angaben.tier)",
      "- Weiß der Lead etwas nicht oder möchte es nicht sagen: nicht nachbohren, als „offen“ festhalten und weitermachen. Wird es dem Lead zu viel (kurze oder genervte Antworten), biete direkt den Termin an und lass den Rest offen; der Berater klärt ihn im Termin.",
      "- Erst wenn diese Punkte geklärt oder als offen festgehalten sind: qualifiziert=true und Termin anbieten.",
      "- Versicherungssumme, Selbstbeteiligung und Preise fragst du nicht ab und nennst du nicht: das macht der Berater im Termin.",
    ].join("\n"),
    unterlagen: [
      "bisherige Police(n) bzw. Versicherungsnummer mit Ablaufdatum, falls vorhanden",
      "Geburtsdaten aller Personen, die mitversichert werden sollen",
      "IBAN für den Beitragseinzug, falls direkt abgeschlossen werden soll",
      "bei Hausrat: Wohnfläche und ungefährer Wert von Fahrrädern bzw. E-Bikes",
      "bei Wohngebäude: bisherige Gebäudepolice sowie Baujahr und Wohnfläche (z. B. aus Kaufvertrag oder Bauunterlagen)",
      "bei Tieren: Chipnummer jedes Tieres",
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
