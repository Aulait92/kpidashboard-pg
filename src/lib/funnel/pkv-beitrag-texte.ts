// Alle Texte des eigenen PKV-Funnels (beitrag.pkv-tarife.com, /f/pkv-beitrag), an einer Stelle für die Rechtsprüfung
// (Ole, 20.11.2026). Nachbau des bisherigen Perspective-Funnels „beitrag-halbieren“, Du-Form, keine Gedankenstriche
// (AGENTS.md), keine neuen Versprechen außer „bis zu 50 %“ (von Ole freigegeben).
//
// Rechtlich zu prüfen (markiert mit RECHT):
//   1. EINWILLIGUNG: Text unter dem Absende-Knopf (Weitergabe an den Berater, Kontakt per Telefon/E-Mail, Widerruf).
//   2. COOKIES: Hinweis zu Meta-Cookies (Pixel) mit gleichwertigen Knöpfen; Datenschutzerklärung muss Meta-Pixel,
//      Conversions API und Funnel-Messung nennen.
//   3. VERSPRECHEN: „bis zu 50 %“ (freigegeben), Zwischenseite bewusst vorsichtiger als bei Perspective
//      („sehr wahrscheinlich stark reduzieren“ entfällt).
//   4. Pflichtlinks Impressum und Datenschutz (performancegrowth.de) auf jeder Seite.
//
// Fassung b einzelner Schritte für A/B-Tests: in lib/funnel/definition.ts (test.b), Texte dafür ebenfalls hier ablegen.

