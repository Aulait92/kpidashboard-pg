// Instantly-Auswertung (Ole, 17.11.2026): nur lesende Kennzahlen je Kampagne und je Postfach aus dem, was die App
// lokal speichert (SalesCampaignLead, SalesEmail, SalesMeeting). Reine Funktionen ohne Datenbank, damit testbar;
// die Abfrage selbst steht in /api/ops/diagnose?q=instantly-auswertung.
// Ausgabe: nur Zahlen und Kategorien. Keine Mailtexte, keine Adressen von Kontakten; eigene Postfächer gekürzt,
// Betreffzeilen nur, wenn mindestens BETREFF_MIN_KONTAKTE verschiedene Kontakte darauf geantwortet haben
// (personalisierte Betreffs mit Agenturnamen fallen so heraus).

export type Stimmung = "POSITIV" | "NEGATIV" | "NEUTRAL" | "SPAETER";

export type AwKampagne = { id: string; name: string; ignored: boolean };
export type AwLead = {
  contactId: string;
  campaignId: string;
  /** letzter bekannter Versand (Abgleich: timestamp_last_contact; Webhook: letzter email_sent) */
  sentAt: Date | null;
  openCount: number;
  lastOpenAt: Date | null;
  replyCount: number;
  lastReplyAt: Date | null;
  bounced: boolean;
  unsubscribed: boolean;
  interest: string | null;
};
/** Eingehende Antwort; `text` ist schon ohne zitierten Verlauf und wird nur für die Einwand-Kategorie gelesen. */
export type AwAntwort = {
  contactId: string;
  campaign: string | null;
  eaccount: string | null;
  subject: string | null;
  text: string | null;
  sentiment: string | null;
  isAutoReply: boolean;
  sentAt: Date;
};
export type AwTermin = { contactId: string; status: string; createdAt: Date };

export type KampagnenZeile = {
  kampagne: string;
  angeschrieben: number;
  geoeffnet: number;
  antworten: number;
  positiv: number;
  spaeter: number;
  absagen: number;
  neutral: number;
  bounces: number;
  abmeldungen: number;
  termine: number;
};
export type PostfachZeile = { postfach: string; antworten: number; positiv: number; spaeter: number; absagen: number; neutral: number; termine: number };
export type BetreffZeile = { kampagne: string; betreff: string; antworten: number; positiv: number; spaeter: number; absagen: number };
export type EinwandZeile = { kategorie: string; anzahl: number };

export type Auswertung = {
  stand: string;
  ab30: string;
  kampagnen: { gesamt: KampagnenZeile[]; letzte30: KampagnenZeile[] };
  postfaecher: { gesamt: PostfachZeile[]; letzte30: PostfachZeile[] };
  betreffs: BetreffZeile[];
  einwaende: { gesamt: EinwandZeile[]; letzte30: EinwandZeile[] };
  hinweise: string[];
};

export const BETREFF_MIN_KONTAKTE = 3;
const TAG = 86400000;
const POSITIV_INTERESSE = new Set(["Interessiert", "Termin gebucht", "Termin stattgefunden", "Gewonnen"]);
const TERMIN_INTERESSE = new Set(["Termin gebucht", "Termin stattgefunden", "Gewonnen"]);
const ABSAGE_INTERESSE = new Set(["Kein Interesse", "Falsche Person", "Verloren"]);
const OHNE_KAMPAGNE = "(ohne Kampagne)";
const OHNE_POSTFACH = "(unbekannt)";

