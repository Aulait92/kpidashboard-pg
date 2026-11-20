// Alle Texte des eigenen PKV-Funnels (beitrag.pkv-tarife.com, /f/pkv-beitrag), an einer Stelle für die Rechtsprüfung.
// Stand: Conversion-Durchgang 20.11.2026 (docs/funnel/pkv-beitrag-texte-conversion.md, Freigabe Ole), Auflagen aus
// docs/recht/pkv-funnel.md (L1 Einwilligung, L6 Cookie-Hinweis und Fußzeile, L8 Fußnote zu „bis zu 50 %“).
// Du-Form, keine Gedankenstriche (AGENTS.md). Leitsatz: „Ein PKV-Experte ruft dich an.“
//
// Gespeicherte Antwortwerte bleiben unverändert (Filter, Lead-PDF, Perspective-Feldnamen): Beschriftungen, die vom
// Wert abweichen, stehen in den *_LABEL-Tabellen unten.
//
// Fassung b einzelner Schritte für A/B-Tests: in lib/funnel/definition.ts (test.b), Texte dafür ebenfalls hier.

export const PKV_TEXTE = {
  seitenTitel: "PKV-Beitrag kostenlos prüfen lassen",
  fortschritt: (nr: number, von: number) => `Frage ${nr} von ${von}`,
  zurueck: "Zurück",
  weiter: "Weiter",

  start: {
    ueberschrift: "Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen",
    text: [
      "Die Beiträge in der privaten Krankenversicherung sind für viele Versicherte deutlich gestiegen, oft ohne bessere Leistungen.",
      "Nach § 204 VVG darfst du bei deiner Versicherung in einen anderen Tarif wechseln, deine Altersrückstellungen werden angerechnet. Ein PKV-Experte prüft kostenlos, ob das für dich günstiger ist, und ruft dich mit dem Ergebnis an.",
    ],
    vertrauen: ["Kostenlos und unverbindlich", "Du bleibst bei deiner Versicherung", "7 kurze Fragen"],
    frage: "Bist du gesetzlich oder privat versichert?",
  },
  // A/B-Test funnel_pkv_anlass (lib/experimente.ts, Hypothese lib/ab-hypothesen.ts): Überschrift mit Anlass
  startB: {
    ueberschrift: "Hat deine PKV den Beitrag zum 1.\u00a0Januar erhöht? Lass deinen Tarif kostenlos prüfen",
  },

  versicherung: { frage: "Bei welcher Versicherung bist du privat versichert?", hinweis: "Geprüft wird ein Wechsel innerhalb deiner Versicherung." },
  situation: { frage: "Was machst du beruflich?" },
  dauer: { frage: "Wie lange bist du schon bei deiner jetzigen PKV?" },
  beitrag: {
    frage: "Wie hoch ist dein Monatsbeitrag ungefähr?",
    // Ole 20.11.2026: gemeint ist der ganze Beitrag (vor Arbeitgeberzuschuss)
    hinweis: "Gemeint ist dein ganzer Beitrag, vor Abzug eines Arbeitgeberzuschusses. Ein runder Wert reicht.",
    platzhalter: "z. B. 850",
    einheit: "€ im Monat",
    fehler: "Bitte gib deinen Monatsbeitrag in Euro ein, z. B. 850.",
  },
  geburtsdatum: {
    frage: "Wann bist du geboren?",
    hinweis: "Damit dein Experte passende Tarife findet.",
    platzhalter: "TT.MM.JJJJ",
    fehler: "Bitte gib dein Geburtsdatum ein, z. B. 14.03.1975.",
  },
  wohnort: {
    frage: "Wie lauten deine Postleitzahl und dein Wohnort?",
    hinweis: "Damit wir einen passenden Experten für deine Region finden.",
    plz: "Postleitzahl",
    ort: "Wohnort",
    fehlerPlz: "Bitte gib eine Postleitzahl mit 5 Ziffern ein.",
    fehlerOrt: "Bitte gib deinen Wohnort ein.",
  },

  fastFertig: {
    ueberschrift: "Passt! Deine Angaben eignen sich für eine Tarifprüfung.",
    text: "Ein PKV-Experte prüft kostenlos, ob und wie viel du sparen kannst, und ruft dich mit dem Ergebnis an. Dafür brauchen wir nur noch deinen Namen und deine Telefonnummer.",
    knopf: "Weiter",
    symbolbild: "Symbolbild",
  },

  name: {
    // L8: „bis zu 50 %“ (Risiko trägt Ole, 20.11.2026) nur mit Fußnote
    ueberschrift: "Spare bis zu 50 % deines PKV-Beitrags",
    fussnote: "Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.",
    frage: "Wie darf dich dein Experte ansprechen?",
    vorname: "Vorname",
    nachname: "Nachname",
    vertraulich: "Deine Daten werden vertraulich behandelt.",
    fehlerVorname: "Bitte gib deinen Vornamen ein.",
    fehlerNachname: "Bitte gib deinen Nachnamen ein.",
  },

  kontakt: {
    frage: "Unter welcher Nummer erreicht dich dein Experte?",
    hinweis: "Er ruft dich mit deinem Ergebnis an, in der Regel innerhalb von 24 bis 48 Stunden.",
    telefon: "Telefon (am besten Handy)",
    telefonPlatzhalter: "z. B. 0151 23456789",
    telefonHinweis: "Unter dieser Nummer ruft dich dein Experte an.",
    email: "E-Mail",
    // Knopfname steht wörtlich in der Einwilligung (einwilligungTeile)
    knopf: "Kostenlos prüfen lassen",
    unterKnopf: "Das Absenden kostet nichts und verpflichtet dich zu nichts.",
    fehlerEmail: "Bitte gib eine gültige E-Mail-Adresse ein.",
    fehlerTelefon: "Bitte gib eine Nummer ein, unter der du gut erreichbar bist, z. B. 0151 23456789.",
    fehlerSenden: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.",
    sendet: "Wird gesendet …",
  },

  danke: {
    ueberschrift: "Danke, deine Anfrage ist angekommen.",
    untertitel: "So geht es weiter:",
    schritte: [
      "Ein PKV-Experte aus unserer Partnerliste ruft dich an, in der Regel innerhalb von 24 bis 48 Stunden.",
      "Halte dein Telefon bereit und geh auch bei unbekannten Nummern ran.",
      "Leg dir am besten dein letztes Beitragsschreiben bereit.",
    ],
    verpasst: "Anruf verpasst? Ruf einfach zurück, dein Experte freut sich.",
    experte: "Dein Experte",
    experteTel: "Tel.",
  },

  endeGesetzlich: {
    ueberschrift: "Danke für dein Interesse!",
    text: "Diese Prüfung gibt es nur für privat Krankenversicherte.",
    knopf: "Ich bin doch privat versichert",
  },
  endeBeitrag: {
    ueberschrift: "Danke für deine Angaben!",
    text: "Für Beiträge unter 650 € bieten wir diese Prüfung leider nicht an. Hast du dich vertippt? Dann korrigiere deinen Beitrag.",
    knopf: "Beitrag korrigieren",
  },

  // L6: Cookie-Hinweis für den Meta-Pixel (nur mit Einwilligung, Knöpfe gleichwertig)
  cookies: {
    text: "Dürfen wir Meta (Facebook) mit Cookies und, wenn du anfragst, mit unkenntlich gemachten Kontaktdaten zeigen, welche Werbung wirkt? Meta nutzt die Daten auch selbst, auch in den USA.",
    mehr: "Mehr dazu",
    ablehnen: "Nein danke",
    zustimmen: "Einverstanden",
  },

  // L6: Fußzeile (Anbieterzeile steht an der Marke, lib/funnel/marken.ts)
  impressum: "Impressum",
  datenschutz: "Datenschutz",
  cookiesLink: "Cookies",
  partnerliste: "Partnerliste",
  impressumUrl: "https://performancegrowth.de/impressum",
  datenschutzUrl: "https://performancegrowth.de/datenschutz",

  // L2: öffentliche Partnerliste
  partner: {
    titel: "Partnerliste",
    text: "An diese PKV-Experten geben wir deine Angaben weiter, wenn du eine kostenlose Tarifprüfung anfragst. Du bekommst genau einen Experten.",
    stand: "Stand",
    register: "Registernummer nach § 34d GewO",
    registerKurz: "Registernr.",
    sitz: "Sitz",
    leer: "Gerade nehmen keine PKV-Experten neue Anfragen an. Bitte schau später noch einmal vorbei.",
    zurueck: "Zur Tarifprüfung",
  },
} as const;

