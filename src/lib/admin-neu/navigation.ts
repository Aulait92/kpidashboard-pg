// Neuer Admin (Ole, 16.11.2026; Admin v2 nach Rollen seit 18.11.2026): EINZIGE Quelle für Bereiche, Seiten, Reiter,
// „+ Neu“ und die Seitenliste der Suche. Seitenleiste, Leiste unten, Reiter, Platzhalter, Suche, Durchklick-Skript und
// Inventar-Test lesen nur von hier. Konventionen: docs/ux/admin-neu/README.md, Plan v2: docs/ux/admin-v2-plan.md.
//
// Admin v2 (Paket A1): Navigation nach Rollen statt nach Funktionen. Oben „Mein Tag“ und die vier Rollen Verkaufen,
// Betreuen, Liefern, Geld. Umbau 20.11.2026 (Rahmen, Ziel SUS 90+ wie /buyer): unten nur noch Einstellungen; Werkzeuge
// (Technik) und „Was wo ist“ (Umzugshilfe) liegen im Profilmenü und in der Suche, die Handy-Leiste hat 5 Punkte ohne „Mehr“.
// Die Adressen der Seiten bleiben (Push-Ziele, Umzugs-Links in push-ziel.ts/umzug.ts), nur die Gruppierung ändert sich:
// z. B. liegt /admin/neu/leads/chats jetzt unter Betreuen, /admin/neu/zahlen/qualitaet ebenfalls.
//
// Eine Seite ergänzen: Eintrag in `seiten` der Rolle, dazu src/app/admin/neu/<pfad>/page.tsx.
// `view` ist die Ansicht aus der Demo v1 (docs/ux/admin-neu/demo.html, Feld demo_view im Inventar).

// Reine Daten ohne Importe: auch in der Middleware, in Tests und in Node-Skripten nutzbar
// (tools/admin-neu/durchklick.mjs). Symbole je Bereich: src/components/admin-neu/rahmen/symbole.ts.

export const NEU = "/admin/neu";

export type BereichId = "mein-tag" | "verkaufen" | "betreuen" | "liefern" | "geld" | "werkzeuge" | "einstellungen" | "was-wo-ist";

/** Reiter-Leisten: je Rolle eine, dazu Marketing (eigene Leiste der Marketing-Seiten, erreichbar über „Mehr“ in Verkaufen) und die Kundenakte. */
export type ReiterGruppe = BereichId | "marketing" | "kundenakte";

/** Zweite Reiter-Leiste unter der Leiste einer Rolle (Seite zeigt beide). */
// Admin-Umbau (19.11.2026): Marketing ist keine zweite Leiste unter Verkaufen mehr (UX-Regel: eine Reiterleiste je Seite).
export const OBER_REITER: Partial<Record<ReiterGruppe, ReiterGruppe>> = {};

type Reiter = { gruppe: ReiterGruppe; label: string };

export type NeuSeite = {
  /** Ansicht aus der Demo (demo_view im Inventar). Mehrere Seiten dürfen dieselbe Ansicht haben. */
  view: string;
  /** Adresse im neuen Admin; `[id]` bzw. `[audience]` für Detailseiten. */
  pfad: string;
  titel: string;
  /** Ein Satz unter dem Titel (optional, UX-Regel: nur wenn der Titel nicht reicht). */
  untertitel?: string;
  /** Heutige Seite(n) mit derselben Aufgabe. Die erste verlinkt der Platzhalter („So lange: heutige Seite“). */
  alt: string[];
  /** Seite ist im neuen Admin fertig gebaut (kein Platzhalter mehr). Dann führen Links auf die alte Seite
   *  innerhalb der neuen Oberfläche hierher (src/lib/admin-neu/umzug.ts). */
  fertig?: boolean;
  /** Reiter in einer oder zwei Leisten (Gruppe + Beschriftung). Ohne = Unter- oder Detailseite. */
  reiter?: Reiter | Reiter[];
  /** Gruppe auf der Übersicht (Bereiche Einstellungen und Werkzeuge). */
  gruppe?: string;
  /** Zusätzliche Suchwörter für die globale Suche (Seiten mit `[` im Pfad erscheinen dort nicht). */
  suchwoerter?: string;
};

