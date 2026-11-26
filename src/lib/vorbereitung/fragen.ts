// Fragen-Engine für die Terminvorbereitung im Chat (Ole, 26.11.2026). Nach der Buchung erfragt der Assistent die
// angebotsrelevanten Angaben je gebuchter Sparte, ohne WhatsApp-Formular:
//   - eine Frage pro Nachricht, möglichst mit Knöpfen (bis 2 Antworten + „Rest im Termin“) bzw. als WhatsApp-Liste
//     (bis 9 Zeilen + „Rest im Termin“, Zeile mit Beschreibung bis 72 Zeichen); Freitext für Zahlen, Daten, Namen,
//     Rassen, Adresse und Versicherer; Zusammengesetztes in einer Frage („Wohnfläche und Baujahr?“)
//   - Mehrfachauswahl (typ „mehrfach“): Liste, nach jeder Wahl „Noch etwas davon?“ mit „Das war alles“; getippt alles
//     auf einmal („Gas und Photovoltaik“)
//   - bedingte Folgefragen (wenn, folge: zählen im Fortschritt nicht mit), Wiederholung je Tier bzw. Person (gruppe)
//   - feste Abschnitte: 0/1 gemeinsame Fragen → 2 Pflichtfragen je Sparte → 3 Vorverträge → 4 Zusatzbausteine (eine
//     Sammelfrage) → 5 Adresse; innerhalb eines Abschnitts in der Reihenfolge der Definitionen
//   - gemeinsame Fragen (Sparte „gemeinsam“) nur einmal je Gespräch, auch wenn mehrere Sparten sie brauchen
//   - was aus Formular oder Chat schon bekannt ist oder sich ableiten lässt, wird übersprungen (vorwissen)
//   - Fortschritt („Noch 3 kurze Fragen.“), jederzeit „Rest im Termin“, unklare Antwort genau einmal nachfragen
//   - keine Gesundheitsfragen zu Menschen; Vorschäden der letzten 5 Jahre und die Gesundheit von Tieren sind erlaubt
// Die Definition je Sparte ist Daten (lib/vorbereitung/sparten.ts, Allianz-Rechner). Rein, ohne Datenbank (Server-Teil:
// lib/whatsapp/termin-strecke.ts, Abschnitt Fragen-Engine).

import { a, type Ansprache } from "@/lib/ansprache";
import { ablaufLesen, datumLesen, mmJjjj, ttMmJjjj, WEISS_NICHT_RE } from "@/lib/datum-antwort";
import { versichererAus } from "@/lib/whatsapp/vorvertraege";
import type { QualificationKey } from "@/lib/whatsapp/qualification";

/** Antworttyp einer Frage. */
export type FrageTyp = "knoepfe" | "liste" | "mehrfach" | "zahl" | "datum" | "versicherer" | "zusammengesetzt" | "text";

export type Text = { sie: string; du: string };

/** Gespeicherte Antwort: Wert (Anzeige), gewählte Optionen, Zahlen zusammengesetzter Antworten. */
export type Antwort = { wert: string; opt?: string[]; teile?: Record<string, number> };

/** Kontext für Bedingungen und Texte: gebuchte Sparten, bisherige Antworten, Formular und Angaben. */
export type Kontext = {
  sparten: readonly string[];
  /** Sparte der Frage */
  sparte: string;
  /** Nummer der Wiederholung (1 = erstes Tier bzw. erste Person) */
  i: number;
  /** Ist mindestens eine der Sparten gebucht? */
  gebucht: (...s: string[]) => boolean;
  antwort: (id: string) => Antwort | null;
  /** Wurde (mindestens) eine der Optionen gewählt? */
  hat: (id: string, ...opt: string[]) => boolean;
  /** Erste Zahl der Antwort */
  zahl: (id: string) => number | null;
  /** id einer Frage derselben Sparte (ohne i: dieselbe Wiederholung) */
  id: (key: string, i?: number) => string;
  formular: (re: RegExp) => string | null;
  angabe: (feld: QualificationKey) => string | null;
};

type Dyn<T> = T | ((c: Kontext) => T);

