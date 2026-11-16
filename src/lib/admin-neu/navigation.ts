// Neuer Admin (Ole, 16.11.2026): EINZIGE Quelle für Bereiche, Seiten, Reiter, „+ Neu“ und die Seitenliste der Suche.
// Seitenleiste, Leiste unten, Reiter, Platzhalter, Suche, Durchklick-Skript und Inventar-Test lesen nur von hier.
// Konventionen für die Bereichs-Agenten: docs/ux/admin-neu/README.md.
//
// Eine Seite ergänzen: Eintrag in `seiten` des Bereichs, dazu src/app/admin/neu/<pfad>/page.tsx.
// `view` ist die Ansicht aus der Demo (docs/ux/admin-neu/demo.html, Feld demo_view im Inventar).

// Reine Daten ohne Importe: auch in der Middleware, in Tests und in Node-Skripten nutzbar
// (tools/admin-neu/durchklick.mjs). Symbole je Bereich: src/components/admin-neu/rahmen/symbole.ts.

export const NEU = "/admin/neu";

export type BereichId = "heute" | "vertrieb" | "kunden" | "leads" | "marketing" | "zahlen" | "einstellungen" | "was-wo-ist";

/** Reiter-Leisten: je Bereich eine, dazu die Akten (Kunde, Kontakt). */
export type ReiterGruppe = BereichId | "kundenakte";

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
  /** Reiter in einer Leiste (Gruppe + Beschriftung). Ohne = Unter- oder Detailseite. */
  reiter?: { gruppe: ReiterGruppe; label: string };
  /** Gruppe auf der Einstellungen-Übersicht (nur Bereich Einstellungen). */
  gruppe?: string;
  /** Zusätzliche Suchwörter für die globale Suche (Seiten mit `[` im Pfad erscheinen dort nicht). */
  suchwoerter?: string;
};

export type NeuBereich = {
  id: BereichId;
  label: string;
  /** Kurzform für die Leiste unten am Handy */
  kurz: string;
  /** Startseite des Bereichs */
  pfad: string;
  /** Seitenleiste: oben (Arbeit) oder unten (Einstellungen, Was wo ist) */
  ort: "oben" | "unten";
  /** Handy: direkt in der Leiste unten oder unter „Mehr“ */
  handy: "leiste" | "mehr";
  /** Zähler an der Leiste (aus loadAdminNavCounts) */
  zaehler?: "heute" | "chats";
  /** Wer baut den Bereich (Ordner src/app/admin/neu/<ordner>, src/components/admin-neu/<ordner>) */
  ordner: string;
  seiten: NeuSeite[];
};

const n = (p = "") => `${NEU}${p}`;

