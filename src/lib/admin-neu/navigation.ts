// Neuer Admin (Ole, 16.11.2026; Admin v2 nach Rollen seit 18.11.2026): EINZIGE Quelle für Bereiche, Seiten, Reiter,
// „+ Neu“ und die Seitenliste der Suche. Seitenleiste, Leiste unten, Reiter, Platzhalter, Suche, Durchklick-Skript und
// Inventar-Test lesen nur von hier. Konventionen: docs/ux/admin-neu/README.md, Plan v2: docs/ux/admin-v2-plan.md.
//
// Admin v2 (Paket A1): Navigation nach Rollen statt nach Funktionen. Oben „Mein Tag“ und die vier Rollen Verkaufen,
// Betreuen, Liefern, Geld; unten Werkzeuge (Technik, Einrichtung), Einstellungen (einmal einrichten) und „Was wo ist“.
// Die Adressen der Seiten bleiben (Push-Ziele, Umzugs-Links in push-ziel.ts/umzug.ts), nur die Gruppierung ändert sich:
// z. B. liegt /admin/neu/leads/chats jetzt unter Betreuen, /admin/neu/zahlen/qualitaet ebenfalls.
//
// Eine Seite ergänzen: Eintrag in `seiten` der Rolle, dazu src/app/admin/neu/<pfad>/page.tsx.
// `view` ist die Ansicht aus der Demo v1 (docs/ux/admin-neu/demo.html, Feld demo_view im Inventar).

// Reine Daten ohne Importe: auch in der Middleware, in Tests und in Node-Skripten nutzbar
// (tools/admin-neu/durchklick.mjs). Symbole je Bereich: src/components/admin-neu/rahmen/symbole.ts.

export const NEU = "/admin/neu";

export type BereichId = "mein-tag" | "verkaufen" | "betreuen" | "liefern" | "geld" | "werkzeuge" | "einstellungen" | "was-wo-ist";

/** Reiter-Leisten: je Rolle eine, dazu Marketing (zweite Leiste unter Verkaufen) und die Kundenakte. */
export type ReiterGruppe = BereichId | "marketing" | "kundenakte";

