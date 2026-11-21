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
  key: "privatschutz" | "tier" | "kfz";
  /** Vor der Buchung (Ole, 15.11.2026: erst Termin, dann Fragen): nur das Nötigste, dann Termin anbieten. */
  vorher: string;
  /** Angaben fürs Angebot: fragt der Assistent NACH der Buchung ab (oder vorher, wenn der Lead selbst erzählt). */
  fragen: string;
  /** Was der Lead zum Termin bereitlegen soll (Bot nennt es nach der Buchung). */
  unterlagen: string[];
};

const PRIVATSCHUTZ = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude|\bunfall/i;

/** Tierkrankenversicherung (TKV), z. B. „TKV-Katze“; nicht Hundefutter oder Hundehalter-Haftpflicht. */
const TKV = /\btkv\b|tierkranken|tier-?op|katze|hundekranken|hunde-?op|pferdekranken|pferde-?op/i;

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
    vorher:
      "Vor dem Termin (Tierkrankenversicherung): Das Formular reicht. Frag vorher nichts weiter ab, setze qualifiziert=true und biete direkt Termine an.",
    fragen: [
      "Pflichtangaben für das Angebot (Tierkrankenversicherung). Es sind die Angaben, die der Allianz-Tarifrechner und der Antrag brauchen, damit der Berater im Termin direkt ein Angebot rechnen kann.",
      "- Diese Angaben fragst du NACH der Buchung ab, nur was noch nicht bekannt ist (Leadformular, Verlauf, 'Bisher erfasst'). Tierart, Rasse, Name, Geschlecht, Geburtsmonat und -jahr, Haltung (Wohnungskatze oder Freigänger) und die Adresse kommen aus dem Formular: nicht erneut fragen.",
      "- Weiter genau eine Frage pro Nachricht, gern mit kurzer Auswahl.",
      "- Mehrere Katzen: Ob es eine oder mehrere sind, steht im Formular (Anzahl Tiere). Bei mehreren nimmst du jede Katze einzeln auf: Das Formular liefert die Angaben nur für eine, frag für jede weitere Name, männlich oder weiblich, Alter bzw. Geburtsjahr, Rasse und Wohnungskatze oder Freigänger, und die Gesundheitsfrage für jede Katze. Halte jede Katze in angaben.tier fest (z. B. „Katze 1: Bernd, männlich, 2023, Abessinier, Wohnung, gesund; Katze 2: …“).",
      "  • Gesundheit des Tieres: Hatte oder hat es in den letzten 24 Monaten Krankheiten, Unfallfolgen, Symptome, Beeinträchtigungen, Verhaltensauffälligkeiten oder Befunde, die noch keine Behandlung brauchen? Erst ja oder nein fragen; bei ja, welche Bereiche betroffen sind (z. B. Zähne, Haut und Fell, Augen, Ohren, Magen und Darm, Gelenke bzw. Bewegungsapparat, Herz, Harnorgane) (angaben.tier)",
      "  • Genaues Geburtsdatum des Tieres: nur nebenbei, wenn es sich ergibt. Monat und Jahr aus dem Formular reichen, nicht extra fragen (angaben.tier)",
      "  • Geburtsdatum des Halters, also des Leads (für den Antrag) (angaben.geburt)",
      "  • Besteht schon eine Tierversicherung, und wenn ja, wann läuft sie ab (Monat und Jahr, angaben.vorhanden)",
      "  • Welcher Schutz gewünscht ist: nur Operationen (OP-Schutz) oder volle Krankenversicherung, also auch Tierarztbehandlungen ohne OP. Neutral fragen, ohne zu empfehlen (angaben.tarifwunsch)",
      "- Gesundheitsangaben zum Tier sachlich und ohne Wertung aufnehmen. Sag nichts dazu, ob oder wie sie den Versicherungsschutz beeinflussen: das klärt der Berater.",
      "- Weiß der Lead etwas nicht oder möchte es nicht sagen: nicht nachbohren, als „offen“ festhalten und weitermachen. Wird es dem Lead zu viel, lass den Rest offen: der Berater klärt ihn im Termin.",
      "- Versicherungssumme, Selbstbeteiligung und Preise fragst du nicht ab und nennst du nicht: das macht der Berater im Termin.",
    ].join("\n"),
    unterlagen: [
      "Chipnummer jedes Tieres",
      "bisherige Police mit Ablaufdatum, falls vorhanden",
      "IBAN für den Beitragseinzug, falls direkt abgeschlossen werden soll",
    ],
  };
}