export const BEREICHE: NeuBereich[] = [
  {
    id: "heute",
    label: "Heute",
    kurz: "Heute",
    pfad: n(),
    ort: "oben",
    handy: "leiste",
    zaehler: "heute",
    ordner: "heute",
    seiten: [{ view: "heute", pfad: n(), titel: "Heute", alt: ["/admin/heute"], suchwoerter: "Start Braucht Sie Freigaben", fertig: true }],
  },
  {
    id: "vertrieb",
    label: "Vertrieb",
    kurz: "Vertrieb",
    pfad: n("/vertrieb"),
    ort: "oben",
    handy: "leiste",
    ordner: "vertrieb",
    seiten: [
      { view: "vertrieb", pfad: n("/vertrieb"), titel: "Pipeline", alt: ["/admin/vertrieb/pipeline"], reiter: { gruppe: "vertrieb", label: "Pipeline" }, suchwoerter: "Akquise Stufen", fertig: true },
      { view: "vertrieb-kontakte", pfad: n("/vertrieb/kontakte"), titel: "Kontakte", alt: ["/admin/vertrieb/kontakte"], reiter: { gruppe: "vertrieb", label: "Kontakte" }, suchwoerter: "Cold Mail", fertig: true },
      { view: "vertrieb-aufgaben", pfad: n("/vertrieb/aufgaben"), titel: "Aufgaben", alt: ["/admin/heute/aufgaben"], reiter: { gruppe: "vertrieb", label: "Aufgaben" }, fertig: true },
      { view: "vertrieb-termine", pfad: n("/vertrieb/termine"), titel: "Termine", alt: ["/admin/vertrieb/buchungsseite"], reiter: { gruppe: "vertrieb", label: "Termine" }, suchwoerter: "Calendly Buchungsseite", fertig: true },
      { view: "vertrieb-angebote", pfad: n("/vertrieb/angebote"), titel: "Angebote", alt: ["/admin/vertrieb/angebote"], reiter: { gruppe: "vertrieb", label: "Angebote" }, fertig: true },
      { view: "kontakt-neu", pfad: n("/vertrieb/kontakte/neu"), titel: "Neuer Kontakt", alt: ["/admin/vertrieb/kontakte/neu"], fertig: true },
      { view: "kontakt", pfad: n("/vertrieb/kontakte/[id]"), titel: "Kontakt", alt: ["/admin/vertrieb/kontakte/[id]"], fertig: true },
      { view: "angebot-neu", pfad: n("/vertrieb/kontakte/[id]/angebot"), titel: "Angebot erstellen", alt: ["/admin/vertrieb/kontakte/[id]/angebot"], fertig: true },
      { view: "praesentation", pfad: n("/vertrieb/kontakte/[id]/praesentation"), titel: "Präsentation", alt: ["/admin/vertrieb/kontakte/[id]/praesentation"], fertig: true },
    ],
  },
  {
    id: "kunden",
    label: "Kunden",
    kurz: "Kunden",
    pfad: n("/kunden"),
    ort: "oben",
    handy: "leiste",
    ordner: "kunden",
    seiten: [
      { view: "kunden", pfad: n("/kunden"), titel: "Kunden", alt: ["/admin/kunden", "/admin/kunden/pipeline", "/admin/vertrieb/kunden"], reiter: { gruppe: "kunden", label: "Liste" }, suchwoerter: "Kundenliste Onboarding", fertig: true },
      { view: "kunden-berichte", pfad: n("/kunden/berichte"), titel: "Monatsberichte", alt: ["/admin/monatsberichte"], reiter: { gruppe: "kunden", label: "Monatsberichte" }, fertig: true },
      // Alter Link auf einen Bericht: leitet in die Kundenakte (Reiter Monatsberichte, Bericht geöffnet)
      { view: "kunden-berichte", pfad: n("/kunden/berichte/[id]"), titel: "Monatsbericht", alt: ["/admin/monatsberichte/[id]"], fertig: true },
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
    id: "leads",
    label: "Leads & Kampagnen",
    kurz: "Leads",
    pfad: n("/leads"),
    ort: "oben",
    handy: "leiste",
    zaehler: "chats",
    ordner: "leads",
    seiten: [
      { view: "leads", pfad: n("/leads"), titel: "Lead-Eingang", alt: ["/admin/lead-eingang"], reiter: { gruppe: "leads", label: "Lead-Eingang" }, suchwoerter: "Formulare Zuordnung Meta", fertig: true },
      { view: "leads-alle", pfad: n("/leads/alle"), titel: "Alle Leads", alt: ["/admin/leads"], reiter: { gruppe: "leads", label: "Alle Leads" }, fertig: true },
      { view: "leads-ppl", pfad: n("/leads/ppl"), titel: "Pay-per-Lead", alt: ["/admin/ppl", "/admin/ppl/import"], reiter: { gruppe: "leads", label: "Pay-per-Lead" }, suchwoerter: "PPL Bezug Storno Reklamation Import", fertig: true },
      { view: "leads-optimierung", pfad: n("/leads/werbekonten"), titel: "Werbekonten", alt: ["/admin/optimierung", "/admin/media-buyer"], reiter: { gruppe: "leads", label: "Werbekonten" }, suchwoerter: "Optimierung Media Buyer Budget", fertig: true },
      { view: "leads-chats", pfad: n("/leads/chats"), titel: "WhatsApp-Chats", alt: ["/admin/whatsapp"], reiter: { gruppe: "leads", label: "WhatsApp-Chats" }, suchwoerter: "Chats Support-Nummer Assistent", fertig: true },
      { view: "leads-bezug", pfad: n("/leads/ppl/bezug/[id]"), titel: "Bezug", alt: ["/admin/ppl/bezug/[id]"], fertig: true },
      { view: "leads-konto", pfad: n("/leads/werbekonten/[id]"), titel: "Werbekonto", alt: ["/admin/optimierung/[id]"], fertig: true },
      { view: "leads-chat", pfad: n("/leads/chats/[id]"), titel: "Chat", alt: ["/admin/whatsapp"], fertig: true },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    kurz: "Marketing",
    pfad: n("/marketing"),
    ort: "oben",
    handy: "leiste",
    ordner: "marketing",
    seiten: [
      { view: "marketing", pfad: n("/marketing"), titel: "LinkedIn", alt: ["/admin/marketing/linkedin", "/admin/marketing"], reiter: { gruppe: "marketing", label: "LinkedIn" }, suchwoerter: "Entwürfe Posts" },
      { view: "marketing-empfehlungen", pfad: n("/marketing/empfehlungen"), titel: "Empfehlungen", alt: ["/admin/marketing/empfehlungen"], reiter: { gruppe: "marketing", label: "Empfehlungen" }, suchwoerter: "Kollegen empfehlen Prämie" },
      { view: "marketing-unterlagen", pfad: n("/marketing/unterlagen"), titel: "Unterlagen", alt: ["/admin/marketing/unterlagen"], reiter: { gruppe: "marketing", label: "Unterlagen" }, suchwoerter: "Präsentation" },
      { view: "marketing-webseite", pfad: n("/marketing/webseite"), titel: "Webseite & Rechner", alt: ["/admin/einstellungen/rechner"], reiter: { gruppe: "marketing", label: "Webseite & Rechner" }, suchwoerter: "Preise Rechner" },
      { view: "marketing-unterlagen", pfad: n("/marketing/unterlagen/praesentation/[audience]"), titel: "Präsentation", alt: ["/admin/marketing/unterlagen/praesentation/[audience]"] },
    ],
  },
  {
    id: "zahlen",
    label: "Zahlen",
    kurz: "Zahlen",
    pfad: n("/zahlen"),
    ort: "oben",
    handy: "mehr",
    ordner: "zahlen",
    seiten: [
      { view: "zahlen", pfad: n("/zahlen"), titel: "Übersicht", alt: ["/admin/zahlen", "/"], reiter: { gruppe: "zahlen", label: "Übersicht" }, suchwoerter: "Kennzahlen Investoren MRR BWA Dashboard" },
      { view: "zahlen-umsatz", pfad: n("/zahlen/umsatz"), titel: "Umsatz & Buchungen", alt: ["/admin/zahlen/buchungen"], reiter: { gruppe: "zahlen", label: "Umsatz & Buchungen" } },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten"), titel: "Kosten & Bank", alt: ["/admin/einstellungen/kosten", "/admin/einstellungen/bank"], reiter: { gruppe: "zahlen", label: "Kosten & Bank" }, suchwoerter: "Laufende Kosten Ausgaben Karten" },
      { view: "zahlen-kunden", pfad: n("/zahlen/kunden"), titel: "Kunden-Lebenszyklus", alt: ["/admin/zahlen/lebenszyklus"], reiter: { gruppe: "zahlen", label: "Kunden-Lebenszyklus" }, suchwoerter: "Kündigung Ruhephase Rückkehr" },
      { view: "zahlen-qualitaet", pfad: n("/zahlen/qualitaet"), titel: "Qualität & Nutzung", alt: ["/admin/zahlen/stornoquote", "/admin/zahlen/whatsapp", "/admin/nutzung"], reiter: { gruppe: "zahlen", label: "Qualität & Nutzung" }, suchwoerter: "Stornoquote WhatsApp-Zustellung Nutzung NPS" },
      { view: "zahlen-kosten", pfad: n("/zahlen/kosten/zuordnen"), titel: "Ausgaben zuordnen", alt: ["/admin/einstellungen/bank/zuordnen"] },
    ],
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    kurz: "Einstellungen",
    pfad: n("/einstellungen"),
    ort: "unten",
    handy: "mehr",
    ordner: "einstellungen",
    seiten: [
      { view: "einstellungen", pfad: n("/einstellungen"), titel: "Einstellungen", alt: ["/admin/einstellungen"] },
      { view: "e-produkte", pfad: n("/einstellungen/produkte"), titel: "Produkte", gruppe: "Produkte & Preise", alt: ["/admin/einstellungen/produkte"] },
      { view: "e-tarife", pfad: n("/einstellungen/tarife"), titel: "Tarifkatalog", gruppe: "Produkte & Preise", alt: ["/admin/einstellungen/beitraege"], suchwoerter: "Beiträge Beitragsrechner" },
      { view: "e-automatik", pfad: n("/einstellungen/kampagnen-automatik"), titel: "Kampagnen-Automatik", gruppe: "Automatiken", alt: ["/admin/einstellungen/kampagnen-automatik"] },
      { view: "e-followups", pfad: n("/einstellungen/follow-ups"), titel: "Später-Follow-ups", gruppe: "Automatiken", alt: ["/admin/vertrieb/follow-ups"] },
      { view: "e-halte", pfad: n("/einstellungen/halteangebote"), titel: "Halteangebote", gruppe: "Automatiken", alt: ["/admin/einstellungen/halteangebote"] },
      { view: "e-zahlung", pfad: n("/einstellungen/zahlungserinnerungen"), titel: "Zahlungserinnerungen", gruppe: "Automatiken", alt: [] },
      { view: "e-vorlagen", pfad: n("/einstellungen/whatsapp"), titel: "WhatsApp-Vorlagen & Support-Nummer", gruppe: "Kommunikation", alt: ["/admin/whatsapp/settings"], suchwoerter: "Vorlagen Assistent" },
      { view: "e-neuigkeiten", pfad: n("/einstellungen/neuigkeiten"), titel: "Neuigkeiten", gruppe: "Kommunikation", alt: ["/admin/einstellungen/neuigkeiten"] },
      { view: "e-berichte", pfad: n("/einstellungen/monatsberichte"), titel: "Monatsberichte", gruppe: "Kommunikation", alt: ["/admin/einstellungen/monatsberichte"], suchwoerter: "automatischer Versand" },
      { view: "e-login", pfad: n("/einstellungen/login"), titel: "Login-Seite", gruppe: "Kommunikation", alt: ["/admin/einstellungen/login"], suchwoerter: "Infokarten" },
      { view: "e-status", pfad: n("/einstellungen/status"), titel: "Status & Support", gruppe: "Kommunikation", alt: ["/admin/einstellungen/status"] },
      { view: "e-buchung", pfad: n("/einstellungen/buchungsseiten"), titel: "Buchungsseiten", gruppe: "Vertrieb", alt: ["/admin/vertrieb/buchungsseite"] },
      { view: "e-anbindungen", pfad: n("/einstellungen/anbindungen"), titel: "Anbindungen & Import", gruppe: "Vertrieb", alt: ["/admin/vertrieb/import"], suchwoerter: "Instantly Calendly CSV" },
      { view: "e-empfehlen", pfad: n("/einstellungen/kollegen-empfehlen"), titel: "Kollegen empfehlen", gruppe: "Vertrieb", alt: ["/admin/einstellungen/empfehlungen"] },
      { view: "e-rechnung", pfad: n("/einstellungen/rechnungsangaben"), titel: "Rechnungsangaben", gruppe: "Firma & Finanzen", alt: ["/admin/einstellungen/rechnungsangaben"] },
      { view: "e-einrichtung", pfad: n("/einstellungen/einrichtung"), titel: "Einrichtung neuer Kunden", gruppe: "Firma & Finanzen", alt: ["/admin/einstellungen/einrichtung"] },
      { view: "e-sicherheit", pfad: n("/einstellungen/sicherheit"), titel: "Zwei-Faktor & Geräte", gruppe: "Sicherheit", alt: ["/admin/einstellungen/sicherheit"], suchwoerter: "Sicherheit 2FA" },
      { view: "e-protokoll", pfad: n("/einstellungen/protokoll"), titel: "Änderungsprotokoll", gruppe: "Sicherheit", alt: ["/admin/einstellungen/protokoll"] },
      { view: "e-admins", pfad: n("/einstellungen/admins"), titel: "Admins & Rechte", gruppe: "Sicherheit", alt: [] },
    ],
  },
  {
    id: "was-wo-ist",
    label: "Was wo ist",
    kurz: "Was wo ist",
    pfad: n("/was-wo-ist"),
    ort: "unten",
    handy: "mehr",
    ordner: "was-wo-ist",
    seiten: [{ view: "landkarte", pfad: n("/was-wo-ist"), titel: "Was wo ist", alt: [], suchwoerter: "Landkarte Umzug alte Seiten" }],
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
  // Unbekannte Unterseite: längster passender Bereichs-Pfad (Heute = /admin/neu nur genau)
  return [...BEREICHE].filter((b) => b.pfad !== NEU && (p === b.pfad || p.startsWith(`${b.pfad}/`))).sort((a, b) => b.pfad.length - a.pfad.length)[0] ?? (p === NEU ? BEREICHE[0] : null);
}

/** Reiter einer Leiste; Platzhalter wie [id] werden mit `params` gefüllt. */
export function reiterFuer(gruppe: ReiterGruppe, params: Record<string, string> = {}): { href: string; label: string; exact: boolean }[] {
  return SEITEN.filter((s) => s.reiter?.gruppe === gruppe).map((s) => ({
    href: s.pfad.replace(/\[([a-z]+)\]/gi, (_, k: string) => params[k] ?? `[${k}]`),
    label: s.reiter!.label,
    // Startseite eines Bereichs nur genau (sonst wäre „Pipeline“ auf jeder Vertriebsseite aktiv)
    exact: BEREICHE.some((b) => b.pfad === s.pfad) || /\[[a-z]+\]$/i.test(s.pfad),
  }));
}

/** Heutige Seite für einen Platzhalter, mit eingesetzten Parametern. */
export function altePfad(seite: NeuSeite, params: Record<string, string> = {}): string | null {
  const a = seite.alt[0];
  if (!a) return null;
  return a.replace(/\[([a-z]+)\]/gi, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

// ─── „+ Neu“ ─────────────────────────────────────────────────────────────
// art „dialog“: öffnet den bestehenden Ablauf im Fenster (Sheet), art „link“: führt zur bestehenden Seite.
export type NeuEintrag = {
  id: "kontakt" | "aufgabe" | "angebot" | "termin" | "zuordnung" | "ppl-bezug" | "linkedin" | "neuigkeit" | "kosten";
  label: string;
  hinweis?: string;
} & ({ art: "link"; href: string } | { art: "dialog"; dialog: "aufgabe" | "termin" });

export const NEU_EINTRAEGE: NeuEintrag[] = [
  { id: "kontakt", label: "Kontakt", hinweis: "Vertrieb", art: "link", href: "/admin/vertrieb/kontakte/neu" },
  { id: "aufgabe", label: "Aufgabe", hinweis: "mit oder ohne Kontakt", art: "dialog", dialog: "aufgabe" },
  { id: "angebot", label: "Angebot", hinweis: "im Kontakt erstellen", art: "link", href: "/admin/vertrieb/kontakte" },
  // Termin buchen wie in der Kontaktakte (Kontakt wählen, dann Termintyp, Datum, Uhrzeit); in einer Kontaktakte sofort für diesen Kontakt
  { id: "termin", label: "Termin buchen", hinweis: "Meta-Leads-Call oder Entscheidungs-Call", art: "link", href: "/admin/neu/vertrieb/termine?buchen=1" },
  { id: "zuordnung", label: "Zuordnung", hinweis: "Formular zu Kunde", art: "link", href: "/admin/neu/leads?neu=1#zuordnen" },
  { id: "ppl-bezug", label: "Pay-per-Lead-Bezug", art: "link", href: "/admin/neu/leads/ppl/bezug/neu" },
  { id: "linkedin", label: "LinkedIn-Entwurf", art: "link", href: "/admin/marketing/linkedin" },
  { id: "neuigkeit", label: "Neuigkeit", hinweis: "für den Kundenbereich", art: "link", href: "/admin/einstellungen/neuigkeiten" },
  { id: "kosten", label: "Kosten", hinweis: "laufende Kosten", art: "link", href: "/admin/einstellungen/kosten" },
];

// ─── Suche: Seiten ───────────────────────────────────────────────────────
export type SuchSeite = { titel: string; href: string; bereich: string; suchtext: string };

/** Alle Seiten ohne Platzhalter im Pfad, für die globale Suche (Abschnitt „Seiten“). */
export const SUCH_SEITEN: SuchSeite[] = SEITEN.filter((s) => !s.pfad.includes("[")).map((s) => {
  const b = BEREICHE.find((x) => x.id === s.bereich)!;
  const bereich = s.titel === b.label ? b.label : `${b.label}${s.gruppe ? ` · ${s.gruppe}` : ""}`;
  return { titel: s.titel, href: s.pfad, bereich, suchtext: `${s.titel} ${b.label} ${s.gruppe ?? ""} ${s.suchwoerter ?? ""}`.toLowerCase() };
});