/** Zweite Reiter-Leiste unter der Leiste einer Rolle (Seite zeigt beide). */
export const OBER_REITER: Partial<Record<ReiterGruppe, ReiterGruppe>> = { marketing: "verkaufen" };

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
  /** Seitenleiste: oben (Mein Tag und Rollen) oder unten (Werkzeuge, Einstellungen, Was wo ist) */
  ort: "oben" | "unten";
  /** Handy: direkt in der Leiste unten oder unter „Mehr“ */
  handy: "leiste" | "mehr";
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
      { view: "vertrieb-termine", pfad: n("/vertrieb/termine"), titel: "Termine", alt: ["/admin/vertrieb/buchungsseite"], reiter: { gruppe: "verkaufen", label: "Termine" }, suchwoerter: "Vertrieb Buchungsseite", fertig: true },
      { view: "vertrieb-angebote", pfad: n("/vertrieb/angebote"), titel: "Angebote", alt: ["/admin/vertrieb/angebote"], reiter: { gruppe: "verkaufen", label: "Angebote" }, suchwoerter: "Vertrieb", fertig: true },
      {
        view: "marketing",
        pfad: n("/marketing"),
        titel: "LinkedIn",
        alt: ["/admin/marketing/linkedin", "/admin/marketing"],
        reiter: [
          { gruppe: "verkaufen", label: "Marketing" },
          { gruppe: "marketing", label: "LinkedIn" },
        ],
        suchwoerter: "Marketing Entwürfe Posts",
        fertig: true,
      },
      { view: "marketing-empfehlungen", pfad: n("/marketing/empfehlungen"), titel: "Empfehlungen", alt: ["/admin/marketing/empfehlungen"], reiter: { gruppe: "marketing", label: "Empfehlungen" }, suchwoerter: "Marketing Kollegen empfehlen Prämie", fertig: true },
      { view: "marketing-unterlagen", pfad: n("/marketing/unterlagen"), titel: "Unterlagen", alt: ["/admin/marketing/unterlagen"], reiter: { gruppe: "marketing", label: "Unterlagen" }, suchwoerter: "Marketing Präsentation", fertig: true },
      { view: "marketing-webseite", pfad: n("/marketing/webseite"), titel: "Webseite & Rechner", alt: ["/admin/einstellungen/rechner"], reiter: { gruppe: "marketing", label: "Webseite & Rechner" }, suchwoerter: "Marketing Preise Rechner", fertig: true },
      // Datenschutz und Recht (Ole, 19.11.2026): Liste der Fälle aus der Kaltakquise, erreichbar über Kontakte (Umschalter)
      { view: "vertrieb-datenschutz", pfad: n("/vertrieb/datenschutz"), titel: "Datenschutz und Recht", alt: ["/admin/vertrieb/datenschutz"], suchwoerter: "DSGVO Auskunft Löschung Widerspruch Abmahnung Art. 15 Art. 17", fertig: true },
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
      { view: "kunden-berichte", pfad: n("/kunden/berichte"), titel: "Monatsberichte", alt: ["/admin/monatsberichte"], reiter: { gruppe: "betreuen", label: "Monatsberichte" }, fertig: true },
      { view: "zahlen-qualitaet", pfad: n("/zahlen/qualitaet"), titel: "Qualität & Nutzung", alt: ["/admin/zahlen/stornoquote", "/admin/zahlen/whatsapp", "/admin/nutzung"], reiter: { gruppe: "betreuen", label: "Qualität & Nutzung" }, suchwoerter: "Stornoquote WhatsApp-Zustellung Nutzung NPS", fertig: true },
      // Alter Link auf einen Bericht: leitet in die Kundenakte (Reiter Monatsberichte, Bericht geöffnet)
      { view: "kunden-berichte", pfad: n("/kunden/berichte/[id]"), titel: "Monatsbericht", alt: ["/admin/monatsberichte/[id]"], fertig: true },
      { view: "leads-chat", pfad: n("/leads/chats/[id]"), titel: "Chat", alt: ["/admin/whatsapp"], fertig: true },
      { view: "kunde", pfad: n("/kunden/[id]"), titel: "Kunde", alt: ["/admin/kunden/[id]"], reiter: { gruppe: "kundenakte", label: "Übersicht" }, fertig: true },
      { view: "kunde", pfad: n("/kunden/[id]/kontakt"), titel: "Kontaktakte", alt: [], fertig: true },
      { view: "kunde-leads", pfad: n("/kunden/[id]/leads"), titel: "Kampagne & Leads", alt: ["/admin/kunden/[id]/leads"], reiter: { gruppe: "kundenakte", label: "Kampagne & Leads" }, fertig: true },
      { view: "kunde-optimierung", pfad: n("/kunden/[id]/optimierung"), titel: "Optimierung", alt: ["/admin/kunden/[id]/optimierung"], reiter: { gruppe: "kundenakte", label: "Optimierung" }, fertig: true },
      { view: "kunde-whatsapp", pfad: n("/kunden/[id]/whatsapp"), titel: "WhatsApp", alt: ["/admin/kunden/[id]/whatsapp"], reiter: { gruppe: "kundenakte", label: "WhatsApp" }, fertig: true },
      { view: "kunde-berichte", pfad: n("/kunden/[id]/berichte"), titel: "Monatsberichte", alt: [], reiter: { gruppe: "kundenakte", label: "Monatsberichte" }, fertig: true },
      { view: "kunde-abrechnung", pfad: n("/kunden/[id]/abrechnung"), titel: "Abrechnung & Pause", alt: ["/admin/kunden/[id]/abrechnung"], reiter: { gruppe: "kundenakte", label: "Abrechnung & Pause" }, fertig: true },
      { view: "kunde-team", pfad: n("/kunden/[id]/team"), titel: "Team & Logins", alt: ["/admin/kunden/[id]/logins"], reiter: { gruppe: "kundenakte", label: "Team & Logins" }, fertig: true },
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
      { view: "leads-ppl", pfad: n("/leads/ppl"), titel: "Pay-per-Lead", alt: ["/admin/ppl", "/admin/ppl/import"], reiter: { gruppe: "liefern", label: "Pay-per-Lead" }, suchwoerter: "PPL Bezug Bezüge Storno Reklamation Import Käufer", fertig: true },
      { view: "leads-alle", pfad: n("/leads/alle"), titel: "Alle Leads", alt: ["/admin/leads"], reiter: { gruppe: "liefern", label: "Leads" }, fertig: true },
      { view: "leads", pfad: n("/leads"), titel: "Lead-Eingang", alt: ["/admin/lead-eingang"], reiter: { gruppe: "liefern", label: "Lead-Eingang" }, suchwoerter: "Formulare Zuordnung Meta", fertig: true },
      { view: "leads-optimierung", pfad: n("/leads/werbekonten"), titel: "Werbekonten", alt: ["/admin/optimierung", "/admin/media-buyer"], reiter: { gruppe: "liefern", label: "Werbekonten" }, suchwoerter: "Optimierung Media Buyer Budget Pool", fertig: true },
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
      { view: "zahlen", pfad: n("/zahlen"), titel: "Übersicht", alt: ["/admin/zahlen", "/"], reiter: { gruppe: "geld", label: "Übersicht" }, suchwoerter: "Zahlen Kennzahlen Investoren MRR BWA Dashboard", fertig: true },
      { view: "zahlen-umsatz", pfad: n("/zahlen/umsatz"), titel: "Umsatz & Buchungen", alt: ["/admin/zahlen/buchungen"], reiter: { gruppe: "geld", label: "Umsatz & Buchungen" }, suchwoerter: "Rechnungen", fertig: true },
      { view: "zahlen-offene-posten", pfad: n("/zahlen/offene-posten"), titel: "Offene Posten", alt: [], reiter: { gruppe: "geld", label: "Offene Posten" }, suchwoerter: "Mahnung Mahnwesen Überweisung offene Rechnungen Zahlungserinnerung Zahlungseingang", fertig: true },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten"), titel: "Kosten & Bank", alt: ["/admin/einstellungen/kosten", "/admin/einstellungen/bank"], reiter: { gruppe: "geld", label: "Kosten & Bank" }, suchwoerter: "Laufende Kosten Ausgaben Karten", fertig: true },
      { view: "zahlen-kunden", pfad: n("/zahlen/kunden"), titel: "Kunden-Lebenszyklus", alt: ["/admin/zahlen/lebenszyklus"], reiter: { gruppe: "geld", label: "Kunden-Lebenszyklus" }, suchwoerter: "Kündigung Ruhephase Rückkehr Kohorten", fertig: true },
      { view: "zahlen-auswertung", pfad: n("/zahlen/auswertung"), titel: "Auswertung", alt: [], reiter: { gruppe: "geld", label: "Auswertung" }, suchwoerter: "Investoren Kennzahlen NRR Umsatzbindung CAC CLV LTV Kundenwert Amortisation Bruttomarge KI-Kosten Kohorten Export PDF CSV", fertig: true },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten/zuordnen"), titel: "Ausgaben zuordnen", alt: ["/admin/einstellungen/bank/zuordnen"], fertig: true },
    ],
  },
  {
    id: "werkzeuge",
    label: "Werkzeuge",
    kurz: "Werkzeuge",
    hinweis: "Technik, Einrichtung",
    pfad: n("/werkzeuge"),
    ort: "unten",
    handy: "mehr",
    seiten: [
      { view: "werkzeuge", pfad: n("/werkzeuge"), titel: "Werkzeuge", alt: [], suchwoerter: "Technik Diagnose Verbindungen Import", fertig: true },
      { view: "w-zustand", pfad: n("/werkzeuge/zustand"), titel: "Systemzustand", gruppe: "Zustand", alt: [], suchwoerter: "Diagnose Hintergrund-Jobs Heartbeat Meta Stripe Bank LinkedIn WhatsApp-Zustellung Google-Kontingent Werbekosten", fertig: true },
      { view: "e-status", pfad: n("/einstellungen/status"), titel: "Status & Support", gruppe: "Zustand", alt: ["/admin/einstellungen/status"], suchwoerter: "Störung Statusmeldung", untertitel: "Öffentliche Statusseite und Support-Kontakt im Hilfe-Chat.", fertig: true },
      { view: "e-anbindungen", pfad: n("/einstellungen/anbindungen"), titel: "Anbindungen & Import", gruppe: "Verbindungen & Importe", alt: ["/admin/vertrieb/import"], suchwoerter: "Instantly Webhook Meta-Verbindung LinkedIn Agenturliste", untertitel: "Woher Vertrieb und Lead-Eingang ihre Daten bekommen.", fertig: true },
      { view: "e-vorlagen", pfad: n("/einstellungen/whatsapp"), titel: "WhatsApp-Vorlagen & Support-Nummer", gruppe: "WhatsApp", alt: ["/admin/whatsapp/settings"], suchwoerter: "Vorlagen Assistent Support-Nummer A/B-Test", untertitel: "Support-Nummer und A/B-Tests der Vorlagen.", fertig: true },
      { view: "w-gebuehren", pfad: n("/werkzeuge/meta-gebuehren"), titel: "Meta-Gebühren", gruppe: "WhatsApp", alt: [], suchwoerter: "WhatsApp Gebühren Kosten Meta intern", fertig: true },
      { view: "e-login", pfad: n("/einstellungen/login"), titel: "Login-Seite", gruppe: "Inhalte & Einrichtung", alt: ["/admin/einstellungen/login"], suchwoerter: "Infokarten", untertitel: "Infokarten neben dem Login, aktive Karten wechseln sich ab.", fertig: true },
      { view: "e-einrichtung", pfad: n("/einstellungen/einrichtung"), titel: "Einrichtung neuer Kunden", gruppe: "Inhalte & Einrichtung", alt: ["/admin/einstellungen/einrichtung"], suchwoerter: "Business-ID Erklärvideos Team-Kalender", untertitel: "Was neue Kunden unter Einrichtung sehen.", fertig: true },
      { view: "e-protokoll", pfad: n("/einstellungen/protokoll"), titel: "Änderungsprotokoll", gruppe: "Protokoll & Testdaten", alt: ["/admin/einstellungen/protokoll"], untertitel: "Wer hat wann was geändert. Einträge bleiben 1 Jahr.", fertig: true },
    ],
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    kurz: "Einstellungen",
    pfad: n("/einstellungen"),
    ort: "unten",
    handy: "mehr",
    seiten: [
      { view: "einstellungen", pfad: n("/einstellungen"), titel: "Einstellungen", alt: ["/admin/einstellungen"], fertig: true },
      { view: "e-sicherheit", pfad: n("/einstellungen/sicherheit"), titel: "Zwei-Faktor & Geräte", gruppe: "Konto & Sicherheit", alt: ["/admin/einstellungen/sicherheit"], suchwoerter: "Sicherheit 2FA", untertitel: "Anmeldung schützen.", fertig: true },
      { view: "e-admins", pfad: n("/einstellungen/admins"), titel: "Admins & Rechte", gruppe: "Konto & Sicherheit", alt: [], untertitel: "Wer Zugang zum Admin hat.", fertig: true },
      { view: "e-followups", pfad: n("/einstellungen/follow-ups"), titel: "Später-Follow-ups", gruppe: "Verkaufen", alt: ["/admin/vertrieb/follow-ups"], untertitel: "Kontakte, die „später“ gesagt haben, bekommen zum Zeitpunkt zwei Mails.", fertig: true },
      { view: "e-buchung", pfad: n("/einstellungen/buchungsseiten"), titel: "Buchungsseiten", gruppe: "Verkaufen", alt: ["/admin/vertrieb/buchungsseite"], untertitel: "Interessenten buchen Vertriebstermine direkt in Ihrem Kalender.", fertig: true },
      { view: "e-halte", pfad: n("/einstellungen/halteangebote"), titel: "Halteangebote", gruppe: "Kunden", alt: ["/admin/einstellungen/halteangebote"], untertitel: "Was Kunden beim Kündigen je Grund angeboten wird.", fertig: true },
      { view: "e-berichte", pfad: n("/einstellungen/monatsberichte"), titel: "Monatsberichte", gruppe: "Kunden", alt: ["/admin/einstellungen/monatsberichte"], suchwoerter: "automatischer Versand", untertitel: "Ab dem 2. entsteht für jeden aktiven Kunden ein Bericht über den Vormonat.", fertig: true },
      { view: "e-neuigkeiten", pfad: n("/einstellungen/neuigkeiten"), titel: "Neuigkeiten", gruppe: "Kunden", alt: ["/admin/einstellungen/neuigkeiten"], untertitel: "Einträge unter Profil → Neuigkeiten im Kundenbereich. Entwürfe sind unsichtbar.", fertig: true },
      { view: "e-produkte", pfad: n("/einstellungen/produkte"), titel: "Produkte", gruppe: "Angebot & Produkte", alt: ["/admin/einstellungen/produkte"], untertitel: "Sparten, die Kunden selbst dazubuchen können.", fertig: true },
      { view: "e-tarife", pfad: n("/einstellungen/tarife"), titel: "Tarifkatalog", gruppe: "Angebot & Produkte", alt: ["/admin/einstellungen/beitraege"], suchwoerter: "Beiträge Beitragsrechner Vorschläge Vermittler", untertitel: "Vorschläge von Vermittlern, Gesellschaften und Beiträge rechnen.", fertig: true },
      { view: "e-automatik", pfad: n("/einstellungen/kampagnen-automatik"), titel: "Kampagnen-Automatik", gruppe: "Werbung", alt: ["/admin/einstellungen/kampagnen-automatik"], suchwoerter: "Autopilot Media Buyer Budget", untertitel: "Was das Agenten-Team selbst erledigt. Bei Meta wird nie etwas aktiviert.", fertig: true },
      { view: "e-empfehlen", pfad: n("/einstellungen/kollegen-empfehlen"), titel: "Kollegen empfehlen", gruppe: "Marketing", alt: ["/admin/einstellungen/empfehlungen"], untertitel: "Kunden empfehlen uns mit persönlichem Link an Kollegen.", fertig: true },
      { view: "e-rechnung", pfad: n("/einstellungen/rechnungsangaben"), titel: "Rechnungsangaben", gruppe: "Finanzen", alt: ["/admin/einstellungen/rechnungsangaben"], suchwoerter: "Steuernummer Stripe Fußzeile", untertitel: "Pflichtangaben auf jeder Stripe-Rechnung.", fertig: true },
      { view: "e-zahlung", pfad: n("/einstellungen/zahlungserinnerungen"), titel: "Zahlungserinnerungen", gruppe: "Finanzen", alt: [], untertitel: "Angenommene, aber nicht bezahlte Angebote.", fertig: true },
    ],
  },
  {
    id: "was-wo-ist",
    label: "Was wo ist",
    kurz: "Was wo ist",
    pfad: n("/was-wo-ist"),
    ort: "unten",
    handy: "mehr",
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
// art „link“: führt zur bestehenden Seite.
export type NeuEintrag = {
  id: "kontakt" | "aufgabe" | "angebot" | "termin" | "zuordnung" | "ppl-bezug" | "linkedin" | "neuigkeit" | "kosten";
  label: string;
  rolle: BereichId;
} & ({ art: "link"; href: string } | { art: "dialog"; dialog: "aufgabe" | "termin" });

export const NEU_EINTRAEGE: NeuEintrag[] = [
  { id: "aufgabe", label: "Aufgabe", rolle: "mein-tag", art: "dialog", dialog: "aufgabe" },
  { id: "kontakt", label: "Kontakt", rolle: "verkaufen", art: "link", href: "/admin/vertrieb/kontakte/neu" },
  // Termin buchen wie in der Kontaktakte (Kontakt wählen, dann Termintyp, Datum, Uhrzeit); in einer Kontaktakte sofort für diesen Kontakt
  { id: "termin", label: "Termin buchen", rolle: "verkaufen", art: "link", href: "/admin/neu/vertrieb/termine?buchen=1" },
  { id: "angebot", label: "Angebot", rolle: "verkaufen", art: "link", href: "/admin/vertrieb/kontakte" },
  { id: "linkedin", label: "LinkedIn-Entwurf", rolle: "verkaufen", art: "link", href: "/admin/neu/marketing" },
  { id: "neuigkeit", label: "Neuigkeit für Kunden", rolle: "betreuen", art: "link", href: "/admin/einstellungen/neuigkeiten" },
  { id: "ppl-bezug", label: "Pay-per-Lead-Bezug", rolle: "liefern", art: "link", href: "/admin/neu/leads/ppl/bezug/neu" },
  { id: "zuordnung", label: "Formular-Zuordnung", rolle: "liefern", art: "link", href: "/admin/neu/leads?neu=1#zuordnen" },
  { id: "kosten", label: "Laufende Kosten", rolle: "geld", art: "link", href: "/admin/neu/zahlen/kosten" },
];

// ─── Suche: Seiten ───────────────────────────────────────────────────────
export type SuchSeite = { titel: string; href: string; bereich: string; suchtext: string };

/** Alle Seiten ohne Platzhalter im Pfad, für die globale Suche (Abschnitt „Seiten“). */
export const SUCH_SEITEN: SuchSeite[] = SEITEN.filter((s) => !s.pfad.includes("[")).map((s) => {
  const b = BEREICHE.find((x) => x.id === s.bereich)!;
  const bereich = s.titel === b.label ? b.label : `${b.label}${s.gruppe ? ` · ${s.gruppe}` : ""}`;
  return { titel: s.titel, href: s.pfad, bereich, suchtext: `${s.titel} ${b.label} ${s.gruppe ?? ""} ${s.suchwoerter ?? ""}`.toLowerCase() };
});