/** Antwortmöglichkeit (Knopf bzw. Listenzeile). titel: Knopf höchstens 20, Listenzeile höchstens 24 Zeichen. */
export type Option = {
  id: string;
  titel: string;
  /** Zeilenbeschreibung in der Liste (höchstens 72 Zeichen), z. B. der wörtliche Rechnertext */
  beschreibung?: string;
  /** gespeicherter Wert (sonst der Titel) */
  wert?: string;
  /** weitere Wörter, die als diese Antwort zählen */
  auch?: RegExp;
  /** Zeile nur, wenn die Bedingung passt (Sammelfrage Zusatzbausteine) */
  wenn?: (c: Kontext) => boolean;
  /** Mehrfachauswahl: schließt die anderen aus („Nichts davon“) */
  exklusiv?: boolean;
  /** Knock-out im Rechner: Angabe bleibt, Vermerk „online nicht berechenbar“ (der Chat bricht nicht ab) */
  ko?: boolean;
};

/** Teil einer zusammengesetzten Frage (in Reihenfolge der Frage). */
export type Teil = { key: string; label: string; typ: "zahl" | "monatJahr" | "versicherer"; min?: number; max?: number; einheit?: string; pflicht?: boolean };

export type FrageDef = {
  /** eindeutig je Sparte */
  key: string;
  typ: FrageTyp;
  pflicht: boolean;
  frage: Dyn<Text>;
  /** Kurzbezeichnung (Terminvorbereitung, „Noch klären im Termin“) */
  label: Dyn<string>;
  /** Wohin die Antwort geht (Conversation.qualificationData, erscheint in der Terminvorbereitung) */
  feld: QualificationKey;
  /** Antwort als „<praefix>: <wert>“ an das Feld anhängen (gleicher Präfix wird ersetzt) */
  praefix?: Dyn<string>;
  /** Antwort vor den bisherigen Wert setzen („Musterweg 5, 10115“) */
  voran?: boolean;
  /** Abschnitt: 0/1 gemeinsam, 2 je Sparte (Standard), 3 Vorverträge, 4 Zusatzbausteine, 5 Adresse */
  abschnitt?: 0 | 1 | 2 | 3 | 4 | 5;
  /** Folgefrage: steht direkt hinter der auslösenden Frage, ohne eigenen Fortschritt */
  folge?: boolean;
  /** Nur fragen, wenn die Bedingung passt */
  wenn?: (c: Kontext) => boolean;
  /** Wiederholung je Tier bzw. Person: aufeinanderfolgende Fragen derselben Gruppe bilden einen Block */
  gruppe?: { name: string; anzahl: (c: Kontext) => number };
  optionen?: Option[];
  /** Zusatzknöpfe bei Freitext („Weiß ich nicht“, „Nicht versichert“) */
  knoepfe?: Option[];
  teile?: Teil[];
  min?: number;
  max?: number;
  einheit?: string;
  /** Zahl außerhalb der Online-Berechnung (Vermerk, kein Abbruch) */
  ko?: (n: number) => boolean;
  /** Schon bekannt, wenn ein Formularfeld mit dieser Beschriftung einen Wert hat */
  formular?: RegExp;
  /** Schon bekannt, wenn das Feld einen Wert hat (mit Muster: nur, wenn der Wert passt) */
  bekanntWenn?: RegExp | true;
  /** Schon bekannt (z. B. Adresse im Formular) */
  schonBekannt?: (c: Kontext) => boolean;
  /** Aus anderen Antworten ableitbar (z. B. Hausrat-Wohnfläche aus dem Wohngebäude): nicht fragen, Wert übernehmen */
  abgeleitet?: (c: Kontext) => Antwort | null;
  /** Eigene Auswertung des getippten Texts */
  auswerten?: (t: string, jetzt: Date) => Auswertung;
  /** Unklare Antwort nicht nachfragen, sondern so übernehmen */
  ohneNachfrage?: boolean;
  /** Was bei der Nachfrage verlangt wird („Straße und Hausnummer“) */
  nachfrage?: string;
};

export type SparteDef = {
  /** Schlüssel der Engine (haftpflicht, hausrat, …, tierkranken, tierhalter, kfz; „gemeinsam“ für gemeinsame Fragen) */
  sparte: string;
  label: string;
  /** Vorläufig (nicht aus den Allianz-Rechnern): im Betrieb aus, nur in Tests bzw. mit Schalter */
  vorlaeufig: boolean;
  fragen: FrageDef[];
};