/**
 * Kfz-Versicherung als Lead-Produkt (z. B. „Kfz-Versicherung“, „Autoversicherung“, „Motorrad“). Nicht „Privatschutz“
 * (Kfz kommt dort nur als Vertrag im Komplettcheck vor) und nicht Kfz-Gewerbe.
 */
export const KFZ = /\bkfz\b|kfz-|kraftfahr|auto-?versicherung|\bauto\b|\bpkw\b|motorrad|fahrzeugversicherung|autoversichert/i;
export const istKfzProdukt = (product: string | null | undefined): boolean => {
  const p = product ?? "";
  return KFZ.test(p) && !/privatschutz|gewerbe|flotte/i.test(p);
};

/**
 * Kfz (Ole, 21.11.2026): „Folgendes braucht der Allianzer, um Preise zu rechnen: aus letzter Rechnung von Vorversicherer
 * die SFR, Versicherungsscheinnummer und Versicherer. Typ (3 Ziffern oder Buchstaben), Hersteller (4 Ziffern),
 * Fahrzeugschein. 2 Dokumente: Fahrzeugschein und Rechnung vom Vorversicherer.“ Fotos zuerst, Fragen nur als Rückfall
 * (Rechner-Tabelle lib/preise/rechner-angaben.ts, Sparte „kfz“).
 */
/**
 * Fragen im Meta-Leadformular Kfz (Entwurf docs/kfz-leadformular.md, Ole 21.11.2026). Erkennung über die Beschriftung,
 * in Sie- und Du-Fassung; was das Formular liefert, fragt der Assistent nicht noch einmal.
 */
export const KFZ_FORMULAR = {
  anlass: /worum geht es|wechsel oder neu|anlass/i,
  schutz: /welchen schutz|gew(ü|ue)nschte[rn]? schutz|welche deckung/i,
} as const;