export const PKV_TEXTE = {
  seitenTitel: "PKV-Beitrag prüfen",
  marke: "pkv-tarife.com",
  fortschritt: (nr: number, von: number) => `Frage ${nr} von ${von}`,
  zurueck: "Zurück",
  weiter: "Weiter",

  start: {
    ueberschrift: "Viele PKV-Kunden mit Beiträgen über 700 € zahlen unnötig zu viel: Ein interner Tarifwechsel kann helfen",
    text: [
      "In den letzten Jahren sind die Beiträge in der privaten Krankenversicherung für viele Versicherte deutlich gestiegen. Besonders Kunden mit monatlichen Beiträgen von über 700 € stellen oft fest, dass ihre Kosten immer weiter zunehmen, ohne dass sich die Leistungen spürbar verbessert haben.",
      "Ein Wechsel in einen anderen Tarif deiner bisherigen Versicherung kann den Beitrag senken. Ein Experte prüft das kostenlos für dich.",
    ],
    frage: "Bist du aktuell gesetzlich oder privat versichert?",
  },
  // Beispiel für eine Fassung b (Experiment funnel_pkv_beispiel, aus)
  startB: {
    ueberschrift: "Über 700 € im Monat für deine PKV? Ein interner Tarifwechsel kann helfen",
  },

  versicherung: { frage: "Bei welcher Versicherung bist du aktuell versichert?" },
  situation: { frage: "Wie ist deine aktuelle Situation?" },
  dauer: { frage: "Wie lange bist du bereits bei deiner bestehenden PKV versichert?" },
  beitrag: {
    frage: "Wie hoch ist circa dein aktueller monatlicher Beitrag?",
    platzhalter: "z. B. 850",
    einheit: "€ im Monat",
    fehler: "Bitte gib deinen Monatsbeitrag in Euro ein.",
  },
  geburtsdatum: {
    frage: "Wie lautet dein Geburtsdatum?",
    hinweis: "Für die genaue Berechnung notwendig.",
    platzhalter: "TT.MM.JJJJ",
    fehler: "Bitte gib dein Geburtsdatum ein, z. B. 14.03.1975.",
  },
  wohnort: {
    frage: "Wie lautet deine Postleitzahl und dein Wohnort?",
    hinweis: "Für die genaue Berechnung notwendig.",
    plz: "Postleitzahl",
    ort: "Wohnort",
    fehlerPlz: "Bitte gib eine Postleitzahl mit 5 Ziffern ein.",
    fehlerOrt: "Bitte gib deinen Wohnort ein.",
  },

  // RECHT 3: vorsichtiger als bei Perspective, kein „sehr wahrscheinlich stark reduzieren“
  fastFertig: {
    ueberschrift: "Fast fertig!",
    text: "Deine Angaben passen gut für eine Tarifprüfung. Nachdem du dich auf der nächsten Seite eingetragen hast, prüft ein Experte kostenlos für dich, wie viel Sparpotenzial du realisieren kannst. Mit dem Ergebnis meldet er sich telefonisch bei dir.",
    knopf: "Weiter zur Auswertung",
  },

  name: {
    ueberschrift: "Spare jetzt bis zu 50 % deines PKV-Beitrags",
    frage: "Wie dürfen wir dich ansprechen?",
    vorname: "Vorname",
    nachname: "Nachname",
    vertraulich: "Deine Daten werden vertraulich behandelt.",
    fehlerVorname: "Bitte gib deinen Vornamen ein.",
    fehlerNachname: "Bitte gib deinen Nachnamen ein.",
  },

  kontakt: {
    frage: "Unter welchen Kontaktdaten erreicht dich dein Experte mit deinem Ergebnis?",
    email: "E-Mail",
    telefon: "Telefon",
    telefonPlatzhalter: "z. B. 0151 23456789",
    knopf: "Jetzt Tarifoptimierung erhalten!",
    // RECHT 1: Einwilligung (Text wie bisher bei Perspective, Knopfname muss mit `knopf` übereinstimmen)
    einwilligung:
      "Ich willige durch „Jetzt Tarifoptimierung erhalten!“ ein, dass ein spezialisierter PKV-Experte mich kontaktieren und mir mein persönliches Sparpotenzial zeigen darf. Dafür dürfen meine Angaben an den Berater weitergegeben werden. (Jederzeit widerrufbar.)",
    fehlerEmail: "Bitte gib eine gültige E-Mail-Adresse ein.",
    fehlerTelefon: "Bitte gib eine gültige deutsche Telefonnummer ein.",
    fehlerSenden: "Das hat leider nicht geklappt. Bitte versuche es gleich noch einmal.",
    sendet: "Wird gesendet …",
  },

  danke: {
    ueberschrift: "Vielen Dank!",
    untertitel: "Deine Anfrage ist bestätigt.",
    text: "Ein PKV-Experte meldet sich zeitnah bei dir, um deine Einsparmöglichkeiten einzuschätzen und mögliche nächste Schritte zu besprechen. Bitte halte dein Telefon bereit, in der Regel innerhalb von 24 bis 48 Stunden.",
  },

  endeGesetzlich: {
    ueberschrift: "Danke für dein Interesse!",
    text: "Diese Tarifprüfung ist nur für privat Krankenversicherte gedacht. Für die gesetzliche Krankenversicherung können wir dir hier leider nicht weiterhelfen.",
    knopf: "Angabe ändern",
  },
  endeBeitrag: {
    ueberschrift: "Danke für deine Angaben!",
    text: "Beiträge unter 650 € lassen sich leider nicht mehr optimieren.",
    knopf: "Beitrag korrigieren",
  },

  // RECHT 2: Cookie-Hinweis für den Meta-Pixel (nur mit Einwilligung, Knöpfe gleichwertig)
  cookies: {
    text: "Dürfen wir Cookies von Meta (Facebook) nutzen, um zu messen, welche Werbung hilft?",
    mehr: "Mehr dazu",
    ablehnen: "Nein danke",
    zustimmen: "Einverstanden",
  },

  impressum: "Impressum",
  datenschutz: "Datenschutz",
  impressumUrl: "https://performancegrowth.de/impressum",
  datenschutzUrl: "https://performancegrowth.de/datenschutz",
} as const;

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

export const PKV_SITUATIONEN = ["Angestellt", "Selbstständig", "Beamter", "Auszubildender", "Student", "Hausmann/Hausfrau", "Schüler", "Nicht erwerbstätig", "Rentner"] as const;

export const PKV_DAUER = ["0 bis 5 Jahre", "6 bis 10 Jahre", "11 bis 20 Jahre", "Über 20 Jahre"] as const;