/** Eine Frage im Plan: Texte aufgelöst, Optionen nach Bedingung gefiltert, Vorwissen aus Formular bzw. Ableitung. */
export type GeplanteFrage = Omit<FrageDef, "frage" | "label" | "praefix"> & {
  sparte: string;
  sparteLabel: string;
  id: string;
  i: number;
  frage: Text;
  label: string;
  praefix?: string;
  /** Schon bekannt (Formular, Angaben, abgeleitet): Antwort für Bedingungen */
  vorwissen: Antwort | null;
  /** Wert, der ohne Frage übernommen wird (abgeleitet) */
  abgeleitetWert: Antwort | null;
};

/** Woraus „schon bekannt“ gelesen wird. */
export type FragenQuelle = {
  formular: { label: string; value: string }[];
  angaben: Partial<Record<string, string>>;
  /** Schon beantwortete bzw. übersprungene Fragen (id = sparte.key) */
  erledigt: readonly string[];
  /** Antworten der Engine (für Bedingungen und Wiederholungen) */
  antworten?: Record<string, Antwort>;
};

export const GEMEINSAM = "gemeinsam";

/** Knopf „Rest im Termin“: beendet die Fragen, offene Punkte gehen in die Terminvorbereitung. */
export const REST_KNOPF = { id: "vf:rest", title: "Rest im Termin" } as const;
export const REST_RE = /\b(rest|lieber|sp(ä|ae)ter|alles weitere)\b.{0,20}\b(im termin|beim termin|im gespr(ä|ae)ch|pers(ö|oe)nlich)\b|^\s*rest im termin\s*$|^\s*lieber im termin\s*$/i;

/** Mehrfachauswahl: Zeile „Das war alles“ nach der ersten Wahl. */
export const FERTIG = { id: "fertig", titel: "Das war alles" } as const;
const FERTIG_RE = /^(das war'?s|das war alles|fertig|nichts weiter|nein,? (das war'?s|danke)|nein|nichts mehr|sonst nichts|passt so)\b/i;
const KO_TEXT = " (online nicht berechenbar)";

/** id einer Frage im Plan (Wiederholung ab 2: „~2“). */
export const frageId = (sparte: string, key: string, i = 1) => (i > 1 ? `${sparte}.${key}~${i}` : `${sparte}.${key}`);

/** Payload eines Antwortknopfs bzw. einer Listenzeile: vf:<sparte>.<key>:<option>. */
export const optionPayload = (id: string, option: string) => `vf:${id}:${option}`;

/** Payload lesen: { id, option } bzw. rest; null = kein Knopf der Engine. */
export function payloadLesen(p: string | null | undefined): { rest: true } | { id: string; option: string } | null {
  const t = (p ?? "").trim();
  if (t === REST_KNOPF.id) return { rest: true };
  const m = /^vf:([a-z0-9-]+\.[a-zA-Z0-9~]+):([a-zA-Z0-9_-]+)$/.exec(t);
  return m ? { id: m[1], option: m[2] } : null;
}

/** Ist die Frage schon beantwortet bzw. bekannt? */
export function bekannt(f: GeplanteFrage, q: FragenQuelle): boolean {
  return q.erledigt.includes(f.id) || !!f.vorwissen;
}

const dyn = <T>(x: Dyn<T> | undefined, c: Kontext): T | undefined => (typeof x === "function" ? (x as (c: Kontext) => T)(c) : x);
const ersteZahl = (t: string | undefined): number | null => {
  const m = /\d+/.exec(t ?? "");
  return m ? Number(m[0]) : null;
};

/** Wert einer Option (mit Vermerk bei Knock-out). */
const optWert = (o: Option) => `${o.wert ?? o.titel}${o.ko ? KO_TEXT : ""}`;

/**
 * Fragenplan für die gebuchten Sparten (rein): gemeinsame Fragen nur einmal, feste Abschnitte, Bedingungen und
 * Wiederholungen nach den bisherigen Antworten (q.antworten, Vorwissen aus Formular und Angaben). Unbekannte Antworten
 * in Bedingungen: die Frage zählt mit (der Fortschritt kann also später kleiner werden). Nur Sparten mit Definition.
 */