export type NeuBereich = {
  id: BereichId;
  label: string;
  /** Kurzform für die Leiste unten am Handy */
  kurz: string;
  /** Zweite Zeile in der Seitenleiste (wofür die Rolle da ist) */
  hinweis?: string;
  /** Startseite des Bereichs */
  pfad: string;
  /** Seitenleiste: oben (Mein Tag und Rollen), unten (Einstellungen), nur im Profilmenü (Was wo ist) oder keiner
   *  (Technik: nur Rolle für Mein Tag, Seiten unter Einstellungen). Seiten im Profilmenü markieren „Einstellungen“. */
  ort: "oben" | "unten" | "profil" | "keiner";
  /** Handy: in der Leiste unten (höchstens 5 Punkte, wie /buyer), über das Profilmenü oben rechts oder keiner */
  handy: "leiste" | "profil" | "keiner";
  seiten: NeuSeite[];
};

const n = (p = "") => `${NEU}${p}`;

export const BEREICHE: NeuBereich[] = [
  {
    id: "mein-tag",
    label: "Mein Tag",
    kurz: "Mein Tag",
    pfad: n(),
    ort: "oben",
    handy: "leiste",
    seiten: [
      { view: "heute", pfad: n(), titel: "Mein Tag", alt: ["/admin/heute"], suchwoerter: "Heute Start Braucht Sie Freigaben", fertig: true },
      { view: "vertrieb-aufgaben", pfad: n("/vertrieb/aufgaben"), titel: "Aufgaben", alt: ["/admin/heute/aufgaben"], suchwoerter: "Wiedervorlage Nachfassen", fertig: true },
    ],
  },
  {
    id: "verkaufen",
    label: "Verkaufen",
    kurz: "Verkaufen",
    hinweis: "Vertrieb, Marketing",
    pfad: n("/vertrieb"),
    ort: "oben",
    handy: "leiste",
    seiten: [
      { view: "vertrieb", pfad: n("/vertrieb"), titel: "Pipeline", alt: ["/admin/vertrieb/pipeline"], reiter: { gruppe: "verkaufen", label: "Pipeline" }, suchwoerter: "Vertrieb Akquise Stufen", fertig: true },
      { view: "vertrieb-kontakte", pfad: n("/vertrieb/kontakte"), titel: "Kontakte", alt: ["/admin/vertrieb/kontakte"], reiter: { gruppe: "verkaufen", label: "Kontakte" }, suchwoerter: "Vertrieb Cold Mail", fertig: true },
      { view: "vertrieb-termine", pfad: n("/vertrieb/termine"), titel: "Termine", alt: ["/admin/vertrieb/buchungsseite", "/admin/vertrieb/termine"], reiter: { gruppe: "verkaufen", label: "Termine" }, suchwoerter: "Vertrieb Buchungsseite", fertig: true },
      { view: "vertrieb-angebote", pfad: n("/vertrieb/angebote"), titel: "Angebote", alt: ["/admin/vertrieb/angebote"], reiter: { gruppe: "verkaufen", label: "Angebote" }, suchwoerter: "Vertrieb", fertig: true },
      // Marketing (Admin-Umbau 19.11.2026): kein Reiter von Verkaufen mehr, sondern über „Mehr“ im Kopf von Verkaufen;
      // die drei Marketing-Seiten haben eine eigene Leiste. Webseite & Rechner ist Einrichtung (ohne Reiter, Link in Unterlagen).
      { view: "marketing", pfad: n("/marketing"), titel: "LinkedIn", alt: ["/admin/marketing/linkedin", "/admin/marketing"], reiter: { gruppe: "marketing", label: "LinkedIn" }, suchwoerter: "Marketing Entwürfe Posts", fertig: true },
      { view: "marketing-empfehlungen", pfad: n("/marketing/empfehlungen"), titel: "Empfehlungen", alt: ["/admin/marketing/empfehlungen"], reiter: { gruppe: "marketing", label: "Empfehlungen" }, suchwoerter: "Marketing Kollegen empfehlen Prämie", fertig: true },
      { view: "marketing-unterlagen", pfad: n("/marketing/unterlagen"), titel: "Unterlagen", alt: ["/admin/marketing/unterlagen"], reiter: { gruppe: "marketing", label: "Unterlagen" }, suchwoerter: "Marketing Präsentation", fertig: true },
      { view: "marketing-webseite", pfad: n("/marketing/webseite"), titel: "Webseite & Rechner", alt: ["/admin/einstellungen/rechner"], suchwoerter: "Marketing Preise Rechner Einstellungen", fertig: true },
      // Datenschutz und Recht (Ole, 19.11.2026): Liste der Fälle aus der Kaltakquise, erreichbar über Kontakte (Umschalter)
      { view: "vertrieb-datenschutz", pfad: n("/vertrieb/datenschutz"), titel: "Datenschutz und Recht", alt: ["/admin/vertrieb/datenschutz"], suchwoerter: "DSGVO Auskunft Löschung Widerspruch Abmahnung Art. 15 Art. 17", fertig: true },
      // Geplante Nachrichten (Ole, 20.11.2026): automatische E-Mails und WhatsApps der nächsten 14 Tage, erreichbar über Mein Tag → Vertrieb
      { view: "vertrieb-nachrichten", pfad: n("/vertrieb/nachrichten"), titel: "Geplante Nachrichten", alt: [], suchwoerter: "Erinnerung automatisch WhatsApp E-Mail Zahlungserinnerung Terminerinnerung Bonus Follow-up Mahnung", fertig: true },
      { view: "kontakt-neu", pfad: n("/vertrieb/kontakte/neu"), titel: "Neuer Kontakt", alt: ["/admin/vertrieb/kontakte/neu"], fertig: true },
      { view: "kontakt", pfad: n("/vertrieb/kontakte/[id]"), titel: "Kontakt", alt: ["/admin/vertrieb/kontakte/[id]"], fertig: true },
      { view: "angebot-neu", pfad: n("/vertrieb/kontakte/[id]/angebot"), titel: "Angebot erstellen", alt: ["/admin/vertrieb/kontakte/[id]/angebot"], fertig: true },
      { view: "praesentation", pfad: n("/vertrieb/kontakte/[id]/praesentation"), titel: "Präsentation", alt: ["/admin/vertrieb/kontakte/[id]/praesentation"], fertig: true },
      { view: "marketing-unterlagen", pfad: n("/marketing/unterlagen/praesentation/[audience]"), titel: "Präsentation", alt: ["/admin/marketing/unterlagen/praesentation/[audience]"], fertig: true },
    ],
  },
  {
    id: "betreuen",
    label: "Betreuen",
    kurz: "Betreuen",
    hinweis: "Kundenbetreuung",
    pfad: n("/kunden"),
    ort: "oben",
    handy: "leiste",
    seiten: [
      { view: "kunden", pfad: n("/kunden"), titel: "Kunden", alt: ["/admin/kunden", "/admin/kunden/pipeline", "/admin/vertrieb/kunden"], reiter: { gruppe: "betreuen", label: "Kunden" }, suchwoerter: "Kundenliste Onboarding", fertig: true },
      { view: "leads-chats", pfad: n("/leads/chats"), titel: "Chats", alt: ["/admin/whatsapp"], reiter: { gruppe: "betreuen", label: "Chats" }, suchwoerter: "WhatsApp Support-Nummer Assistent", fertig: true },
      { view: "kunden-berichte", pfad: n("/kunden/berichte"), titel: "Monatsberichte", alt: ["/admin/monatsberichte"], reiter: { gruppe: "betreuen", label: "Berichte" }, suchwoerter: "Monatsberichte freigeben", fertig: true },
      { view: "zahlen-qualitaet", pfad: n("/zahlen/qualitaet"), titel: "Qualität & Nutzung", alt: ["/admin/zahlen/stornoquote", "/admin/zahlen/whatsapp", "/admin/nutzung"], reiter: { gruppe: "betreuen", label: "Qualität" }, suchwoerter: "Stornoquote WhatsApp-Zustellung Nutzung NPS", fertig: true },
      // Alter Link auf einen Bericht: leitet in die Kundenakte (Reiter Monatsberichte, Bericht geöffnet)
      { view: "kunden-berichte", pfad: n("/kunden/berichte/[id]"), titel: "Monatsbericht", alt: ["/admin/monatsberichte/[id]"], fertig: true },
      { view: "leads-chat", pfad: n("/leads/chats/[id]"), titel: "Chat", alt: ["/admin/whatsapp"], fertig: true },
      { view: "kunde", pfad: n("/kunden/[id]"), titel: "Kunde", alt: ["/admin/kunden/[id]"], reiter: { gruppe: "kundenakte", label: "Übersicht" }, fertig: true },
      { view: "kunde", pfad: n("/kunden/[id]/kontakt"), titel: "Kontaktakte", alt: [], fertig: true },
      { view: "kunde-leads", pfad: n("/kunden/[id]/leads"), titel: "Leads", alt: ["/admin/kunden/[id]/leads"], reiter: { gruppe: "kundenakte", label: "Leads" }, fertig: true },
      { view: "kunde-optimierung", pfad: n("/kunden/[id]/optimierung"), titel: "Optimierung", alt: ["/admin/kunden/[id]/optimierung"], fertig: true },
      { view: "kunde-whatsapp", pfad: n("/kunden/[id]/whatsapp"), titel: "WhatsApp", alt: ["/admin/kunden/[id]/whatsapp"], reiter: { gruppe: "kundenakte", label: "WhatsApp" }, fertig: true },
      { view: "kunde-berichte", pfad: n("/kunden/[id]/berichte"), titel: "Monatsberichte", alt: [], fertig: true },
      { view: "kunde-abrechnung", pfad: n("/kunden/[id]/abrechnung"), titel: "Abrechnung", alt: ["/admin/kunden/[id]/abrechnung"], reiter: { gruppe: "kundenakte", label: "Abrechnung" }, fertig: true },
      { view: "kunde-team", pfad: n("/kunden/[id]/team"), titel: "Team & Logins", alt: ["/admin/kunden/[id]/logins", "/admin/buyers"], reiter: { gruppe: "kundenakte", label: "Team" }, fertig: true },
      { view: "leads-ki", pfad: n("/kunden/[id]/kampagne"), titel: "Kampagne mit KI", alt: ["/admin/kunden/[id]/kampagne"], fertig: true },
    ],
  },
  {
    id: "liefern",
    label: "Liefern",
    kurz: "Liefern",
    hinweis: "Pay-per-Lead",
    pfad: n("/leads/ppl"),
    ort: "oben",
    handy: "leiste",
    seiten: [
      { view: "leads-ppl", pfad: n("/leads/ppl"), titel: "Pay-per-Lead", alt: ["/admin/ppl"], reiter: { gruppe: "liefern", label: "Pay-per-Lead" }, suchwoerter: "PPL Bezug Bezüge Storno Reklamation Käufer Auswertung Eingang Heinrich von Kleist HvK Gutschrift Slack", fertig: true },
      { view: "leads-alle", pfad: n("/leads/alle"), titel: "Alle Leads", alt: ["/admin/leads"], reiter: { gruppe: "liefern", label: "Leads" }, fertig: true },
      { view: "leads", pfad: n("/leads"), titel: "Formulare", alt: ["/admin/lead-eingang"], reiter: { gruppe: "liefern", label: "Formulare" }, suchwoerter: "Lead-Eingang Leadformular Zuordnung Meta", fertig: true },
      { view: "leads-optimierung", pfad: n("/leads/werbekonten"), titel: "Werbekonten", alt: ["/admin/optimierung", "/admin/media-buyer"], reiter: { gruppe: "liefern", label: "Werbekonten" }, suchwoerter: "Optimierung Media Buyer Budget Pool Tagesbudget Maßnahmen freigeben", fertig: true },
      // A/B-Tests: kein eigener Reiter mehr (höchstens 4 je Rolle, UX-Umbau 20.11.2026), erreichbar über Leads › „A/B-Tests“ und die Suche
      { view: "leads-ab-tests", pfad: n("/leads/ab-tests"), titel: "A/B-Tests", alt: [], suchwoerter: "Splittest Experiment Vorlagen Fassung Antwortquote Terminquote Erstanschreiben Hypothese", fertig: true },
      { view: "leads-bezug", pfad: n("/leads/ppl/bezug/[id]"), titel: "Bezug", alt: ["/admin/ppl/bezug/[id]"], fertig: true },
      { view: "leads-konto", pfad: n("/leads/werbekonten/[id]"), titel: "Werbekonto", alt: ["/admin/optimierung/[id]"], fertig: true },
    ],
  },
  {
    id: "geld",
    label: "Geld",
    kurz: "Geld",
    hinweis: "Finanzen",
    pfad: n("/zahlen"),
    ort: "oben",
    handy: "leiste",
    seiten: [
      { view: "zahlen", pfad: n("/zahlen"), titel: "Übersicht", alt: ["/admin/zahlen"], reiter: { gruppe: "geld", label: "Übersicht" }, suchwoerter: "Zahlen Kennzahlen MRR Ergebnis Gewinn BWA Wachstum Kohorten Wirtschaftlichkeit Vertrieb Pay-per-Lead Dashboard", fertig: true },
      // Leads & Werbung (früher „/“, Umzug 22.11.2026): Trichter, Monatsziele, Speed-to-Lead, Kosten je Lead
      { view: "zahlen-leads", pfad: n("/zahlen/leads"), titel: "Leads & Werbung", alt: ["/"], reiter: { gruppe: "geld", label: "Leads & Werbung" }, suchwoerter: "Leads Werbung Trichter Monatsziele Speed-to-Lead Kosten je Lead CPL Erreichbarkeit Dashboard", fertig: true },
      { view: "zahlen-umsatz", pfad: n("/zahlen/umsatz"), titel: "Umsatz", alt: ["/admin/zahlen/buchungen"], reiter: { gruppe: "geld", label: "Umsatz" }, suchwoerter: "Buchungen Rechnungen Einrichtungsgebühr Einmal-Umsatz", fertig: true },
      { view: "zahlen-offene-posten", pfad: n("/zahlen/offene-posten"), titel: "Offene Posten", alt: [], reiter: { gruppe: "geld", label: "Offene Posten" }, suchwoerter: "Mahnung Mahnwesen Überweisung offene Rechnungen Zahlungserinnerung Zahlungseingang", fertig: true },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten"), titel: "Kosten", alt: ["/admin/einstellungen/kosten"], reiter: { gruppe: "geld", label: "Kosten" }, suchwoerter: "Laufende Kosten Ausgaben", fertig: true },
      // Detailseiten ohne Reiter (Umbau 19.11.2026: 6 Reiter → 4), erreichbar aus Übersicht bzw. Kosten und über die Suche
      { view: "zahlen-kunden", pfad: n("/zahlen/kunden"), titel: "Kündigung & Rückkehr", alt: ["/admin/zahlen/lebenszyklus"], suchwoerter: "Kunden-Lebenszyklus Kündigung Ruhephase Rückkehr Halteangebote", fertig: true },
      { view: "zahlen-auswertung", pfad: n("/zahlen/auswertung"), titel: "Für Investoren", alt: [], suchwoerter: "Auswertung Investoren Kennzahlen NRR Umsatzbindung CAC CLV LTV Kundenwert Amortisation Bruttomarge KI-Kosten Kohorten Export PDF CSV", fertig: true },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten/zuordnen"), titel: "Ausgaben zuordnen", alt: ["/admin/einstellungen/bank/zuordnen"], fertig: true },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten/konten"), titel: "Konten & Regeln", alt: ["/admin/einstellungen/bank"], suchwoerter: "Bank Commerzbank American Express Amex Karten Regeln Annahmen Gründerzeit Stundensatz Pilotphase", fertig: true },
    ],
  },
  {
    // Werkzeuge und Einstellungen zusammengelegt (UX-Umbau 20.11.2026): Die Seiten der Technik stehen unter
    // Einstellungen › Technik (Adressen bleiben). Die Rolle bleibt nur für „Mein Tag“ (Technik-Punkte wie
    // Hintergrund-Jobs, lib/admin-neu/rollen.ts) und führt dort zum Systemzustand; in Seitenleiste und Leiste unten
    // erscheint sie nicht mehr (ort/handy „keiner“).
    id: "werkzeuge",
    label: "Technik",
    kurz: "Technik",
    pfad: n("/werkzeuge/zustand"),
    ort: "keiner",
    handy: "keiner",
    seiten: [],
  },
  {
    // Eine Seite Einstellungen (UX-Umbau 20.11.2026) mit Gruppen nach Rollen wie in der Seitenleiste, Technik zuletzt.
    // Reihenfolge der Gruppen: GRUPPEN in src/app/admin/neu/einstellungen/page.tsx. Seiten ohne `gruppe` sind
    // Unterseiten (Statusseite unter Systemzustand, Meta-Gebühren unter WhatsApp).
    id: "einstellungen",
    label: "Einstellungen",
    kurz: "Einstellungen",
    pfad: n("/einstellungen"),
    ort: "unten",
    handy: "profil",
    seiten: [
      { view: "einstellungen", pfad: n("/einstellungen"), titel: "Einstellungen", alt: ["/admin/einstellungen"], suchwoerter: "Werkzeuge Technik", fertig: true },
      { view: "e-sicherheit", pfad: n("/einstellungen/sicherheit"), titel: "Zwei-Faktor & Geräte", gruppe: "Konto & Sicherheit", alt: ["/admin/einstellungen/sicherheit"], suchwoerter: "Sicherheit 2FA Face ID", untertitel: "Anmeldung schützen.", fertig: true },
      { view: "e-admins", pfad: n("/einstellungen/admins"), titel: "Admins & Rechte", gruppe: "Konto & Sicherheit", alt: [], untertitel: "Wer Zugang zum Admin hat.", fertig: true },
      { view: "e-buchung", pfad: n("/einstellungen/buchungsseiten"), titel: "Buchungsseiten", gruppe: "Verkaufen", alt: ["/admin/vertrieb/buchungsseite"], suchwoerter: "Kalender Termintypen Zeiten", untertitel: "Interessenten buchen Vertriebstermine direkt in Ihrem Kalender.", fertig: true },
      { view: "e-followups", pfad: n("/einstellungen/follow-ups"), titel: "Später-Follow-ups", gruppe: "Verkaufen", alt: ["/admin/vertrieb/follow-ups"], untertitel: "Kontakte, die „später“ gesagt haben, bekommen zum Zeitpunkt zwei Mails.", fertig: true },
      { view: "e-nachrichten", pfad: n("/einstellungen/nachrichten"), titel: "Mail- und WhatsApp-Vorlagen", gruppe: "Verkaufen", alt: [], suchwoerter: "Vorschau Templates E-Mail Kontakt eigene Vorlagen Terminerinnerung Zahlungserinnerung Bonus Mahnung Willkommen", untertitel: "Eigene Vorlagen für E-Mails aus dem Kontakt und die automatischen Nachrichten.", fertig: true },
      { view: "e-empfehlen", pfad: n("/einstellungen/kollegen-empfehlen"), titel: "Kollegen empfehlen", gruppe: "Verkaufen", alt: ["/admin/einstellungen/empfehlungen"], suchwoerter: "Prämie Empfehlungsprogramm", untertitel: "Kunden empfehlen uns mit persönlichem Link an Kollegen.", fertig: true },
      { view: "e-produkte", pfad: n("/einstellungen/produkte"), titel: "Produkte", gruppe: "Angebot & Produkte", alt: ["/admin/einstellungen/produkte"], untertitel: "Sparten, die Kunden selbst dazubuchen können.", fertig: true },
      { view: "e-tarife", pfad: n("/einstellungen/tarife"), titel: "Tarifkatalog", gruppe: "Angebot & Produkte", alt: ["/admin/einstellungen/beitraege"], suchwoerter: "Beiträge Beitragsrechner Vorschläge Vermittler", untertitel: "Vorschläge von Vermittlern, Gesellschaften und Beiträge rechnen.", fertig: true },
      { view: "e-neuigkeiten", pfad: n("/einstellungen/neuigkeiten"), titel: "Neuigkeiten", gruppe: "Betreuen", alt: ["/admin/einstellungen/neuigkeiten"], untertitel: "Einträge unter Profil › Neuigkeiten im Kundenbereich. Entwürfe sind unsichtbar.", fertig: true },
      { view: "e-berichte", pfad: n("/einstellungen/monatsberichte"), titel: "Monatsberichte", gruppe: "Betreuen", alt: ["/admin/einstellungen/monatsberichte"], suchwoerter: "automatischer Versand", untertitel: "Ab dem 2. entsteht für jeden aktiven Kunden ein Bericht über den Vormonat.", fertig: true },
      { view: "e-halte", pfad: n("/einstellungen/halteangebote"), titel: "Halteangebote", gruppe: "Betreuen", alt: ["/admin/einstellungen/halteangebote"], suchwoerter: "Kündigung", untertitel: "Was Kunden beim Kündigen je Grund angeboten wird.", fertig: true },
      { view: "e-einrichtung", pfad: n("/einstellungen/einrichtung"), titel: "Einrichtung neuer Kunden", gruppe: "Betreuen", alt: ["/admin/einstellungen/einrichtung"], suchwoerter: "Business-ID Erklärvideos Team-Kalender Hilfetermin", untertitel: "Was neue Kunden unter Einrichtung sehen.", fertig: true },
      { view: "e-login", pfad: n("/einstellungen/login"), titel: "Login-Seite", gruppe: "Betreuen", alt: ["/admin/einstellungen/login"], suchwoerter: "Infokarten", untertitel: "Infokarten neben dem Login, aktive Karten wechseln sich ab.", fertig: true },
      { view: "e-automatik", pfad: n("/einstellungen/kampagnen-automatik"), titel: "Kampagnen-Automatik", gruppe: "Liefern", alt: ["/admin/einstellungen/kampagnen-automatik"], suchwoerter: "Autopilot Media Buyer Budget Optimierung", untertitel: "Was das Agenten-Team selbst erledigt. Bei Meta wird nie etwas aktiviert.", fertig: true },
      { view: "e-rechnung", pfad: n("/einstellungen/rechnungsangaben"), titel: "Rechnungsangaben", gruppe: "Geld", alt: ["/admin/einstellungen/rechnungsangaben"], suchwoerter: "Steuernummer Stripe Fußzeile", untertitel: "Pflichtangaben auf jeder Stripe-Rechnung.", fertig: true },
      { view: "e-zahlung", pfad: n("/einstellungen/zahlungserinnerungen"), titel: "Zahlungserinnerungen", gruppe: "Geld", alt: [], untertitel: "Angenommene, aber nicht bezahlte Angebote.", fertig: true },
      // Technik (bis 20.11.2026 eigener Bereich „Werkzeuge“, Adressen unter /werkzeuge bleiben)
      { view: "w-zustand", pfad: n("/werkzeuge/zustand"), titel: "Systemzustand", gruppe: "Technik", alt: [], suchwoerter: "Werkzeuge Diagnose Hintergrund-Jobs Heartbeat Meta Stripe Bank LinkedIn WhatsApp-Zustellung Google-Kontingent Werbekosten", fertig: true },
      { view: "e-status", pfad: n("/einstellungen/status"), titel: "Statusseite & Support", alt: ["/admin/einstellungen/status"], suchwoerter: "Störung Statusmeldung Support-Kontakt", untertitel: "Störungen für Kunden melden, Support-Kontakt im Hilfe-Chat.", fertig: true },
      { view: "e-anbindungen", pfad: n("/einstellungen/anbindungen"), titel: "Anbindungen & Import", gruppe: "Technik", alt: ["/admin/vertrieb/import"], suchwoerter: "E-Mail-Postfach Outlook Microsoft Gmail Instantly Webhook Meta-Verbindung LinkedIn Google Agenturliste CSV Policen KI", untertitel: "Woher Vertrieb und Lead-Eingang ihre Daten bekommen.", fertig: true },
      { view: "e-vorlagen", pfad: n("/einstellungen/whatsapp"), titel: "WhatsApp", gruppe: "Technik", alt: ["/admin/whatsapp/settings"], suchwoerter: "Vorlagen Support-Nummer 360dialog A/B-Test Meta-Gebühren", untertitel: "Support-Nummer für Hilfe-Chat und Zahlungserinnerungen.", fertig: true },
      { view: "w-gebuehren", pfad: n("/werkzeuge/meta-gebuehren"), titel: "Meta-Gebühren", alt: [], suchwoerter: "WhatsApp Gebühren Kosten Meta intern", fertig: true },
      { view: "e-protokoll", pfad: n("/einstellungen/protokoll"), titel: "Änderungsprotokoll", gruppe: "Technik", alt: ["/admin/einstellungen/protokoll"], suchwoerter: "Audit Verlauf", untertitel: "Wer hat wann was geändert. Einträge bleiben 1 Jahr.", fertig: true },
    ],
  },
  {
    id: "was-wo-ist",
    label: "Was wo ist",
    kurz: "Was wo ist",
    pfad: n("/was-wo-ist"),
    // Umzugshilfe bis zur Abschaltung des alten Admins (Stufe A, Ole): nicht in der Navigation, nur Profilmenü und Suche
    ort: "profil",
    handy: "profil",
    seiten: [{ view: "landkarte", pfad: n("/was-wo-ist"), titel: "Was wo ist", alt: [], suchwoerter: "Landkarte Umzug alte Seiten Funktionen", fertig: true }],
  },
];