function kfzCheckliste(): ProduktCheckliste {
  return {
    key: "kfz",
    vorher: "Vor dem Termin (Kfz-Versicherung): Das Formular reicht. Frag vorher nichts weiter ab, setze qualifiziert=true und biete direkt Termine an.",
    fragen: [
      "Pflichtangaben für das Angebot (Kfz-Versicherung): Damit der Berater im Termin den Beitrag rechnen kann, braucht er zwei Unterlagen: den Fahrzeugschein (Zulassungsbescheinigung Teil I, Vorderseite) und die letzte Rechnung der bisherigen Kfz-Versicherung.",
      "- Um die Fotos bittet die App nach der Buchung selbst (Unterlagen-Bitte). Darauf stehen HSN, TSN, Erstzulassung, Halter, Kennzeichen, Versicherer, SF-Klassen, Versicherungsscheinnummer und Ablauf.",
      "- Nur wenn der Lead kein Foto schicken kann oder möchte, fragst du einzeln nach (je eine Frage pro Nachricht):",
      "  • Herstellerschlüssel (HSN, 4 Ziffern, Feld 2.1) und Typschlüssel (TSN, 3 Zeichen, Feld 2.2) aus dem Fahrzeugschein (angaben.fahrzeug)",
      "  • bisheriger Versicherer, SF-Klasse Haftpflicht und Vollkasko und Versicherungsscheinnummer von der letzten Rechnung (angaben.vorversicherung)",
      "- Danach die übrigen Angaben des Allianz-Kfz-Rechners, die nicht auf den Unterlagen stehen (nur was noch unbekannt ist, je eine Frage pro Nachricht):",
      "  • Geburtsdatum (angaben.geburt) und ob der Lead im öffentlichen Dienst arbeitet (angaben.beruf); die Postleitzahl kommt aus dem Formular",
      "  • Versicherungswechsel für das jetzige Fahrzeug oder neu gekauftes Fahrzeug; gewünschter Schutz (nur Haftpflicht, Teilkasko oder Vollkasko); ob die Kfz-Versicherung in den letzten 3 Jahren einen Schaden bezahlt hat (angaben.kfzVertrag)",
      "  • privat oder auch geschäftlich genutzt; Jahr des Führerscheins; weitere Fahrer und das Alter der jüngsten Person (angaben.kfzFahrer)",
      "  • Kilometer pro Jahr; bezahlt, finanziert oder geleast (angaben.kfzDetails)",
      "  • Erstzulassung, Halter, Kennzeichen und Vertragsbeginn (Ablauf des bisherigen Vertrags) stehen auf den Unterlagen: nur fragen, wenn der Lead ausdrücklich kein Foto schicken möchte.",
      "- Danach (Cross-Selling, Ole 21.11.2026): Welche Versicherungen hat der Lead sonst noch (Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Unfall)? Das fragt die App über den Komplettcheck und die Vertragsfrage selbst (lib/whatsapp/vorvertraege.ts); nennt der Lead Verträge von sich aus, halte sie in angaben.vorhanden fest und lade ihn ein, diese Policen gleich mitzuschicken, damit der Berater im Termin alles mit ansehen kann. Kein Versprechen zu Ersparnis oder Preisen; erlaubt ist nur, dass der Berater versucht, Geld zu sparen.",
      "- Weiß der Lead etwas nicht: nicht nachbohren, als „offen“ festhalten und weitermachen. Der Berater klärt es im Termin.",
      "- Preise, Tarife, Selbstbeteiligung und Kasko-Umfang fragst du nicht ab und nennst du nicht, und du empfiehlst nichts: das macht der Berater im Termin.",
    ].join("\n"),
    unterlagen: [
      "Fahrzeugschein (Zulassungsbescheinigung Teil I)",
      "letzte Rechnung der bisherigen Kfz-Versicherung (mit SF-Klasse und Versicherungsscheinnummer)",
      "weitere Policen (z. B. Haftpflicht, Hausrat), falls vorhanden",
      "IBAN für den Beitragseinzug, falls direkt abgeschlossen werden soll",
    ],
  };
}