export function fragenPlan(sparten: readonly string[], defs: readonly SparteDef[], q: FragenQuelle = { formular: [], angaben: {}, erledigt: [] }): GeplanteFrage[] {
  const gebuchteDefs = defs.filter((d) => d.sparte !== GEMEINSAM && sparten.includes(d.sparte));
  if (!gebuchteDefs.length) return [];
  const gebucht = gebuchteDefs.map((d) => d.sparte);
  const antworten: Record<string, Antwort> = { ...(q.antworten ?? {}) };
  const reihe = defs.filter((d) => d.sparte === GEMEINSAM || gebucht.includes(d.sparte));

  // Einheiten: einzelne Frage bzw. Block einer Gruppe, sortiert nach Abschnitt, Definition, Reihenfolge
  type Einheit = { d: SparteDef; di: number; fragen: FrageDef[]; ab: number; n: number };
  const einheiten: Einheit[] = [];
  reihe.forEach((d, di) => {
    let block: Einheit | null = null;
    d.fragen.forEach((f, n) => {
      if (f.gruppe && block && block.fragen[0].gruppe?.name === f.gruppe.name) {
        block.fragen.push(f);
        return;
      }
      block = { d, di, fragen: [f], ab: f.abschnitt ?? 2, n };
      einheiten.push(block);
      if (!f.gruppe) block = null;
    });
  });
  einheiten.sort((x, y) => x.ab - y.ab || x.di - y.di || x.n - y.n);

  const ctx = (d: SparteDef, i: number): Kontext => ({
    sparten: gebucht,
    sparte: d.sparte,
    i,
    gebucht: (...s) => s.some((x) => gebucht.includes(x)),
    antwort: (id) => antworten[id] ?? null,
    hat: (id, ...opt) => !!antworten[id]?.opt?.some((o) => opt.includes(o)),
    zahl: (id) => ersteZahl(antworten[id]?.wert),
    id: (key, j) => frageId(d.sparte, key, j ?? i),
    formular: (re) => q.formular.find((x) => re.test(x.label) && x.value.trim())?.value.replace(/\s+/g, " ").trim() ?? null,
    angabe: (feld) => q.angaben[feld]?.trim() || null,
  });

  const out: GeplanteFrage[] = [];
  const planen = (d: SparteDef, f: FrageDef, i: number) => {
    const c = ctx(d, i);
    if (f.wenn && !f.wenn(c)) return;
    const optionen = f.optionen?.filter((o) => !o.wenn || o.wenn(c));
    if ((f.typ === "knoepfe" || f.typ === "liste") && !optionen?.length) return;
    if (f.typ === "mehrfach" && !optionen?.some((o) => !o.exklusiv)) return;
    const id = frageId(d.sparte, f.key, i);
    const gf: GeplanteFrage = {
      ...f,
      optionen,
      sparte: d.sparte,
      sparteLabel: d.label,
      id,
      i,
      frage: dyn(f.frage, c)!,
      label: dyn(f.label, c)!,
      praefix: dyn(f.praefix, c),
      vorwissen: null,
      abgeleitetWert: null,
    };
    gf.abgeleitetWert = f.abgeleitet?.(c) ?? null;
    gf.vorwissen = gf.abgeleitetWert ?? vorwissen(gf, q, c);
    if (!antworten[id] && gf.vorwissen) antworten[id] = gf.vorwissen;
    out.push(gf);
  };
  for (const e of einheiten) {
    const g = e.fragen[0].gruppe;
    if (!g) {
      planen(e.d, e.fragen[0], 1);
      continue;
    }
    const n = Math.max(1, Math.min(10, g.anzahl(ctx(e.d, 1)) || 1));
    for (let i = 1; i <= n; i++) for (const f of e.fragen) planen(e.d, f, i);
  }
  return out;
}

/** Vorwissen aus Formular bzw. Angaben (mit erkannter Option, damit Bedingungen greifen). */
function vorwissen(f: GeplanteFrage, q: FragenQuelle, c: Kontext): Antwort | null {
  if (f.schonBekannt?.(c)) return { wert: "bekannt" };
  const ausText = (t: string): Antwort => {
    const r = antwortAuswerten(f, t, null);
    return r.art === "wert" ? { wert: r.wert, ...(r.opt ? { opt: r.opt } : {}), ...(r.teile ? { teile: r.teile } : {}) } : { wert: t };
  };
  if (f.formular && f.i === 1) {
    const v = c.formular(f.formular);
    if (v) return ausText(v);
  }
  const wert = q.angaben[f.feld];
  if (wert && f.bekanntWenn && f.i === 1 && (f.bekanntWenn === true || f.bekanntWenn.test(wert))) return ausText(wert);
  return null;
}