// ─── Einwände ────────────────────────────────────────────────────────────────────────────────────────
// Reihenfolge = Anzeige bei Gleichstand. Eine Antwort kann mehrere Kategorien treffen; je Kontakt zählt jede
// Kategorie einmal. Trifft keine, zählt sie als „Kein Interesse ohne Begründung“.
export const EINWAND_KATEGORIEN: { kategorie: string; muster: RegExp[] }[] = [
  {
    kategorie: "Kein Bedarf, ausgelastet",
    muster: [/kein(en)? bedarf/, /ausgelastet/, /ausgebucht/, /genug (kunden|arbeit|anfragen|zu tun)/, /kapazit(ät|äten)/, /(brauche|brauchen) (keine|nicht) (neuen? |weiteren? |mehr )?(kunden|anfragen|leads)/, /volle (auftragsbücher|terminkalender)/],
  },
  {
    kategorie: "Hat schon Anbieter oder Agentur",
    muster: [/(anbieter|dienstleister|agentur|leadlieferant|partner) (für|haben|habe|ist|sind)/, /(haben|habe|nutzen|nutze|arbeiten|arbeite)( bereits| schon)?( mit)?( bereits| schon)? (einen?|einer|eine|unsere[mn]?) (anbieter|dienstleister|agentur|partner)/, /(kaufen|kaufe|beziehen|beziehe) (bereits|schon) /, /arbeiten (bereits|schon) mit/, /lead\.?now|terminadler|alkaio/],
  },
  {
    kategorie: "Läuft über Allianz bzw. Versicherer",
    muster: [/über (die |unsere |meine )?(allianz|gesellschaft|direktion|generalvertretung|vertriebsdirektion|organisation)/, /allianz (stellt|bietet|macht|liefert|gibt)/, /(vom|von unserem|vom eigenen) (versicherer|unternehmen|konzern)/, /(bekommen|bekomme|erhalten|erhalte) (wir |ich )?(unsere |meine )?(leads|anfragen|kunden) (von|über) (der |die )?(allianz|gesellschaft)/],
  },
  {
    kategorie: "Darf nicht (Vorgaben des Versicherers)",
    muster: [/(darf|dürfen) (ich|wir) (das |so etwas |sowas )?(leider )?nicht/, /nicht (erlaubt|gestattet|zulässig)/, /vorgaben/, /richtlinie/, /compliance/, /genehmigung/],
  },
  {
    kategorie: "Zu teuer, kein Budget",
    muster: [/zu teuer/, /\bbudget/, /(kosten|preis) (ist|sind|zu hoch)/, /kein geld/, /nicht (leisten|investieren)/, /zu hohe? (kosten|preise?)/],
  },
  {
    kategorie: "Schlechte Erfahrung mit Leads",
    muster: [/schlechte(n)? erfahrung/, /(leads|anfragen) (taugen|bringen) nichts/, /schlechte (leads|qualität)/, /(hat|haben) nicht funktioniert/, /(schon|bereits) (mal )?(probiert|versucht|getestet)/, /enttäusch/, /reinfall/],
  },
  {
    kategorie: "Zeitpunkt passt nicht, später",
    muster: [/keine zeit/, /(aktuell|derzeit|momentan|zurzeit|im moment) (nicht|kein)/, /\bspäter\b/, /zu viel (zu tun|um die ohren)/],
  },
  {
    kategorie: "Austragen, keine Werbung",
    muster: [/austragen/, /abmelden/, /unsubscribe/, /keine werbung/, /(bitte )?(entfernen|löschen|streichen)/, /verteiler/, /nicht mehr (kontaktieren|anschreiben|schreiben)/, /keine (weiteren )?(e-?mails|nachrichten|anfragen)/, /\bspam\b/],
  },
  {
    kategorie: "Datenschutz, Herkunft der Adresse",
    muster: [/woher (haben sie|stammt|ist|kommt)/, /datenschutz/, /dsgvo/, /einwilligung/, /(meine|unsere) (daten|adresse)/],
  },
  {
    kategorie: "Falsche Person, nicht zuständig",
    muster: [/nicht zuständig/, /falsche (person|adresse|ansprechpartner)/, /(bin|ist) nicht (mehr )?(der|die) (richtige|inhaber)/, /ausgeschieden/, /weiterleiten an/],
  },
  {
    kategorie: "Ruhestand, Agentur aufgegeben",
    muster: [/ruhestand/, /\brente\b/, /aufgegeben/, /(agentur|büro) (wird |ist )?(geschlossen|verkauft|übergeben)/, /nachfolger/, /nicht mehr (tätig|aktiv)/, /aufgehört/],
  },
  {
    kategorie: "Macht Marketing selbst, Empfehlungen",
    muster: [/(mache|machen) (das |dies )?(selbst|selber)/, /(mache|machen) (das |unser |unsere |mein |meine )?(marketing|werbung|akquise)( \S+)? (selbst|selber)/, /eigene[nsm]? (marketing|werbung|kampagnen|leads|social media)/, /(über|durch|nur) empfehlung/, /bestandskunden/],
  },
];
export const OHNE_BEGRUENDUNG = "Kein Interesse ohne Begründung";
export const KATEGORIE_SPAETER = "Zeitpunkt passt nicht, später";