/** Alle Seiten mit Bereich (flach). */
export const SEITEN: (NeuSeite & { bereich: BereichId })[] = BEREICHE.flatMap((b) => b.seiten.map((s) => ({ ...s, bereich: b.id })));

const ohneSlash = (p: string) => p.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** Seiten-Muster als RegExp ([id] → ein Pfadteil). */
function muster(pfad: string): RegExp {
  return new RegExp(`^${pfad.replace(/[.*+?^${}()|\\]/g, "\\$&").replace(/\[[a-z]+\]/gi, "[^/]+")}$`);
}

/** Seite zu einer Adresse im neuen Admin (genaue Treffer vor Mustern). */
export function seiteFuer(pathname: string): (NeuSeite & { bereich: BereichId }) | null {
  const p = ohneSlash(pathname);
  return SEITEN.find((s) => s.pfad === p) ?? SEITEN.find((s) => s.pfad.includes("[") && muster(s.pfad).test(p)) ?? null;
}

/** Bereich einer Adresse im neuen Admin (für die Markierung in Seitenleiste und Leiste unten). */
export function bereichFuer(pathname: string): NeuBereich | null {
  const s = seiteFuer(pathname);
  if (s) return BEREICHE.find((b) => b.id === s.bereich) ?? null;
  const p = ohneSlash(pathname);
  // Unbekannte Unterseite: Bereich der längsten Seite darüber (Mein Tag = /admin/neu nur genau)
  const ueber = SEITEN.filter((x) => x.pfad !== NEU && p.startsWith(`${x.pfad.split("[")[0].replace(/\/$/, "")}/`)).sort((a, b) => b.pfad.length - a.pfad.length)[0];
  if (ueber) return BEREICHE.find((b) => b.id === ueber.bereich) ?? null;
  return p === NEU ? BEREICHE[0] : null;
}