/** Offene Fragen in Reihenfolge (rein). */
export function offeneFragen(plan: readonly GeplanteFrage[], q: FragenQuelle): GeplanteFrage[] {
  return plan.filter((f) => !bekannt(f, q));
}

/** Offene Hauptfragen (Folgefragen zählen im Fortschritt nicht mit). */
export function anzahlHauptfragen(offen: readonly GeplanteFrage[]): number {
  return offen.filter((f) => !f.folge).length;
}

/** Fortschritt vor der Frage: „Noch 3 kurze Fragen.“ bzw. „Letzte kurze Frage:“. */
export function fortschrittText(anzahlOffen: number): string {
  return anzahlOffen <= 1 ? "Letzte kurze Frage:" : `Noch ${anzahlOffen} kurze Fragen.`;
}

export type ListenZeile = { id: string; title: string; description?: string };

export type FrageNachricht = {
  text: string;
  /** Antwort-Knöpfe (höchstens 3, inkl. „Rest im Termin“) */
  buttons: { id: string; title: string }[] | null;
  /** WhatsApp-Liste (bis 10 Zeilen, inkl. „Rest im Termin“), wenn die Antworten nicht auf Knöpfe passen */
  liste: { knopf: string; zeilen: ListenZeile[] } | null;
};

const zeile = (f: GeplanteFrage, o: Option): ListenZeile => ({
  id: optionPayload(f.id, o.id),
  title: o.titel.slice(0, 24),
  ...(o.beschreibung ? { description: o.beschreibung.slice(0, 72) } : {}),
});

/** Knöpfe bzw. Liste zu Optionen (rein). */
function auswahl(f: GeplanteFrage, opts: readonly Option[]): Pick<FrageNachricht, "buttons" | "liste"> {
  if (opts.length <= 2 && opts.every((o) => o.titel.length <= 20)) return { buttons: [...opts.map((o) => ({ id: optionPayload(f.id, o.id), title: o.titel })), REST_KNOPF], liste: null };
  return { buttons: null, liste: { knopf: "Antwort wählen", zeilen: [...opts.slice(0, 9).map((o) => zeile(f, o)), REST_KNOPF] } };
}

/**
 * Nachricht zu einer Frage (rein): Fortschritt (nicht bei Folgefragen), Frage, Knöpfe bzw. Liste. Knöpfe, wenn die
 * Antworten mit „Rest im Termin“ auf 3 Knöpfe passen, sonst Liste. Freitext: Zusatzknöpfe und „Rest im Termin“.
 */
export function frageNachricht(f: GeplanteFrage, an: Ansprache, anzahlOffen: number, einleitung?: string | null): FrageNachricht {
  const text = [einleitung, f.folge ? null : fortschrittText(anzahlOffen), a(an, f.frage.du, f.frage.sie)].filter(Boolean).join(" ");
  const opts = f.optionen ?? [];
  if (f.typ === "mehrfach") return { text, buttons: null, liste: { knopf: "Antwort wählen", zeilen: [...opts.slice(0, 9).map((o) => zeile(f, o)), REST_KNOPF] } };
  if ((f.typ === "knoepfe" || f.typ === "liste") && opts.length) return { text, ...auswahl(f, opts) };
  const extra = (f.knoepfe ?? []).slice(0, 2).map((o) => ({ id: optionPayload(f.id, o.id), title: o.titel.slice(0, 20) }));
  return { text, buttons: [...extra, REST_KNOPF], liste: null };
}

/** Mehrfachauswahl nach einer Wahl: „Noch etwas davon?“ mit „Das war alles“ und den übrigen Zeilen. */
export function mehrfachWeiterNachricht(f: GeplanteFrage, an: Ansprache, gewaehlt: readonly string[]): FrageNachricht {
  const rest = (f.optionen ?? []).filter((o) => !o.exklusiv && !gewaehlt.includes(o.id));
  return { text: a(an, "Danke! Noch etwas davon?", "Danke! Noch etwas davon?"), ...auswahl(f, [FERTIG, ...rest]) };
}

