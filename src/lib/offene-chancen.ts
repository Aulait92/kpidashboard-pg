// Offene Chancen auf „Wachstum“ (Ole, 18.11.2026): Leads, bei denen ein Abschluss realistisch noch kommen kann.
// Rein (getestet in tests/unit/offene-chancen.test.ts); die Abfragen stehen in lib/offene-chancen-server.ts.
//
// Eine Chance ist ein offener Lead (nicht gewonnen, nicht verloren, nicht storniert, nicht gelöscht) in genau einer Stufe:
//   1. angebot        Angebot gesendet, noch keine Entscheidung
//   2. termin_offen   Termin war, Ergebnis noch nicht eingetragen
//   3. termin         Termin gebucht, noch nicht stattgefunden
//   4. wiedervorlage  Bedenkzeit bzw. Wiedervorlage mit Datum, nachdem schon gesprochen wurde
// Nicht: nicht erreichte Neu-Leads (auch nicht mit Wiedervorlage), verlorene und abgeschlossene Leads.
//
// Wert je Chance = erwartete Provision (1. Jahr, Sätze aus „Meine Provisionen“; Beitrag aus dem abgelegten Angebot zum
// Termin, sonst Standardbeitrag des Produkts) × Quote der Stufe. Quoten aus den eigenen entschiedenen Fällen der letzten
// 12 Monate (Angebot → Abschluss, Termin → Abschluss); unter MIN_FAELLE_QUOTE Fällen gilt die Standardquote aus dem Admin
// (Einstellungen → Laufende Kosten, KpiSettings) und die Zahl heißt „Schätzung“. Wiedervorlagen rechnen mit der Termin-Quote.

import { contractProvision, sparteForSource, sparteKind, type ProvisionOverrides, type SparteKey } from "@/lib/provision";

export type ChanceStufe = "angebot" | "termin_offen" | "termin" | "wiedervorlage";

/** Standardquoten, solange zu wenige eigene Fälle da sind (im Admin änderbar). */
export const STANDARD_QUOTEN = { angebot: 0.4, termin: 0.25 } as const;
/** Ab so vielen entschiedenen Fällen je Stufe gilt die eigene Quote. */
export const MIN_FAELLE_QUOTE = 10;
/** Termin gilt nach so vielen Minuten als vorbei (wie „Wie lief es?“ auf Heute, lib/lead-next-step). */
export const TERMIN_VORBEI_MS = 30 * 60 * 1000;

const ANGEBOT_STATUS = new Set(["Angebot gesendet", "Angebot verschickt", "Angebot raus"]);
/** Gesprochen (für Wiedervorlagen): Beratungs- bzw. Angebotsphase. */
const GESPROCHEN_STATUS = new Set(["In Beratung", "Im Gespräch", "Erreicht", "Qualifiziert", "Termin vereinbart", "Angebot/Beratung läuft", ...ANGEBOT_STATUS]);
const ENTSCHIEDEN_STATUS = new Set(["Abschluss", "Kein Interesse", "Disqualifiziert", "Disqualified", "Nicht qualifiziert"]);
const STORNO_ERLEDIGT = new Set(["requested", "review", "approved"]);

export type ChanceTermin = {
  startsAt: Date;
  /** booked | completed | cancelled | no_show */
  status: string;
  /** Gewählte Angebote zum Termin (Sparte, Monatsbeitrag). */
  angebote?: { sparte: string; beitragMonat: number | null }[];
};

export type ChanceLead = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  reached: boolean;
  followUpAt: Date | null;
  followUpNote?: string | null;
  closedAt?: Date | null;
  lostAt?: Date | null;
  erasedAt?: Date | null;
  stornoState?: string | null;
  termine: ChanceTermin[];
};

export type Quote = { quote: number; eigen: boolean; faelle: number };
export type Quoten = { angebot: Quote; termin: Quote };

export type Chance = {
  leadId: string;
  name: string;
  stufe: ChanceStufe;
  /** Erwartete Provision bei Abschluss (1. Jahr). */
  provision: number;
  /** Beitrag aus dem abgelegten Angebot (sonst Standardbeitrag). */
  ausAngebot: boolean;
  quote: number;
  /** provision × quote, gerundet. */
  erwartet: number;
  /** Mit Standardquote gerechnet. */
  schaetzung: boolean;
  naechsterSchritt: string;
  /** Datum des nächsten Schritts (Termin bzw. Wiedervorlage), für die Sortierung bei gleichem Wert. */
  wann: Date | null;
};