/** Einwand-Kategorien einer Absage- oder Später-Antwort (Text ohne Zitat). */
export function einwandKategorien(text: string | null | undefined, subject?: string | null, sentiment?: string | null): string[] {
  const t = `${normBetreff(subject ?? "")}\n${text ?? ""}`.toLowerCase();
  const out = EINWAND_KATEGORIEN.filter((k) => k.muster.some((r) => r.test(t))).map((k) => k.kategorie);
  if (sentiment === "SPAETER" && !out.includes(KATEGORIE_SPAETER)) out.push(KATEGORIE_SPAETER);
  return out.length ? out : [OHNE_BEGRUENDUNG];
}

// ─── Betreff und Postfach ────────────────────────────────────────────────────────────────────────────

/** „AW: Re: Frage zu Ihrer Agentur“ → „Frage zu Ihrer Agentur“ (Ziffern und Adressen ausgeblendet). */
export function normBetreff(subject: string): string {
  let s = subject.trim();
  for (let i = 0; i < 5; i++) s = s.replace(/^\s*(re|aw|antw|wg|fwd?|fw|wtr)\s*(\[\d+\])?\s*:\s*/i, "");
  return s
    .replace(/[^\s@]+@[^\s@]+/g, "…")
    .replace(/\d/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

/** Eigenes Instantly-Postfach gekürzt: „vertrieb.max@beispiel.de“ → „ver…@beispiel.de“. */
export function kurzPostfach(eaccount: string | null | undefined): string {
  const e = (eaccount ?? "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return OHNE_POSTFACH;
  return `${e.slice(0, Math.min(3, at))}…${e.slice(at)}`;
}

function stimmungAusInteresse(interest: string | null): Stimmung | null {
  if (!interest) return null;
  if (POSITIV_INTERESSE.has(interest)) return "POSITIV";
  if (ABSAGE_INTERESSE.has(interest)) return "NEGATIV";
  return null;
}
const alsStimmung = (s: string | null): Stimmung => (s === "POSITIV" || s === "NEGATIV" || s === "SPAETER" ? s : "NEUTRAL");

// ─── Auswertung ──────────────────────────────────────────────────────────────────────────────────────

export function auswerten(input: { kampagnen: AwKampagne[]; leads: AwLead[]; antworten: AwAntwort[]; termine: AwTermin[]; jetzt?: Date }): Auswertung {
  const jetzt = input.jetzt ?? new Date();
  const ab = new Date(jetzt.getTime() - 30 * TAG);
  const aktiv = input.kampagnen.filter((k) => !k.ignored);
  const kampagneName = new Map(aktiv.map((k) => [k.id, k.name]));
  const ignoriert = new Set(input.kampagnen.filter((k) => k.ignored).map((k) => k.name));
  const bekannt = new Set(aktiv.map((k) => k.name));
  const kampagneVon = (a: AwAntwort) => (a.campaign && bekannt.has(a.campaign) ? a.campaign : OHNE_KAMPAGNE);

  // Echte Antworten (keine automatischen, nicht von Hand erfasst, nicht aus ignorierten Kampagnen), älteste zuerst
  const antworten = input.antworten
    .filter((a) => !a.isAutoReply && a.campaign !== "manuell" && !(a.campaign && ignoriert.has(a.campaign)))
    .sort((x, y) => x.sentAt.getTime() - y.sentAt.getTime());

  // Termine je Kontakt (nicht abgesagt), Zeitpunkt der Buchung
  const termineVon = new Map<string, Date[]>();
  for (const t of input.termine) {
    if (t.status === "ABGESAGT") continue;
    termineVon.set(t.contactId, [...(termineVon.get(t.contactId) ?? []), t.createdAt]);
  }
  const terminNach = (contactId: string, seit: Date, fenster: Date | null) =>
    (termineVon.get(contactId) ?? []).some((d) => d.getTime() >= seit.getTime() - TAG && (!fenster || d >= fenster));

  const leadsJeKampagne = new Map<string, AwLead[]>();
  for (const l of input.leads) {
    const name = kampagneName.get(l.campaignId);
    if (!name) continue;
    leadsJeKampagne.set(name, [...(leadsJeKampagne.get(name) ?? []), l]);
  }

  function kampagnenZeilen(fenster: Date | null): KampagnenZeile[] {
    const inFenster = (d: Date | null) => !fenster || (!!d && d >= fenster);
    const namen = new Set<string>([...leadsJeKampagne.keys(), ...antworten.map(kampagneVon)]);
    const zeilen: KampagnenZeile[] = [];
    for (const name of namen) {
      const leads = leadsJeKampagne.get(name) ?? [];
      const z: KampagnenZeile = { kampagne: name, angeschrieben: 0, geoeffnet: 0, antworten: 0, positiv: 0, spaeter: 0, absagen: 0, neutral: 0, bounces: 0, abmeldungen: 0, termine: 0 };
      for (const l of leads) {
        if (l.sentAt && inFenster(l.sentAt)) z.angeschrieben++;
        if (l.openCount > 0 && (!fenster || inFenster(l.lastOpenAt))) z.geoeffnet++;
        if (l.bounced && (!fenster || inFenster(l.sentAt))) z.bounces++;
        if (l.unsubscribed && (!fenster || inFenster(l.sentAt))) z.abmeldungen++;
      }
      // Antwortende Kontakte: letzte Antwort im Zeitraum zählt; ohne gespeicherten Text Zähler aus Instantly
      const letzte = new Map<string, AwAntwort>();
      const erste = new Map<string, Date>();
      for (const a of antworten) {
        if (kampagneVon(a) !== name || !inFenster(a.sentAt)) continue;
        letzte.set(a.contactId, a);
        if (!erste.has(a.contactId)) erste.set(a.contactId, a.sentAt);
      }
      const leadVon = new Map(leads.map((l) => [l.contactId, l]));
      const stimmungen = new Map<string, Stimmung>();
      for (const [cid, a] of letzte) {
        const s = alsStimmung(a.sentiment);
        stimmungen.set(cid, s === "NEUTRAL" ? (stimmungAusInteresse(leadVon.get(cid)?.interest ?? null) ?? s) : s);
      }
      for (const l of leads) {
        if (stimmungen.has(l.contactId) || l.replyCount <= 0 || (fenster && !inFenster(l.lastReplyAt))) continue;
        stimmungen.set(l.contactId, stimmungAusInteresse(l.interest) ?? "NEUTRAL");
        if (l.lastReplyAt) erste.set(l.contactId, l.lastReplyAt);
      }
      for (const s of stimmungen.values()) {
        z.antworten++;
        if (s === "POSITIV") z.positiv++;
        else if (s === "SPAETER") z.spaeter++;
        else if (s === "NEGATIV") z.absagen++;
        else z.neutral++;
      }
      // Termine: Kontakt hat geantwortet und danach gebucht, oder Instantly meldet „Termin gebucht“
      const mitTermin = new Set<string>();
      for (const [cid, seit] of erste) if (terminNach(cid, seit, fenster)) mitTermin.add(cid);
      if (!fenster) for (const l of leads) if (l.interest && TERMIN_INTERESSE.has(l.interest)) mitTermin.add(l.contactId);
      z.termine = mitTermin.size;
      if (z.angeschrieben || z.antworten || z.bounces || z.termine) zeilen.push(z);
    }
    return zeilen.sort((a, b) => b.positiv - a.positiv || b.antworten - a.antworten || b.angeschrieben - a.angeschrieben || a.kampagne.localeCompare(b.kampagne));
  }

  function postfachZeilen(fenster: Date | null): PostfachZeile[] {
    const je = new Map<string, Map<string, AwAntwort>>();
    const erste = new Map<string, Map<string, Date>>();
    for (const a of antworten) {
      if (fenster && a.sentAt < fenster) continue;
      const p = kurzPostfach(a.eaccount);
      if (!je.has(p)) {
        je.set(p, new Map());
        erste.set(p, new Map());
      }
      je.get(p)!.set(a.contactId, a);
      if (!erste.get(p)!.has(a.contactId)) erste.get(p)!.set(a.contactId, a.sentAt);
    }
    const zeilen: PostfachZeile[] = [];
    for (const [postfach, kontakte] of je) {
      const z: PostfachZeile = { postfach, antworten: 0, positiv: 0, spaeter: 0, absagen: 0, neutral: 0, termine: 0 };
      for (const [cid, a] of kontakte) {
        z.antworten++;
        const s = alsStimmung(a.sentiment);
        if (s === "POSITIV") z.positiv++;
        else if (s === "SPAETER") z.spaeter++;
        else if (s === "NEGATIV") z.absagen++;
        else z.neutral++;
        if (terminNach(cid, erste.get(postfach)!.get(cid)!, fenster)) z.termine++;
      }
      zeilen.push(z);
    }
    return zeilen.sort((a, b) => b.positiv - a.positiv || b.antworten - a.antworten || a.postfach.localeCompare(b.postfach));
  }

  function betreffZeilen(): BetreffZeile[] {
    // je Kampagne + Betreff: letzte Antwort je Kontakt
    const je = new Map<string, Map<string, AwAntwort>>();
    for (const a of antworten) {
      const b = normBetreff(a.subject ?? "");
      if (!b) continue;
      const key = `${kampagneVon(a)}\u0000${b.toLowerCase()}`;
      if (!je.has(key)) je.set(key, new Map());
      je.get(key)!.set(a.contactId, { ...a, subject: b });
    }
    const zeilen: BetreffZeile[] = [];
    const rest: BetreffZeile = { kampagne: "(alle)", betreff: `(weitere Betreffs mit weniger als ${BETREFF_MIN_KONTAKTE} Antworten)`, antworten: 0, positiv: 0, spaeter: 0, absagen: 0 };
    for (const [key, kontakte] of je) {
      const erste = [...kontakte.values()][0];
      const z: BetreffZeile = { kampagne: key.split("\u0000")[0], betreff: erste.subject ?? "", antworten: 0, positiv: 0, spaeter: 0, absagen: 0 };
      for (const a of kontakte.values()) {
        z.antworten++;
        const s = alsStimmung(a.sentiment);
        if (s === "POSITIV") z.positiv++;
        else if (s === "SPAETER") z.spaeter++;
        else if (s === "NEGATIV") z.absagen++;
      }
      if (kontakte.size >= BETREFF_MIN_KONTAKTE) zeilen.push(z);
      else for (const k of ["antworten", "positiv", "spaeter", "absagen"] as const) rest[k] += z[k];
    }
    zeilen.sort((a, b) => b.positiv - a.positiv || b.antworten - a.antworten || a.betreff.localeCompare(b.betreff));
    const top = zeilen.slice(0, 15);
    return rest.antworten ? [...top, rest] : top;
  }

  function einwandZeilen(fenster: Date | null): EinwandZeile[] {
    // je Kontakt die Kategorien aller Absage-/Später-Antworten, jede Kategorie einmal
    const jeKontakt = new Map<string, Set<string>>();
    for (const a of antworten) {
      if (fenster && a.sentAt < fenster) continue;
      if (a.sentiment !== "NEGATIV" && a.sentiment !== "SPAETER") continue;
      const set = jeKontakt.get(a.contactId) ?? new Set<string>();
      for (const k of einwandKategorien(a.text, a.subject, a.sentiment)) set.add(k);
      jeKontakt.set(a.contactId, set);
    }
    const zaehler = new Map<string, number>();
    for (const set of jeKontakt.values()) {
      // „ohne Begründung“ nur, wenn der Kontakt sonst nichts genannt hat
      const ks = set.size > 1 ? [...set].filter((k) => k !== OHNE_BEGRUENDUNG) : [...set];
      for (const k of ks) zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
    }
    const reihenfolge = [...EINWAND_KATEGORIEN.map((k) => k.kategorie), OHNE_BEGRUENDUNG];
    return [...zaehler]
      .map(([kategorie, anzahl]) => ({ kategorie, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl || reihenfolge.indexOf(a.kategorie) - reihenfolge.indexOf(b.kategorie))
      .slice(0, 10);
  }

  return {
    stand: jetzt.toISOString(),
    ab30: ab.toISOString(),
    kampagnen: { gesamt: kampagnenZeilen(null), letzte30: kampagnenZeilen(ab) },
    postfaecher: { gesamt: postfachZeilen(null), letzte30: postfachZeilen(ab) },
    betreffs: betreffZeilen(),
    einwaende: { gesamt: einwandZeilen(null), letzte30: einwandZeilen(ab) },
    hinweise: HINWEISE,
  };
}

export const HINWEISE = [
  "Zählweise: Kontakte, nicht Mails. „Angeschrieben“ = Kontakte mit mindestens einer Mail der Kampagne; „Geöffnet“ = Kontakte mit mindestens einer Öffnung; Antworten = Kontakte mit echter Antwort (ohne automatische), Stimmung der letzten Antwort.",
  "Letzte 30 Tage: Angeschrieben, Bounces und Abmeldungen nach dem letzten Versand an den Kontakt (Instantly liefert nur diesen Zeitpunkt), Geöffnet nach der letzten Öffnung, Antworten und Einwände nach dem Antwortdatum, Termine nach dem Buchungsdatum.",
  "Termine: Kontakt hat in der Kampagne geantwortet und danach einen Termin gebucht (nicht abgesagt), oder Instantly meldet „Termin gebucht/stattgefunden/Gewonnen“ (nur Gesamtzeitraum).",
  "Je Postfach gibt es lokal nur Antworten und Termine: Versand, Öffnungen und Bounces speichert die App nicht je Postfach (dafür Instantly-API, siehe docs/instantly-auswertung.md).",
  "Sequenzschritte speichert die App nicht (weder beim Versand noch bei der Antwort); Auswertung je Schritt nur über die Instantly-API.",
  "Betreffzeilen aus den Antworten („Re:“ entfernt, Ziffern als #); nur Betreffs mit mindestens 3 antwortenden Kontakten, der Rest ist zusammengefasst.",
  "Einwände: Stichwort-Kategorien über Absagen und Später-Antworten, je Kontakt jede Kategorie einmal; mehrere Kategorien je Antwort möglich.",
];

// ─── Markdown ────────────────────────────────────────────────────────────────────────────────────────

const quote = (teil: number, ganz: number) => (ganz > 0 ? `${((teil / ganz) * 100).toFixed(1).replace(".", ",")} %` : "k. A.");
const zelle = (s: string) => s.replace(/\|/g, "/");

/** Markdown-Tabelle; die ersten `links` Spalten linksbündig (Text), der Rest rechtsbündig (Zahlen). */
function tabelle(kopf: string[], zeilen: (string | number)[][], links = 1): string {
  if (!zeilen.length) return "_keine Daten_\n";
  return [`| ${kopf.join(" | ")} |`, `|${kopf.map((_, i) => (i < links ? "---" : "---:")).join("|")}|`, ...zeilen.map((z) => `| ${z.map((c) => zelle(String(c))).join(" | ")} |`)].join("\n") + "\n";
}

function summe<T extends Record<string, unknown>>(zeilen: T[], felder: (keyof T)[]): Record<string, number> {
  const s: Record<string, number> = {};
  for (const f of felder) s[f as string] = zeilen.reduce((a, z) => a + (Number(z[f]) || 0), 0);
  return s;
}

function kampagnenTabelle(zeilen: KampagnenZeile[]): string {
  const felder = ["angeschrieben", "geoeffnet", "antworten", "positiv", "spaeter", "absagen", "neutral", "bounces", "abmeldungen", "termine"] as const;
  const s = summe(zeilen, [...felder]);
  const zeile = (name: string, z: Record<string, number>) => [
    name,
    z.angeschrieben,
    z.geoeffnet,
    z.antworten,
    quote(z.antworten, z.angeschrieben),
    z.positiv,
    quote(z.positiv, z.angeschrieben),
    z.spaeter,
    z.absagen,
    z.neutral,
    z.bounces,
    quote(z.bounces, z.angeschrieben),
    z.abmeldungen,
    z.termine,
  ];
  const kopf = ["Kampagne", "Angeschrieben", "Geöffnet", "Antworten", "Antwortquote", "Positiv", "Positivquote", "Später", "Absagen", "Neutral", "Bounces", "Bouncequote", "Abgemeldet", "Termine"];
  return tabelle(kopf, zeilen.length ? [...zeilen.map((z) => zeile(z.kampagne, z as unknown as Record<string, number>)), zeile("**Summe**", s)] : []);
}

function postfachTabelle(zeilen: PostfachZeile[]): string {
  const s = summe(zeilen, ["antworten", "positiv", "spaeter", "absagen", "neutral", "termine"]);
  const zeile = (name: string, z: Record<string, number>) => [name, z.antworten, z.positiv, quote(z.positiv, z.antworten), z.spaeter, z.absagen, z.neutral, z.termine];
  return tabelle(["Postfach", "Antworten", "Positiv", "Anteil positiv", "Später", "Absagen", "Neutral", "Termine"], zeilen.length ? [...zeilen.map((z) => zeile(z.postfach, z as unknown as Record<string, number>)), zeile("**Summe**", s)] : []);
}

export function alsMarkdown(a: Auswertung): string {
  const datum = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");
  return [
    `# Instantly-Auswertung (Stand ${datum(a.stand)})`,
    "",
    "## Je Kampagne: gesamter Zeitraum",
    kampagnenTabelle(a.kampagnen.gesamt),
    `## Je Kampagne: letzte 30 Tage (ab ${datum(a.ab30)})`,
    kampagnenTabelle(a.kampagnen.letzte30),
    "## Je Postfach: gesamter Zeitraum",
    postfachTabelle(a.postfaecher.gesamt),
    "## Je Postfach: letzte 30 Tage",
    postfachTabelle(a.postfaecher.letzte30),
    "## Betreffzeilen nach positiven Antworten (gesamter Zeitraum)",
    tabelle(["Kampagne", "Betreff", "Antworten", "Positiv", "Später", "Absagen"], a.betreffs.map((b) => [b.kampagne, b.betreff, b.antworten, b.positiv, b.spaeter, b.absagen]), 2),
    "## Sequenzschritte",
    "_nicht lokal gespeichert, siehe Hinweise_\n",
    "## Häufigste Einwände (Top 10, Kontakte)",
    "**Gesamter Zeitraum**\n",
    tabelle(["Einwand", "Anzahl"], a.einwaende.gesamt.map((e) => [e.kategorie, e.anzahl])),
    "**Letzte 30 Tage**\n",
    tabelle(["Einwand", "Anzahl"], a.einwaende.letzte30.map((e) => [e.kategorie, e.anzahl])),
    "## Hinweise",
    ...a.hinweise.map((h) => `- ${h}`),
    "",
  ].join("\n");
}