const reiterVon = (s: NeuSeite): Reiter[] => (s.reiter ? (Array.isArray(s.reiter) ? s.reiter : [s.reiter]) : []);

/** Reiter einer Leiste; Platzhalter wie [id] werden mit `params` gefüllt. */
export function reiterFuer(gruppe: ReiterGruppe, params: Record<string, string> = {}): { href: string; label: string; exact: boolean }[] {
  const seiten = SEITEN.flatMap((s) => reiterVon(s).filter((r) => r.gruppe === gruppe).map((r) => ({ pfad: s.pfad, label: r.label })));
  return seiten.map((s) => ({
    href: s.pfad.replace(/\[([a-z]+)\]/gi, (_, k: string) => params[k] ?? `[${k}]`),
    label: s.label,
    // Nur genau, wenn ein anderer Reiter derselben Leiste darunter liegt (sonst wäre „Pipeline“ auf jeder
    // Vertriebsseite aktiv) oder der Reiter eine Akte ist; sonst auch auf Unterseiten (Kontakte → Kontakt)
    exact: seiten.some((x) => x.pfad.startsWith(`${s.pfad}/`)) || /\[[a-z]+\]$/i.test(s.pfad),
  }));
}

/** Heutige Seite für einen Platzhalter, mit eingesetzten Parametern. */
export function altePfad(seite: NeuSeite, params: Record<string, string> = {}): string | null {
  const a = seite.alt[0];
  if (!a) return null;
  return a.replace(/\[([a-z]+)\]/gi, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

// ─── „+ Neu“ ─────────────────────────────────────────────────────────────
// Nach Rollen geordnet (Admin v2), rechts steht die Rolle. art „dialog“: öffnet den bestehenden Ablauf im Fenster,
// art „link“: führt zur bestehenden Seite (immer die Adresse im neuen Admin).
// Umbau 20.11.2026: nur noch, was man im Alltag schnell anlegt (5 statt 9 Einträge). Neuigkeit, LinkedIn-Entwurf,
// Formular-Zuordnung und Laufende Kosten legt man auf ihrer Seite an (Knopf dort), sie entstehen selten oder automatisch.
export type NeuEintrag = {
  id: "kontakt" | "aufgabe" | "angebot" | "termin" | "ppl-bezug";
  label: string;
  rolle: BereichId;
} & ({ art: "link"; href: string } | { art: "dialog"; dialog: "aufgabe" | "termin" });

export const NEU_EINTRAEGE: NeuEintrag[] = [
  { id: "aufgabe", label: "Aufgabe", rolle: "mein-tag", art: "dialog", dialog: "aufgabe" },
  { id: "kontakt", label: "Kontakt", rolle: "verkaufen", art: "link", href: n("/vertrieb/kontakte/neu") },
  // Termin buchen wie in der Kontaktakte (Kontakt wählen, dann Termintyp, Datum, Uhrzeit); in einer Kontaktakte sofort für diesen Kontakt
  { id: "termin", label: "Termin buchen", rolle: "verkaufen", art: "link", href: n("/vertrieb/termine?buchen=1") },
  // Angebot gehört immer zu einem Kontakt: in einer Kontaktakte direkt „Angebot erstellen“, sonst Kontakt wählen
  { id: "angebot", label: "Angebot", rolle: "verkaufen", art: "link", href: n("/vertrieb/kontakte") },
  { id: "ppl-bezug", label: "Pay-per-Lead-Bezug", rolle: "liefern", art: "link", href: n("/leads/ppl/bezug/neu") },
];

// ─── Suche: Seiten ───────────────────────────────────────────────────────
export type SuchSeite = { titel: string; href: string; bereich: string; suchtext: string };

/** Alle Seiten ohne Platzhalter im Pfad, für die globale Suche (Abschnitt „Seiten“). */
export const SUCH_SEITEN: SuchSeite[] = SEITEN.filter((s) => !s.pfad.includes("[")).map((s) => {
  const b = BEREICHE.find((x) => x.id === s.bereich)!;
  const bereich = s.titel === b.label ? b.label : `${b.label}${s.gruppe ? ` · ${s.gruppe}` : ""}`;
  return { titel: s.titel, href: s.pfad, bereich, suchtext: `${s.titel} ${b.label} ${s.gruppe ?? ""} ${s.suchwoerter ?? ""}`.toLowerCase() };
});