export function produktCheckliste(product: string | null | undefined): ProduktCheckliste | null {
  const p = product ?? "";
  if (istKfzProdukt(p)) return kfzCheckliste();
  if (!/privatschutz/i.test(p) && TKV.test(p) && !/futter|halter/i.test(p)) return tierCheckliste();
  // Reine Tier-Produkte (TKV, Hundehalter) haben eigene Funnels; „Privatschutz“ greift immer
  if (!/privatschutz/i.test(p) && (!PRIVATSCHUTZ.test(p) || /tier|hund|katze|pferd/i.test(p))) return null;
  return {
    key: "privatschutz",
    vorher: [
      "Vor dem Termin (Privatschutz) klärst du nur das Nötigste, damit der Berater weiß, worum es geht, und bietest dann direkt Termine an:",
      "  1. Worum es genau geht, falls das Formular es offenlässt. Bei Tieren (Formularauswahl „Tierkrankenversicherung / Tierhalterhaftpflicht“): welche Tiere (Katze, Hund oder Pferd), wie viele und ob Tierkrankenversicherung, Tierhalterhaftpflicht oder beides (angaben.interesse, angaben.tier).",
      "  2. Wer versichert werden soll: nur der Lead, mit Partner, mit Kind(ern) oder die ganze Familie (angaben.versichern).",
      "Danach qualifiziert=true und Termine anbieten. Alles Weitere fragst du nach der Buchung ab.",
    ].join("\n"),
    fragen: [
      "Pflichtangaben für das Angebot (Privatschutz: Haftpflicht, Hausrat, Rechtsschutz, Wohngebäude, Tierkranken bzw. Tierhalterhaftpflicht, Unfall). Es sind die Angaben, die der Allianz-Tarifrechner abfragt, damit der Berater im Termin direkt ein Angebot rechnen kann.",
      "- Diese Angaben fragst du NACH der Buchung ab, nur was noch nicht bekannt ist (Leadformular, Verlauf, 'Bisher erfasst'), und nur für die Sparten, für die sich der Lead interessiert.",
      "- Weiter genau eine Frage pro Nachricht. Eine Frage darf eine kurze Auswahl oder Liste enthalten (z. B. „Trifft etwas davon zu: Flachdach, Holzbauweise, Reetdach oder Schwimmbad?“). Mehrere Sparten mit derselben Angabe (Adresse, Geburtsdatum, Vorschäden) fragst du nur einmal.",
      "- Für alle Sparten:",
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
      "- Tiere: Welche Tiere, wie viele und ob Tierkrankenversicherung, Tierhalterhaftpflicht oder beides hast du vor dem Termin geklärt (das Leadformular hat nur die gemeinsame Auswahl „Tierkrankenversicherung / Tierhalterhaftpflicht“: Tierkrankenversicherung, Tierhalterhaftpflicht oder beides). Danach die passenden Angaben unten; Angaben, die beide brauchen (Tierart, Anzahl, Rasse), nur einmal.",
      "- Nur Tierkranken (angaben.tier): Du nimmst jedes Tier einzeln auf: Tierart, Name, männlich oder weiblich, Alter bzw. Geburtsjahr (genaues Datum nicht nötig), Rasse; bei Katzen Wohnungskatze oder Freigänger; je Tier Krankheiten, Unfallfolgen, Symptome oder Befunde in den letzten 24 Monaten (erst ja oder nein, bei ja welche Bereiche, z. B. Zähne, Haut, Gelenke); einmal, ob nur OP-Schutz oder volle Krankenversicherung gewünscht ist (angaben.tarifwunsch). Halte jedes Tier in angaben.tier fest (z. B. „Katze 1: Bernd, männlich, 2023, Abessinier, Wohnung, gesund; Katze 2: …“).",
      "- Nur Tierhalterhaftpflicht (Hund oder Pferd, nach dem Allianz-Tarifrechner) (angaben.tier): die Rasse jedes Tieres (bei Mischlingen: klein oder groß, groß heißt Widerristhöhe ab 45 cm); Tierhalter-Haftpflichtschäden in den letzten 5 Jahren mit Anzahl (angaben.vorschaeden). Name, Alter und Gesundheit braucht es dafür nicht. Katzen brauchen keine Tierhalterhaftpflicht (sind über die Privathaftpflicht mitversichert); das sagt der Berater, nicht du.",
      "- Nur Unfall: ausgeübter Beruf bzw. Tätigkeit und riskante Sportarten (angaben.beruf)",
      "- Haftpflicht: frage zusätzlich, ob ein Hund oder Pferd im Haushalt lebt (Tierhalterhaftpflicht) (angaben.tier)",
      "- Weiß der Lead etwas nicht oder möchte es nicht sagen: nicht nachbohren, als „offen“ festhalten und weitermachen. Wird es dem Lead zu viel (kurze oder genervte Antworten), lass den Rest offen: der Berater klärt ihn im Termin.",
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

/** Prompt-Block: Unterlagen nennen, wenn die Angaben nach der Buchung geklärt sind (nicht schon in der Bestätigung). */
export function unterlagenRegel(c: ProduktCheckliste): string {
  return [
    "Unterlagen: Sind die Angaben nach der Buchung geklärt (oder möchte der Lead nicht weiter antworten), nenne zum Abschluss einmal kurz als Liste, was er zum Termin bereitlegen soll, damit direkt ein Angebot und auf Wunsch der Abschluss möglich ist:",
    ...c.unterlagen.map((u) => `• ${u}`),
    "Lass Punkte weg, die nicht passen (z. B. Hausrat, wenn es nur um Haftpflicht geht).",
  ].join("\n");
}