/** Übrige Zeilen einer Mehrfachauswahl nach den gewählten. */
export function mehrfachRest(f: GeplanteFrage, gewaehlt: readonly string[]): Option[] {
  return (f.optionen ?? []).filter((o) => !o.exklusiv && !gewaehlt.includes(o.id));
}

/** Wert einer Mehrfachauswahl aus den gewählten Optionen. */
export function mehrfachWert(f: GeplanteFrage, gewaehlt: readonly string[]): Auswertung {
  const opts = (f.optionen ?? []).filter((o) => gewaehlt.includes(o.id));
  return opts.length ? { art: "wert", wert: opts.map(optWert).join(", "), opt: opts.map((o) => o.id) } : { art: "unklar" };
}

/** Ergebnis der Auswertung einer Antwort. */
export type Auswertung =
  | { art: "wert"; wert: string; opt?: string[]; teile?: Record<string, number>; /** Teilantwort: das hier bleibt für den Termin */ offen?: string[] }
  /** Lead weiß es nicht: Frage für den Termin offen lassen, weiter */
  | { art: "offen" }
  | { art: "rest" }
  | { art: "unklar" };

/** „weiß ich nicht“, auch „weiß ich gerade nicht“, „hab ich nicht zur Hand“ (Ole, 26.11.2026) */
const weissNicht = (t: string) => WEISS_NICHT_RE.test(t) || /\bwei(ß|ss) (ich )?(gerade|grad|jetzt|momentan|aktuell|leider) (auch )?nicht\b|nicht zur hand|nicht im kopf/i.test(t);