// ─── Einwilligung (L1, L3) ────────────────────────────────────────────────

/**
 * Fassung des Einwilligungstexts. Bei jeder Änderung am Wortlaut hochzählen: Sie wird je Lead gespeichert (L3,
 * § 7a UWG) und an die Abnehmer mit ausgeliefert.
 */
export const EINWILLIGUNG_VERSION = "pkv-beitrag-2026-11-20";
/** Kanäle, für die die Einwilligung gilt (Pflichtbestandteil, steht wörtlich im Text). */
export const EINWILLIGUNG_KANAELE = ["Telefon", "E-Mail", "WhatsApp"] as const;

export type EinwilligungTeil = string | { link: "partner" | "datenschutz"; text: string } | { email: string };

/** Einwilligung in Teilen (Links für die Seite); Wortlaut = einwilligungText(). */
export function einwilligungTeile(datenschutzEmail: string): EinwilligungTeil[] {
  return [
    `Mit Klick auf „${PKV_TEXTE.kontakt.knopf}“ willige ich ein, dass pkv-tarife.com (Ole Kannapinn UG) meine Angaben an einen PKV-Experten aus der `,
    { link: "partner", text: PKV_TEXTE.partnerliste },
    " weitergibt und dieser mich zur Prüfung meines Tarifs per Telefon, E-Mail und WhatsApp kontaktiert. Seine Erstinformation erhalte ich elektronisch, auf Wunsch auf Papier. Widerruf jederzeit per E-Mail an ",
    { email: datenschutzEmail },
    ". ",
    { link: "datenschutz", text: PKV_TEXTE.datenschutz },
  ];
}

