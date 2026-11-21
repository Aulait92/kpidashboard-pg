// Alle Texte des eigenen PKV-Funnels (beitrag.pkv-tarife.com, /f/pkv-beitrag), an einer Stelle für die Rechtsprüfung.
// Stand: Redesign 21.11.2026 (Reviews docs/funnel/review-2026-11-21/, Texte nach texte.md mit Oles Ausnahmen),
// davor Conversion-Durchgang 20.11.2026 (docs/funnel/pkv-beitrag-texte-conversion.md, Freigabe Ole), Auflagen aus
// docs/recht/pkv-funnel.md (L1 Einwilligung, L6 Cookie-Hinweis und Fußzeile, L8 Fußnote zu „bis zu 50 %“).
// Du-Form, keine Gedankenstriche (AGENTS.md). Leitsatz: „Ein PKV-Experte ruft dich an.“
//
// Gespeicherte Antwortwerte bleiben unverändert (Filter, Lead-PDF, Perspective-Feldnamen): Beschriftungen, die vom
// Wert abweichen, stehen in den *_LABEL-Tabellen unten.
//
// Fassung b einzelner Schritte für A/B-Tests: in lib/funnel/definition.ts (test.b), Texte dafür ebenfalls hier.

export const PKV_TEXTE = {
  seitenTitel: "PKV-Beitrag kostenlos prüfen lassen",
  // Fortschritt über alle Schritte bis zum Absenden (nur für Screenreader; sichtbar ist der Balken)
  fortschritt: (nr: number, von: number) => `Schritt ${nr} von ${von}`,
  letzterSchritt: "Letzter Schritt",
  zurueck: "Zurück",
  weiter: "Weiter",

  start: {
    ueberschrift: "Über 650 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen",
    // Advertorial (Ole, 21.11.2026; texte.md Abschnitt 2, etwa 130 Wörter): als Anzeige gekennzeichnet, Du-Form, keine
    // unbelegten Behauptungen. **fett** = Kernsatz je Absatz. „bis zu 50 %“ nur mit Fußnote direkt darunter (L8).
    anzeige: "Anzeige",
    einleitung: "Die Beiträge in der privaten Krankenversicherung sind für viele Versicherte deutlich gestiegen. Oft, ohne dass die Leistungen besser geworden sind.",
    sofortlink: "Direkt zur kostenlosen Prüfung",
    text: [
      "Wer schon länger privat versichert ist, steckt häufig noch in einem älteren Tarif. **Deine Versicherung bietet heute meist auch andere Tarife an, die günstiger sein können.**",
      "**Nach § 204 VVG darfst du innerhalb deiner Versicherung in einen anderen Tarif wechseln.** Deine Altersrückstellungen werden dabei angerechnet. Du musst die Versicherung also nicht verlassen.",
      "Je nach Tarif, Leistungen und Selbstbehalt sind **Ersparnisse von bis zu 50 %*** möglich.",
      "**So geht es:** Du beantwortest ein paar kurze Fragen, das dauert etwa 1 Minute. Ein PKV-Experte prüft deinen Tarif kostenlos und ruft dich mit dem Ergebnis an.",
    ],
    // L8: gleiche Fußnote wie im Schritt Kontakt, direkt unter dem Absatz mit der Zahl
    fussnote: "Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.",
    vertrauen: ["Kostenlos und unverbindlich", "Du bleibst bei deiner Versicherung", "Dauert etwa 1 Minute"],
    frage: "Bist du gesetzlich oder privat versichert?",
    /** Sticky-Knopf am Handy (nur solange die Frage-Karte nicht zu sehen ist) */
    sticky: "Zur kostenlosen Prüfung",
  },
  // A/B-Test funnel_pkv_anlass (lib/experimente.ts, Hypothese lib/ab-hypothesen.ts): Überschrift mit Anlass
  startB: {
    ueberschrift: "Hat deine PKV den Beitrag zum 1.\u00a0Januar erhöht? Lass deinen Tarif kostenlos prüfen",
  },

  versicherung: {
    frage: "Bei welcher Versicherung bist du privat versichert?",
    hinweis: "Geprüft wird ein Wechsel innerhalb deiner Versicherung.",
    // Die 8 häufigsten als Kacheln, alle übrigen über die Suche (ux-ui.md Muss 6)
    suche: "Andere Versicherung suchen",
    keineTreffer: "Nicht dabei? Wähle „Andere Versicherung“.",
  },
  situation: { frage: "Was machst du beruflich?" },
  dauer: { frage: "Wie lange bist du schon bei deiner jetzigen PKV?" },
  beitrag: {
    frage: "Wie hoch ist dein Monatsbeitrag ungefähr?",
    // Ole 20.11.2026: gemeint ist der ganze Beitrag (vor Arbeitgeberzuschuss). Hinweis je Situation (Personas,
    // 21.11.2026): Zuschuss nur bei Angestellten, Beamte zahlen ihren Eigenanteil nach Beihilfe.
    hinweis: "Dein ganzer Monatsbeitrag. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.",
    hinweisAngestellt: "Dein ganzer Beitrag vor Arbeitgeberzuschuss. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.",
    hinweisBeamter: "Dein Eigenanteil nach Beihilfe. Ein runder Wert reicht, er steht in deinem letzten Beitragsschreiben.",
    platzhalter: "z.\u00a0B. 850",
    einheit: "€ im Monat",
    fehler: "Bitte gib deinen Monatsbeitrag in Euro ein, z.\u00a0B. 850.",
  },
  geburtsdatum: {
    frage: "Wann bist du geboren?",
    hinweis: "Damit dein Experte passende Tarife findet.",
    platzhalter: "TT.MM.JJJJ",
    fehler: "Bitte gib dein Geburtsdatum ein, z.\u00a0B. 14.03.1975.",
    fehlerDatum: "Dieses Datum gibt es nicht. Bitte prüfe Tag und Monat.",
    fehlerAlter: "Bitte prüfe dein Geburtsjahr. Die Prüfung gibt es ab 18 Jahren.",
  },
  wohnort: {
    frage: "Wie lauten deine Postleitzahl und dein Wohnort?",
    hinweis: "Letzte Frage. Damit dein Experte deine Anfrage vollständig hat.",
    plz: "Postleitzahl",
    ort: "Wohnort",
    fehlerPlz: "Bitte gib eine Postleitzahl mit 5 Ziffern ein.",
    fehlerOrt: "Bitte gib deinen Wohnort ein.",
  },

  // Lob wie bei Perspective, aber wahr (privat, ab 650 €) und ohne Ergebnisversprechen; drei Haken-Zeilen, linksbündig.
  // „ob und wie viel“ nach Recht (docs/recht/pkv-funnel.md Abschnitt 2). Kein Ausrufezeichen (CI), kein „Symbolbild“ (Ole).
  // Nah am Perspective-Original (Ole, 21.11.2026, zweimal bestätigt: „hier wollten wir nah an Perspective bleiben“).
  // Perspective: „Fast fertig...! Sehr gut! Wir können deinen Beitrag sehr wahrscheinlich stark reduzieren!“ plus drei
  // Absätze. Das Versprechen vor der Prüfung ist ersetzt (L8), „ob und wie viel“ (Recht), sonst sinngemäß gleich.
  fastFertig: {
    ueberschrift: "Fast fertig! Bei Beiträgen in deiner Höhe steckt oft viel Sparpotenzial.",
    text: [
      "Nachdem du dich auf der nächsten Seite eingetragen hast, prüft ein PKV-Experte kostenlos für dich, ob und wie viel Sparpotenzial du realisieren kannst. Mit dem Ergebnis meldet er sich telefonisch bei dir.",
      "Die Prüfung vorab und das persönliche Gespräch sind für dich kostenlos und unverbindlich.",
      "Danach entscheidest du ganz entspannt, ob du in deinem aktuellen Tarif bleibst oder einen günstigeren wählst.",
    ],
    knopf: "Weiter",
  },

  name: {
    // Reine Frage, ohne Werbezeile (Feinschliff 21.11.2026: „bis zu 50 %“ steht nur noch auf Kontakt)
    frage: "Wie darf dich dein Experte ansprechen?",
    vorname: "Vorname",
    nachname: "Nachname",
    vertraulich: "Deine Daten werden vertraulich behandelt.",
    fehlerVorname: "Bitte gib deinen Vornamen ein.",
    fehlerNachname: "Bitte gib deinen Nachnamen ein.",
  },

  kontakt: {
    // L8: „bis zu 50 %“ (Risiko trägt Ole, 20.11.2026) nur mit Fußnote; im Funnel nur hier, kurz vor dem Absenden
    ueberschrift: "Spare bis zu 50 % deines PKV-Beitrags",
    fussnote: "Im Einzelfall möglich, abhängig von Tarif, Leistungen und Selbstbehalt. Ob und wie viel du sparen kannst, zeigt die Prüfung.",
    frage: "Unter welcher Nummer erreicht dich dein Experte?",
    frageMitName: (vorname: string) => `${vorname}, unter welcher Nummer erreicht dich dein Experte?`,
    hinweis: "Er ruft dich mit deinem Ergebnis an, in der Regel innerhalb von 24 bis 48 Stunden.",
    telefon: "Telefon (am besten Handy)",
    telefonPlatzhalter: "z.\u00a0B. 0151 23456789",
    telefonHinweis: "Nur ein Experte bekommt deine Nummer.",
    email: "E-Mail",
    // Knopfname steht wörtlich in der Einwilligung (einwilligungTeile)
    // Kein Satz unter dem Knopf (Feinschliff 21.11.2026): „Kostenlos“ steht im Knopf
    knopf: "Kostenlos prüfen lassen",
    fehlerEmail: "Bitte gib eine gültige E-Mail-Adresse ein.",
    fehlerTelefon: "Bitte gib eine Nummer ein, unter der du gut erreichbar bist, z.\u00a0B. 0151 23456789.",
    fehlerSenden: "Das hat leider nicht geklappt. Deine Angaben sind noch da.",
    nochmal: "Noch einmal senden",
    sendet: "Wird gesendet …",
  },

  danke: {
    // Ohne Telefonnummer des Experten (Ole, 21.11.2026), kein Ausrufezeichen (CI)
    ueberschrift: "Danke. Dein Experte ruft dich an.",
    ueberschriftMitName: (vorname: string) => `Danke, ${vorname}. Dein Experte ruft dich an.`,
    untertitel: "So geht es weiter:",
    schritte: [
      "Ein PKV-Experte aus unserer Partnerliste ruft dich an, in der Regel innerhalb von 24 bis 48 Stunden.",
      "Geh auch bei unbekannten Nummern ran, das ist wahrscheinlich dein Experte.",
      "Leg dir am besten dein letztes Beitragsschreiben bereit.",
    ],
    verpasst: "Anruf verpasst? Ruf die Nummer einfach zurück.",
    // Nur wenn die Mail „Dein Experte“ rausging (L9, ohne Nummer)
    mail: "Den Namen deines Experten haben wir dir auch per E-Mail geschickt.",
    experte: "Dein Experte",
  },

  endeGesetzlich: {
    ueberschrift: "Diese Prüfung ist nur für Privatversicherte",
    text: "Du bist doch privat versichert? Dann geht es hier weiter.",
    knopf: "Ich bin doch privat versichert",
  },
  endeBeamte: {
    // Ole, 21.11.2026: Beamte sind nicht optimierbar (Beihilfe, Restkostentarif)
    ueberschrift: "Für Beamte lohnt sich diese Prüfung leider nicht",
    text: "Mit Beihilfe bist du nur für deinen Eigenanteil privat versichert. Ein interner Tarifwechsel senkt diesen Beitrag in der Regel nicht spürbar. Deshalb bieten wir die Prüfung für Beamtinnen und Beamte nicht an. Danke für dein Interesse.",
    knopf: "Andere Situation wählen",
  },
  endeDebeka: {
    // Ole, 21.11.2026: Debeka ist nicht optimierbar. Sachlich, ohne Wertung des Versicherers.
    ueberschrift: "Bei der Debeka lohnt sich diese Prüfung leider nicht",
    text: "Durch den Tarifaufbau der Debeka lässt sich der Beitrag mit einem internen Tarifwechsel in der Regel nicht senken. Deshalb bieten wir die Prüfung für Debeka-Versicherte nicht an. Danke für dein Interesse.",
    knopf: "Andere Versicherung wählen",
  },
  endeBeitrag: {
    // Freundlich, mit klarem nächsten Schritt (Personas, 21.11.2026); sachlich richtig (Recht: wir prüfen nur nicht)
    ueberschrift: "Diese Prüfung gibt es ab 650\u00a0€ im Monat",
    text: "Danke für deine Angaben. Steigt dein Beitrag einmal über 650\u00a0€, prüft ein Experte gern kostenlos für dich. Falls du dich vertippt hast, kannst du den Betrag ändern.",
    knopf: "Beitrag ändern",
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
  // Alle Krankenvollversicherer (Ole, 21.11.2026: „hier müssen alle stehen“), Mitglieder des PKV-Verbands mit
  // Vollversicherung plus Postbeamtenkrankenkasse und KVB. Barmenia und Gothaer getrennt (rechtlich noch zwei Versicherer,
  // Kunden kennen ihren Namen). Dazu alle Namen aus der Perspective-Liste (DBV, Deutscher Ring, Die Bayerische, Ergo, Mannheimer, VGH). Stand Marktwissen 21.11.2026, Abgleich mit der Mitgliederliste pkv.de offen.
  "Allianz",
  "Alte Oldenburger",
  "ARAG",
  "AXA",
  "Barmenia",
  "Bayerische Beamtenkrankenkasse",
  "Concordia",
  "Continentale",
  "DBV",
  "Debeka",
  "Deutscher Ring",
  "DEVK",
  "Die Bayerische",
  "DKV",
  "Ergo",
  "FAMK",
  "Generali (ehem. Central)",
  "Gothaer",
  "HALLESCHE",
  "HanseMerkur",
  "HUK-Coburg",
  "Inter",
  "KVB (Bundesbahnbeamte)",
  "LKH",
  "LVM",
  "Mannheimer",
  "Mecklenburgische",
  "Münchener Verein",
  "Nürnberger",
  "ottonova",
  "Pax-Familienfürsorge",
  "Postbeamtenkrankenkasse",
  "Provinzial",
  "R+V",
  "SDK (Süddeutsche)",
  "Signal Iduna",
  "Union Krankenversicherung",
  "uniVersa",
  "VGH",
  "vigo",
  "Württembergische",
  "Sonstige",
] as const;

/**
 * Die 8 häufigsten Versicherer als Kacheln (ux-ui.md Muss 6), alle übrigen über die Suche. Reihenfolge vorerst nach
 * Marktgröße (Vollversicherte); mit den Zahlen der bisherigen Perspective-Leads abgleichen (Data/BI).
 */
// Ohne Debeka (nicht optimierbar, Ole 21.11.2026), dafür Gothaer
export const PKV_VERSICHERER_HAEUFIG = ["DKV", "Allianz", "AXA", "Signal Iduna", "HUK-Coburg", "Barmenia", "Continentale", "Gothaer"] as const;

/** Beschriftung je Versicherer, wo sie vom gespeicherten Wert abweicht (texte.md Nr. 2 und 3). */
export const PKV_VERSICHERER_LABEL: Record<string, string> = { Sonstige: "Andere Versicherung", HALLESCHE: "Hallesche" };

/**
 * Gespeicherte Werte (unverändert wie bei Perspective: Filter „Beamte“, Lead-PDF). Reihenfolge nach Zielgruppe
 * (ux-ui.md Muss 7): die vier häufigsten Antworten zuerst.
 */
export const PKV_SITUATIONEN = ["Angestellt", "Selbstständig", "Beamter", "Rentner", "Nicht erwerbstätig", "Hausmann/Hausfrau", "Auszubildender", "Student", "Schüler"] as const;

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