const zahlen = (t: string): number[] => [...t.replace(/(\d)\.(\d{3})\b/g, "$1$2").matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
const NICHT_VERSICHERT_RE = /^(nein|nee|keine?|noch nicht|nicht versichert|neu|gar nicht|nirgends|nirgendwo)\b/i;
const norm = (t: string) => t.toLowerCase().replace(/[.!]+$/, "").trim();

/** Antwort auswerten (rein). knopf = gewählte Option (aus dem Payload), sonst der getippte Text. */
export function antwortAuswerten(f: Pick<GeplanteFrage, "typ" | "optionen" | "knoepfe" | "teile" | "min" | "max" | "einheit" | "ko" | "auswerten">, text: string | null | undefined, knopf: string | null = null, jetzt: Date = new Date()): Auswertung {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (knopf) {
    if (knopf === "weissnicht") return { art: "offen" };
    const o = [...(f.optionen ?? []), ...(f.knoepfe ?? [])].find((x) => x.id === knopf);
    return o ? { art: "wert", wert: optWert(o), opt: [o.id] } : { art: "unklar" };
  }
  if (!t) return { art: "unklar" };
  if (REST_RE.test(t)) return { art: "rest" };
  // eigene Auswertung zuerst (Teilantworten wie „HUK, Ablauf weiß ich nicht“), „weiß ich nicht“ allein bleibt offen
  if (f.auswerten) {
    const r = f.auswerten(t, jetzt);
    return r.art === "unklar" && weissNicht(t) ? { art: "offen" } : r;
  }
  if (weissNicht(t)) return { art: "offen" };
  const n = norm(t);
  switch (f.typ) {
    case "knoepfe":
    case "liste": {
      const opts = f.optionen ?? [];
      const genau = opts.filter((o) => n === o.titel.toLowerCase() || n === (o.wert ?? "").toLowerCase());
      const treffer = genau.length ? genau : opts.filter((o) => n.startsWith(o.titel.toLowerCase()) || (o.auch ? o.auch.test(t) : false));
      return treffer.length === 1 ? { art: "wert", wert: optWert(treffer[0]), opt: [treffer[0].id] } : { art: "unklar" };
    }
    case "mehrfach": {
      const opts = f.optionen ?? [];
      let treffer = opts.filter((o) => n.includes(o.titel.toLowerCase()) || (o.auch ? o.auch.test(t) : false));
      if (treffer.some((o) => !o.exklusiv)) treffer = treffer.filter((o) => !o.exklusiv);
      if (!treffer.length && /^(nein|nichts|keine?s?)\b/i.test(t)) treffer = opts.filter((o) => o.exklusiv).slice(0, 1);
      return treffer.length ? { art: "wert", wert: treffer.map(optWert).join(", "), opt: treffer.map((o) => o.id) } : { art: "unklar" };
    }
    case "zahl": {
      const z = zahlen(t).find((x) => (f.min === undefined || x >= f.min) && (f.max === undefined || x <= f.max));
      if (z === undefined) return /^(kein(e|er)?|null|nein)\b/i.test(t) && f.min === 0 ? { art: "wert", wert: "0" } : { art: "unklar" };
      return { art: "wert", wert: `${z}${f.einheit ? ` ${f.einheit}` : ""}${f.ko?.(z) ? KO_TEXT : ""}` };
    }
    case "datum": {
      const d = datumLesen(t, jetzt);
      return d ? { art: "wert", wert: ttMmJjjj(d) } : { art: "unklar" };
    }
    case "versicherer": {
      if (NICHT_VERSICHERT_RE.test(t)) return { art: "wert", wert: "noch nicht versichert", opt: ["nein"] };
      const v = versichererAus(t);
      return v ? { art: "wert", wert: v } : { art: "unklar" };
    }
    case "text":
      return /[a-zA-ZäöüÄÖÜß0-9]/.test(t) ? { art: "wert", wert: t.slice(0, 120) } : { art: "unklar" };
    case "zusammengesetzt":
      return teileAuswerten(f.teile ?? [], t, jetzt);
  }
}

/**
 * Zusammengesetzte Antwort: jeder Teil aus dem Text (Zahlen nach Bereich zugeordnet, „75 qm, 1990“ → Wohnfläche 75,
 * Baujahr 1990; Versicherer; Monat/Jahr). Fehlt ein Pflichtteil: unklar.
 */
function teileAuswerten(teile: readonly Teil[], t: string, jetzt: Date): Auswertung {
  const out: string[] = [];
  const werte: Record<string, number> = {};
  let rest = zahlen(t);
  for (const teil of teile) {
    const pflicht = teil.pflicht !== false;
    if (teil.typ === "versicherer") {
      if (NICHT_VERSICHERT_RE.test(t)) return { art: "wert", wert: "noch nicht versichert", opt: ["nein"] };
      const v = versichererAus(t);
      if (v) out.push(v);
      else if (pflicht) return { art: "unklar" };
      continue;
    }
    if (teil.typ === "monatJahr") {
      const mj = ablaufLesen(t, jetzt);
      if (mj && mj !== "weiss_nicht") {
        out.push(`${teil.label} ${mmJjjj(mj)}`);
        rest = rest.filter((z) => z !== mj.monat && z !== mj.jahr && z !== mj.jahr % 100);
      } else if (pflicht) return { art: "unklar" };
      continue;
    }
    const i = rest.findIndex((z) => (teil.min === undefined || z >= teil.min) && (teil.max === undefined || z <= teil.max));
    if (i < 0) {
      if (pflicht) return { art: "unklar" };
      continue;
    }
    const z = rest[i];
    rest = rest.filter((_, j) => j !== i);
    werte[teil.key] = z;
    out.push(teil.einheit ? `${z.toLocaleString("de-DE")} ${teil.einheit}` : `${teil.label} ${z}`);
  }
  return out.length ? { art: "wert", wert: out.join(", "), teile: werte } : { art: "unklar" };
}

/**
 * Vorvertrag einer Sparte (Ole, 26.11.2026): Versicherer und Ablauf (Monat/Jahr) aus dem Text, Teilantworten erlaubt,
 * kein Nachbohren; was fehlt, bleibt als offener Punkt für den Termin.
 */
export function vorvertragAuswerten(t: string, jetzt: Date, label: string): Auswertung {
  const v = versichererAus(t);
  const mj = ablaufLesen(t, jetzt);
  const ablauf = mj && mj !== "weiss_nicht" ? mmJjjj(mj) : null;
  if (!v && !ablauf && weissNicht(t)) return { art: "offen" };
  if (!v && NICHT_VERSICHERT_RE.test(t)) return { art: "wert", wert: "noch nicht versichert", opt: ["nein"] };
  if (v && ablauf) return { art: "wert", wert: `${v}, Ablauf ${ablauf}`, opt: ["ja"] };
  if (v) return { art: "wert", wert: `${v}, Ablauf offen`, opt: ["ja"], offen: [`Ablauf ${label}`] };
  if (ablauf) return { art: "wert", wert: `Ablauf ${ablauf}, Versicherer offen`, opt: ["ja"], offen: [`Versicherer ${label}`] };
  return { art: "wert", wert: t.slice(0, 120) };
}

/** Gemeinsame Vorvertragsfrage im Bündel: Text wie getippt, fehlender Versicherer bzw. Ablauf bleibt offen. */
export function vorvertraegeAuswerten(t: string, jetzt: Date): Auswertung {
  const v = versichererAus(t);
  const mj = ablaufLesen(t, jetzt);
  if (!v && !(mj && mj !== "weiss_nicht") && weissNicht(t)) return { art: "offen" };
  if (!v && NICHT_VERSICHERT_RE.test(t) && !(mj && mj !== "weiss_nicht")) return { art: "wert", wert: "noch nicht versichert", opt: ["nein"] };
  const offen = [...(v ? [] : ["Bisherige Versicherer"]), ...(mj && mj !== "weiss_nicht" ? [] : ["Ablauf der bisherigen Verträge"])];
  return { art: "wert", wert: t.slice(0, 160), ...(v ? { opt: ["ja"] } : {}), ...(offen.length ? { offen } : {}) };
}

/** Einmalige Nachfrage bei unklarer Antwort (rein). */
export function nachfrageText(f: GeplanteFrage, an: Ansprache): string {
  const bsp =
    f.nachfrage ??
    (f.typ === "zusammengesetzt"
      ? (f.teile ?? []).map((x) => x.label).join(" und ")
      : f.typ === "zahl"
        ? "eine Zahl"
        : f.typ === "datum"
          ? "ein Datum wie 15.03.1985"
          : f.typ === "versicherer"
            ? "den Namen der Versicherung"
            : f.typ === "mehrfach"
              ? "eine oder mehrere der Antworten"
              : f.typ === "text"
                ? "die Angabe"
                : "eine der Antworten");
  return a(an, `Das habe ich nicht ganz verstanden. Magst du mir kurz ${bsp} schreiben?`, `Das habe ich nicht ganz verstanden. Können Sie mir kurz ${bsp} schreiben?`);
}

/** Wert für das Feld der Terminvorbereitung: mit Präfix angehängt (gleicher Präfix ersetzt), voran oder ersetzt. */
export function feldWert(f: Pick<GeplanteFrage, "praefix" | "voran">, wert: string, vorher: string | null | undefined): string {
  const alt = (vorher ?? "").trim();
  if (f.voran) return alt && !alt.includes(wert) && !wert.includes(alt) ? `${wert}, ${alt}` : wert;
  if (!f.praefix) return wert;
  const neu = `${f.praefix}: ${wert}`;
  const p = `${f.praefix.toLowerCase()}:`;
  const rest = alt
    .split(/;\s*/)
    .filter((s) => s.trim() && !s.toLowerCase().startsWith(p))
    .join("; ");
  return rest ? `${rest}; ${neu}` : neu;
}

/** Dank bei „Rest im Termin“ (rein): freundlich stoppen. */
export function restText(an: Ansprache, personNom: string, wochentag: string): string {
  return a(an, `Alles klar, den Rest klärt ${personNom} mit dir im Termin. Bis ${wochentag}!`, `Alles klar, den Rest klärt ${personNom} mit Ihnen im Termin. Bis ${wochentag}!`);
}

/** Mehrfachauswahl beenden? („Das war alles“, „nein“, „fertig“) */
export function mehrfachFertig(text: string | null | undefined): boolean {
  return FERTIG_RE.test((text ?? "").trim());
}

/** Getippte Antwort auf die Frage nach der Vorbereitung (kurz, eindeutig); sonst null (der Assistent antwortet). */
export function vorbereitungAusText(text: string | null | undefined): "ja" | "termin" | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 40) return null;
  if (/\b(im termin|beim termin|sp(ä|ae)ter|lieber nicht|nein)\b/.test(t)) return "termin";
  if (/^(ja|jap|jo|gern|gerne|klar|ok|okay|sicher|na klar|ja,? (gern|gerne|klar|bitte)|ja bitte|legen sie los|leg los|los)\b[\s!.👍🙂]*$/u.test(t)) return "ja";
  return null;
}