export type Chancen = {
  liste: Chance[];
  anzahl: number;
  angebote: number;
  termine: number;
  wiedervorlagen: number;
  /** Summe der Provision, wenn alle abschließen. */
  bisZu: number;
  /** Summe der erwarteten Provision (realistisch). */
  realistisch: number;
  /** Mindestens eine Chance mit Standardquote gerechnet. */
  schaetzung: boolean;
  quoten: Quoten;
};

const offen = (l: ChanceLead) =>
  !l.closedAt && !l.lostAt && !l.erasedAt && !(l.stornoState && STORNO_ERLEDIGT.has(l.stornoState)) && !ENTSCHIEDEN_STATUS.has(l.status ?? "") && !(l.status ?? "").toLowerCase().startsWith("storno");

const gebucht = (t: ChanceTermin) => t.status === "booked";

/** Stufe eines Leads oder null (keine Chance). */
export function chanceStufe(l: ChanceLead, now: Date): ChanceStufe | null {
  if (!offen(l)) return null;
  if (ANGEBOT_STATUS.has(l.status ?? "")) return "angebot";
  const grenze = now.getTime() - TERMIN_VORBEI_MS;
  if (l.termine.some((t) => gebucht(t) && t.startsAt.getTime() <= grenze)) return "termin_offen";
  if (l.termine.some((t) => gebucht(t) && t.startsAt.getTime() > grenze)) return "termin";
  const gesprochen = l.reached || GESPROCHEN_STATUS.has(l.status ?? "") || l.termine.some((t) => t.status === "completed");
  if (l.followUpAt && gesprochen) return "wiedervorlage";
  return null;
}

/** Monatsbeitrag aus dem Angebot → gespeicherter Beitrag der Sparte (PKV: Monatsbeitrag, sonst Jahresbeitrag). */
function beitragFuerSparte(sparte: SparteKey, monat: number | null): number | null {
  if (monat == null || !(monat > 0)) return null;
  const kind = sparteKind(sparte);
  if (kind === "monthly") return monat;
  if (kind === "honorar" || kind === "fixed") return null;
  return monat * 12;
}

/** Erwartete Provision (1. Jahr) bei Abschluss: aus dem jüngsten Termin mit Angeboten, sonst Produkt des Leads mit Standardbeitrag. */
export function erwarteteProvision(l: Pick<ChanceLead, "source" | "termine">, rates?: ProvisionOverrides): { betrag: number; ausAngebot: boolean } {
  const mitAngebot = [...l.termine].filter((t) => t.angebote?.length).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  const fallback = sparteForSource(l.source) ?? "sonstiges";
  if (mitAngebot?.angebote?.length) {
    let sum = 0;
    for (const a of mitAngebot.angebote) {
      const sparte = sparteForSource(a.sparte) ?? fallback;
      sum += contractProvision({ sparte, premium: beitragFuerSparte(sparte, a.beitragMonat) }, rates).firstYear;
    }
    if (sum > 0) return { betrag: Math.round(sum), ausAngebot: mitAngebot.angebote.some((a) => a.beitragMonat != null) };
  }
  return { betrag: Math.round(contractProvision({ sparte: fallback, premium: null }, rates).firstYear), ausAngebot: false };
}

/** Ein entschiedener oder offener Fall aus den letzten 12 Monaten (für die eigenen Quoten). */
export type QuotenFall = { hatteTermin: boolean; hatteAngebot: boolean; abschluss: boolean; verloren: boolean };

/** Eigene Quoten je Stufe (nur entschiedene Fälle), sonst die Standardquote. */
export function eigeneQuoten(faelle: QuotenFall[], standard: { angebot: number; termin: number } = STANDARD_QUOTEN): Quoten {
  const q = (filter: (f: QuotenFall) => boolean, std: number): Quote => {
    const basis = faelle.filter((f) => filter(f) && (f.abschluss || f.verloren));
    if (basis.length < MIN_FAELLE_QUOTE) return { quote: std, eigen: false, faelle: basis.length };
    return { quote: basis.filter((f) => f.abschluss).length / basis.length, eigen: true, faelle: basis.length };
  };
  return { angebot: q((f) => f.hatteAngebot, standard.angebot), termin: q((f) => f.hatteTermin, standard.termin) };
}

const tagFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
const zeitFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
const tag = (d: Date) => tagFmt.format(d).replace(/\.?$/, ".");

/** Nächster Schritt je Chance (kurz, Sie-Form der Oberfläche). */
export function naechsterSchritt(l: ChanceLead, stufe: ChanceStufe, now: Date): { text: string; wann: Date | null } {
  const grenze = now.getTime() - TERMIN_VORBEI_MS;
  if (stufe === "angebot") {
    return l.followUpAt ? { text: `Angebot nachfassen am ${tag(l.followUpAt)}`, wann: l.followUpAt } : { text: "Angebot nachfassen", wann: null };
  }
  if (stufe === "termin_offen") {
    const t = l.termine.filter((x) => gebucht(x) && x.startsAt.getTime() <= grenze).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
    return { text: `Ergebnis vom Termin am ${tag(t.startsAt)} eintragen`, wann: t.startsAt };
  }
  if (stufe === "termin") {
    const t = l.termine.filter((x) => gebucht(x) && x.startsAt.getTime() > grenze).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    return { text: `Termin am ${tag(t.startsAt)} um ${zeitFmt.format(t.startsAt)} Uhr`, wann: t.startsAt };
  }
  const notiz = (l.followUpNote ?? "").trim();
  const wann = l.followUpAt!;
  const faellig = wann.getTime() < now.getTime() ? `seit ${tag(wann)} fällig` : `am ${tag(wann)}`;
  return { text: `Wiedervorlage ${faellig}${notiz ? ` (${notiz.length > 30 ? `${notiz.slice(0, 29)}…` : notiz})` : ""}`, wann };
}

/** Alle Chancen mit Wert, sortiert nach erwartetem Wert (absteigend). */
export function bewerteChancen(leads: ChanceLead[], quoten: Quoten, rates: ProvisionOverrides | undefined, now: Date): Chancen {
  const liste: Chance[] = [];
  for (const l of leads) {
    const stufe = chanceStufe(l, now);
    if (!stufe) continue;
    const q = stufe === "angebot" ? quoten.angebot : quoten.termin;
    const { betrag, ausAngebot } = erwarteteProvision(l, rates);
    const schritt = naechsterSchritt(l, stufe, now);
    liste.push({
      leadId: l.id,
      name: (l.name ?? "").trim() || "Ohne Namen",
      stufe,
      provision: betrag,
      ausAngebot,
      quote: q.quote,
      erwartet: Math.round(betrag * q.quote),
      schaetzung: !q.eigen,
      naechsterSchritt: schritt.text,
      wann: schritt.wann,
    });
  }
  liste.sort((a, b) => b.erwartet - a.erwartet || (a.wann?.getTime() ?? Infinity) - (b.wann?.getTime() ?? Infinity));
  const n = (s: ChanceStufe[]) => liste.filter((c) => s.includes(c.stufe)).length;
  return {
    liste,
    anzahl: liste.length,
    angebote: n(["angebot"]),
    termine: n(["termin", "termin_offen"]),
    wiedervorlagen: n(["wiedervorlage"]),
    bisZu: liste.reduce((s, c) => s + c.provision, 0),
    realistisch: liste.reduce((s, c) => s + c.erwartet, 0),
    schaetzung: liste.some((c) => c.schaetzung),
    quoten,
  };
}

/** Unterzeile der Kachel, z. B. „2 Angebote, 4 Termine“. */
export function chancenAufteilung(c: Pick<Chancen, "angebote" | "termine" | "wiedervorlagen">): string {
  const teile = [
    c.angebote ? `${c.angebote} ${c.angebote === 1 ? "Angebot" : "Angebote"}` : null,
    c.termine ? `${c.termine} ${c.termine === 1 ? "Termin" : "Termine"}` : null,
    c.wiedervorlagen ? `${c.wiedervorlagen} ${c.wiedervorlagen === 1 ? "Bedenkzeit" : "Bedenkzeiten"}` : null,
  ].filter(Boolean);
  return teile.join(", ");
}

export const STUFE_LABEL: Record<ChanceStufe, string> = {
  angebot: "Angebot offen",
  termin_offen: "Termin war",
  termin: "Termin gebucht",
  wiedervorlage: "Bedenkzeit",
};