/** Wortlaut der Einwilligung mit eingesetzter Adresse (so wie angezeigt, ohne Links). */
export function einwilligungText(datenschutzEmail: string): string {
  return einwilligungTeile(datenschutzEmail)
    .map((t) => (typeof t === "string" ? t : "email" in t ? t.email : t.text))
    .join("")
    .trim();
}

// ─── Optionen ─────────────────────────────────────────────────────────────

/** Versicherer zur Auswahl (Schritt 2), alphabetisch, „Sonstige“ zuletzt. */
export const PKV_VERSICHERER = [
  "Allianz",
  "AXA",
  "Barmenia",
  "Bayerische Beamtenkasse",
  "Continentale",
  "Debeka",
  "DEVK",
  "DKV",
  "Generali / Dialog",
  "Gothaer",
  "HALLESCHE",
  "HanseMerkur",
  "HUK-Coburg",
  "Inter",
  "LKH",
  "Mecklenburgische",
  "Münchener Verein",
  "Nürnberger",
  "ottonova",
  "R+V",
  "SDK",
  "Signal Iduna",
  "Süddeutsche",
  "uniVersa",
  "Württembergische",
  "Sonstige",
] as const;

/** Gespeicherte Werte (unverändert wie bei Perspective: Filter „Beamte“, Lead-PDF). */
export const PKV_SITUATIONEN = ["Angestellt", "Selbstständig", "Beamter", "Auszubildender", "Student", "Hausmann/Hausfrau", "Schüler", "Nicht erwerbstätig", "Rentner"] as const;

/** Beschriftung je Wert, wo sie abweicht (Conversion-Durchgang 20.11.2026). */
export const PKV_SITUATION_LABEL: Record<string, string> = {
  Beamter: "Beamtin/Beamter",
  Auszubildender: "In Ausbildung",
  Student: "Studium",
  "Hausmann/Hausfrau": "Hausfrau/Hausmann",
  Schüler: "Schule",
  Rentner: "In Rente",
};

export const PKV_VERSICHERT_LABEL: Record<string, string> = { Privat: "Privat versichert", Gesetzlich: "Gesetzlich versichert" };

export const PKV_DAUER = ["0 bis 5 Jahre", "6 bis 10 Jahre", "11 bis 20 Jahre", "Über 20 Jahre"] as const;
