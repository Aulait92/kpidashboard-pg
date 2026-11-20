// Zusammenfassung über alle ausgelesenen Verträge eines Kunden (rein, testbar). Nur Hinweise an den Vermittler als
// Fragen für den Termin, keine Beratung und keine Bewertung (Rechtsprüfung K8: nichts zu Versicherbarkeit, Annahme
// oder Preisen). Deshalb:
// - Kündigungen nur bei Sachversicherungen (Haftpflicht, Hausrat, Wohngebäude, Rechtsschutz, Kfz).
// - „Doppelt“ nur Haftpflicht, Hausrat, Rechtsschutz (zwei Autos oder zwei Häuser sind normal; nie PKV, BU, Leben).
// - Hinweise auf Bausteine nur Sach und nur, wenn das Dokument ausdrücklich „nein“ sagt.
// - Fragen nur aus den festen Vorlagen unten, Euro nur als Beitrag laut Unterlage, nie Ersparnis oder Vergleichspreis.
// - Fristen vorsichtig: „bis“ = (Kündigungstermin minus Frist) minus 1 Tag, Countdown nur mit Frist aus dem Dokument,
//   Tagesgrenze Europe/Berlin. Ohne Frist keine angenommene Standardfrist.

import { jahresbetrag, monatsbetrag, SPARTE_LABEL, type AuslesenSparte, type Felder } from "@/lib/policen/auslesen/felder";
import { gesellschaftAusText, gesellschaftSchluessel } from "@/lib/tarifkatalog";

export type VertragKurz = { id: string; sparte: AuslesenSparte; felder: Felder; geprueft: boolean };

export type Kuendigung = {
  id: string;
  sparte: AuslesenSparte;
  versicherer: string | null;
  /** Termin, zu dem gekündigt werden kann */
  zum: string;
  /** bis wann die Kündigung beim Versicherer sein muss (vorsichtig, minus 1 Tag); null ohne Frist im Dokument */
  bis: string | null;
  /** Beitrag im Jahr laut Unterlage; null ohne Beitrag oder Zahlweise */
  jahresbetrag: number | null;
  /** Tage bis „bis“ (Europe/Berlin), nur mit Frist aus dem Dokument */
  tageBis: number | null;
  /** letzte, schon verpasste Frist (dann sind zum/bis der nächste Termin); null sonst */
  verpasst: string | null;
  /** zum stammt aus einem im Dokument genannten Kündigungstermin (sonst aus dem Ablauf) */
  genannt: boolean;
};

export type Doppelt = {
  sparte: AuslesenSparte;
  ids: string[];
  /** Versicherer der Verträge (ohne Doppelte, nur bekannte) */
  versicherer: string[];
  /** Summe der Monatsbeiträge, nur wenn alle Beiträge bekannt sind */
  monatSumme: number | null;
};

export type FrageTyp = "kuendigung" | "doppelt" | "baustein" | "nicht_geschickt";
export type Frage = {
  typ: FrageTyp;
  text: string;
  /** Leise zweite Zeile (nur Kündigung: Beitrag laut Unterlage) */
  zusatz?: string;
  /** Verträge, zu denen die Frage gehört (Sprung zur Karte); leer bei „Nicht geschickt“ */
  ids: string[];
  /** Tage bis zur Frist bzw. zum Kündigungstermin (nur Kündigung) */
  tage: number | null;
  /** Beitrag im Jahr laut Unterlage(n), für die Reihenfolge */
  jahresbetrag: number | null;
};

export type Zusammenfassung = {
  vertraege: number;
  /** Summe der Monatsbeträge (gleiche Police doppelt geschickt zählt einmal); null, wenn kein Beitrag bekannt */
  monatSumme: number | null;
  /** Summe der Jahresbeträge (aus Beitrag und Zahlweise); null, wenn kein Beitrag bekannt */
  jahrSumme: number | null;
  /** Verträge mit Beitrag, aber ohne Zahlweise bzw. umgekehrt (nicht in der Summe) */
  ohneBetrag: number;
  ungeprueft: number;
  kuendigungen: Kuendigung[];
  doppelt: Doppelt[];
  bausteine: { id: string; text: string }[];
  /** Haftpflicht, Hausrat, Rechtsschutz, zu denen keine Unterlage kam (leer, wenn das nicht sicher ist) */
  nichtGeschickt: AuslesenSparte[];
  /** Fragen für den Termin, sortiert: Kündigung (nach Tagen, dann Beitrag), doppelt, Bausteine, nicht geschickt */
  fragen: Frage[];
};

export type ZusammenfassungOptionen = {
  /** Sparten aller Unterlagen des Kunden mit bekannter Sparte (auch nicht ausgelesene) */
  unterlagenSparten?: readonly AuslesenSparte[];
  /** Unterlagen ohne bekannte Sparte: dann ist „nicht geschickt“ nicht sicher und entfällt */
  unterlagenOhneSparte?: number;
  /** Kunde hat das Auslesen abgelehnt (A9): kein „nicht geschickt“ */
  ohneKi?: boolean;
  /**
   * Gesellschaft(en) des Vertreters (Schlüssel wie „allianz“, aus vertriebFuer). Verträge dort sind sein eigener
   * Bestand: kein Kündigungshinweis (Persona-Test 20.11.2026). Beim Makler leer lassen.
   */
  eigeneGesellschaften?: readonly string[];
};

/** Vertrag bei einer der eigenen Gesellschaften (Versicherer laut Unterlage). */
export function beiEigenerGesellschaft(versicherer: string | null, eigene: readonly string[] | undefined): boolean {
  if (!versicherer || !eigene?.length) return false;
  const g = gesellschaftAusText(versicherer);
  return !!g && eigene.map(gesellschaftSchluessel).includes(gesellschaftSchluessel(g));
}

export const KUENDIGUNG_SPARTEN: readonly AuslesenSparte[] = ["haftpflicht", "hausrat", "wohngebaeude", "rechtsschutz", "kfz"];
export const DOPPELT_SPARTEN: readonly AuslesenSparte[] = ["haftpflicht", "hausrat", "rechtsschutz"];
export const NICHT_GESCHICKT_SPARTEN: readonly AuslesenSparte[] = ["haftpflicht", "hausrat", "rechtsschutz"];
/** Kündigungen und Fristen, die in so vielen Tagen anstehen, kommen in die Fragen */
export const KUENDIGUNG_FENSTER_TAGE = 92;

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tagMs = (isoTag: string) => Date.parse(`${isoTag}T00:00:00Z`);
const plusTage = (isoTag: string, n: number) => iso(new Date(tagMs(isoTag) + n * DAY));
const plusMonate = (isoTag: string, m: number) => {
  const d = new Date(`${isoTag}T00:00:00Z`);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
};

/** Heutiges Datum in Europe/Berlin (JJJJ-MM-TT). */
export function heuteBerlin(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const t = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${t("year")}-${t("month")}-${t("day")}`;
}

/** Ganze Tage von heute bis zum Tag (beide JJJJ-MM-TT). */
export const tageZwischen = (heute: string, tag: string) => Math.round((tagMs(tag) - tagMs(heute)) / DAY);

/** Letzter Tag, an dem die Kündigung beim Versicherer sein muss: (Termin minus Frist) minus 1 Tag (vorsichtig). */
export const fristBis = (zum: string, fristMonate: number) => plusTage(plusMonate(zum, -fristMonate), -1);

export type Fenster = { zum: string; bis: string | null; verpasst: string | null; genannt: boolean };

/**
 * Nächster Termin, zu dem gekündigt werden kann (zum), und bis wann die Kündigung beim Versicherer sein muss (bis).
 * Genannter Kündigungstermin geht vor; sonst Ablauf, jährlich fortgeschrieben. Ist die Frist für den nächsten Termin
 * schon vorbei, steht sie in verpasst und zum/bis zeigen den Termin ein Jahr später.
 */
export function kuendigungsfenster(f: Felder, heute: string): Fenster | null {
  const frist = typeof f.kuendigungsfrist_monate?.w === "number" ? f.kuendigungsfrist_monate.w : null;
  const genannt = typeof f.naechster_kuendigungstermin?.w === "string" ? f.naechster_kuendigungstermin.w : null;
  const ablauf = typeof f.ablauf?.w === "string" ? f.ablauf.w : null;
  let zum: string | null = null;
  let istGenannt = false;
  if (genannt && genannt >= heute) {
    zum = genannt;
    istGenannt = true;
  } else if (ablauf) {
    zum = ablauf;
    for (let i = 0; i < 80 && zum < heute; i++) zum = plusMonate(zum, 12);
    if (zum < heute) return null;
  }
  if (!zum) return null;
  const bis = frist != null ? fristBis(zum, frist) : null;
  if (bis == null || bis >= heute) return { zum, bis, verpasst: null, genannt: istGenannt };
  const naechster = plusMonate(zum, 12);
  return { zum: naechster, bis: fristBis(naechster, frist as number), verpasst: bis, genannt: false };
}

/** Kurzform für Aufrufer, die nur zum/bis brauchen. */
export function naechsteKuendigung(f: Felder, heute: string): { zum: string; bis: string | null } | null {
  const k = kuendigungsfenster(f, heute);
  return k ? { zum: k.zum, bis: k.bis } : null;
}

/** Gleicher Vertrag (Police und Nachtrag bzw. doppelt geschickt): Sparte, Versicherer und Nummer gleich. */
const schluessel = (v: VertragKurz) => {
  const nr = v.felder.versicherungsnummer?.w;
  const vers = v.felder.versicherer?.w;
  return typeof nr === "string" && typeof vers === "string" ? `${v.sparte}|${vers.toLowerCase()}|${nr}` : `id|${v.id}`;
};

const versichererVon = (v: VertragKurz) => (typeof v.felder.versicherer?.w === "string" ? v.felder.versicherer.w : null);
const rund = (n: number) => Math.round(n * 100) / 100;
const summeOderNull = (l: (number | null)[]) => (l.every((x) => x != null) ? rund(l.reduce<number>((s, x) => s + (x as number), 0)) : null);

// ─── Feste Vorlagen (eine Quelle für Vertragsseite und Terminvorbereitung) ──
// Sie-Form an den Vermittler, ohne Gedankenstriche, ohne Wertung („zu teuer“, „Lücke“, „sollte“ …).

export const euroText = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const datumLang = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
/** „30.11.“ im laufenden Jahr, sonst „31.01.2027“. */
const datumKurz = (t: string, heute: string) => (t.slice(0, 4) === heute.slice(0, 4) ? `${t.slice(8, 10)}.${t.slice(5, 7)}.` : datumLang(t));
const wer = (sparte: AuslesenSparte, versicherer: string | null) => `${SPARTE_LABEL[sparte]}${versicherer ? ` (${versicherer})` : ""}`;
// Geschütztes Leerzeichen: „noch 11 Tage“ bricht am Handy nicht zwischen Zahl und Wort um
const noch = (n: number) => (n <= 0 ? "heute letzter Tag" : n === 1 ? "noch 1\u00a0Tag" : `noch ${n}\u00a0Tage`);
const MAL: Record<number, string> = { 2: "zweimal", 3: "dreimal", 4: "viermal" };
const undListe = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} und ${l[l.length - 1]}`);

export const VORLAGEN = {
  kuendigungBis: (k: Kuendigung, heute: string) =>
    `${wer(k.sparte, k.versicherer)}: Kündigung bis ${datumKurz(k.bis as string, heute)}, ${noch(k.tageBis ?? 0)}.`,
  kuendigungVerpasst: (k: Kuendigung, heute: string) =>
    `${wer(k.sparte, k.versicherer)}: Frist ${datumKurz(k.verpasst as string, heute)} verpasst, nächste Kündigung bis ${datumLang(k.bis as string)}.`,
  kuendigungOhneFrist: (k: Kuendigung) =>
    `${wer(k.sparte, k.versicherer)}, ${k.genannt ? "kündbar zum" : "Ablauf"} ${datumLang(k.zum)}: Kündigungsfrist im Original prüfen.`,
  kfzOhneAblauf: (versicherer: string | null) => `${wer("kfz", versicherer)}: Hauptfälligkeit im Original prüfen.`,
  doppelt: (d: Doppelt) => {
    const teile = [d.versicherer.length ? undListe(d.versicherer) : "", d.monatSumme != null ? `zusammen ${euroText(d.monatSumme)} im Monat laut Unterlagen` : ""].filter(Boolean);
    const n = d.ids.length;
    return `${SPARTE_LABEL[d.sparte]} ${MAL[n] ?? `${n}-mal`}${teile.length ? ` (${teile.join(", ")})` : ""}: Werden ${n === 2 ? "beide" : "alle"} noch gebraucht?`;
  },
  baustein: (text: string, bewusst: boolean) => `${text} laut Unterlage: ${bewusst ? "Ist das bewusst so gewählt?" : "Ist das so gewollt?"}`,
  /** Zweite, leise Zeile einer Kündigungsfrage (SUS-Runde 20.11.2026: Frist zuerst, Beitrag laut Unterlage darunter) */
  beitragZusatz: (jahresbetrag: number) => `${euroText(jahresbetrag)} im Jahr laut Unterlage`,
  nichtGeschickt: (sparten: AuslesenSparte[]) => `Nicht geschickt: ${sparten.map((s) => SPARTE_LABEL[s]).join(", ")}. Fragen Sie: Wo sind Sie dafür versichert?`,
} as const;

export function zusammenfassung(vertraege: VertragKurz[], now: Date, o: ZusammenfassungOptionen = {}): Zusammenfassung {
  const heute = heuteBerlin(now);
  const grenze = plusTage(heute, KUENDIGUNG_FENSTER_TAGE);
  // Gleiche Police nur einmal (die zuerst gelistete)
  const gesehen = new Set<string>();
  const einzeln = vertraege.filter((v) => {
    const k = schluessel(v);
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });

  let summe = 0;
  let jahr = 0;
  let mitBetrag = 0;
  let ohneBetrag = 0;
  for (const v of einzeln) {
    const m = monatsbetrag(v.felder);
    const j = jahresbetrag(v.felder);
    if (m != null && j != null) {
      summe += m;
      jahr += j;
      mitBetrag++;
    } else if (v.felder.beitrag) ohneBetrag++;
  }

  const fragen: (Frage & { rang: number })[] = [];

  // Kündigungen (nur Sach)
  const kuendigungen: Kuendigung[] = [];
  for (const v of einzeln) {
    if (!KUENDIGUNG_SPARTEN.includes(v.sparte)) continue;
    const fe = kuendigungsfenster(v.felder, heute);
    const versicherer = versichererVon(v);
    if (beiEigenerGesellschaft(versicherer, o.eigeneGesellschaften)) continue;
    if (!fe) {
      if (v.sparte === "kfz") fragen.push({ typ: "kuendigung", text: VORLAGEN.kfzOhneAblauf(versicherer), ids: [v.id], tage: null, jahresbetrag: jahresbetrag(v.felder), rang: 3 });
      continue;
    }
    // Verpasst: die Verlängerung steht bevor (innerhalb der Frist), das ist ein Gesprächsaufhänger
    const stichtag = fe.bis ?? fe.zum;
    if (!fe.verpasst && (stichtag < heute || stichtag > grenze)) continue;
    const k: Kuendigung = {
      id: v.id,
      sparte: v.sparte,
      versicherer,
      zum: fe.zum,
      bis: fe.bis,
      jahresbetrag: jahresbetrag(v.felder),
      tageBis: fe.bis ? tageZwischen(heute, fe.bis) : null,
      verpasst: fe.verpasst,
      genannt: fe.genannt,
    };
    kuendigungen.push(k);
    const text = k.verpasst ? VORLAGEN.kuendigungVerpasst(k, heute) : k.bis ? VORLAGEN.kuendigungBis(k, heute) : VORLAGEN.kuendigungOhneFrist(k);
    // Reihenfolge: offene Fristen nach Tagen, dann ohne Frist (nach Tagen bis zum Termin), dann verpasste
    const rang = k.verpasst ? 2 : k.bis ? 0 : 1;
    fragen.push({ typ: "kuendigung", text, zusatz: k.jahresbetrag != null ? VORLAGEN.beitragZusatz(k.jahresbetrag) : undefined, ids: [k.id], tage: k.tageBis ?? tageZwischen(heute, k.zum), jahresbetrag: k.jahresbetrag, rang });
  }
  kuendigungen.sort((a, b) => (a.verpasst ? 1 : 0) - (b.verpasst ? 1 : 0) || (a.bis ?? a.zum).localeCompare(b.bis ?? b.zum));

  // Doppelt (nur Haftpflicht, Hausrat, Rechtsschutz; „Sonstige“ sind verschiedene Versicherungen)
  const doppelt: Doppelt[] = [];
  for (const sparte of DOPPELT_SPARTEN) {
    const l = einzeln.filter((v) => v.sparte === sparte);
    if (l.length < 2) continue;
    const d: Doppelt = {
      sparte,
      ids: l.map((v) => v.id),
      versicherer: [...new Set(l.map(versichererVon).filter((x): x is string => !!x))],
      monatSumme: summeOderNull(l.map((v) => monatsbetrag(v.felder))),
    };
    doppelt.push(d);
    fragen.push({ typ: "doppelt", text: VORLAGEN.doppelt(d), ids: d.ids, tage: null, jahresbetrag: summeOderNull(l.map((v) => jahresbetrag(v.felder))), rang: 10 });
  }

  // Bausteine (nur Sach, nur ausdrückliches „nein“)
  const bausteine: { id: string; text: string; bewusst: boolean }[] = [];
  const nein = (v: VertragKurz, k: string) => v.felder[k]?.w === false;
  for (const v of einzeln) {
    const l = SPARTE_LABEL[v.sparte];
    if (v.sparte === "haftpflicht") {
      if (nein(v, "forderungsausfall")) bausteine.push({ id: v.id, text: `${l} ohne Forderungsausfall`, bewusst: true });
      if (nein(v, "schluesselverlust")) bausteine.push({ id: v.id, text: `${l} ohne Schlüsselverlust`, bewusst: true });
    }
    if (v.sparte === "hausrat") {
      if (nein(v, "elementar")) bausteine.push({ id: v.id, text: `${l} ohne Elementarschäden`, bewusst: false });
      if (nein(v, "unterversicherungsverzicht")) bausteine.push({ id: v.id, text: `${l} ohne Unterversicherungsverzicht`, bewusst: false });
    }
    if (v.sparte === "wohngebaeude" && nein(v, "elementar")) bausteine.push({ id: v.id, text: `${l} ohne Elementarschäden`, bewusst: false });
  }
  const jahrVon = new Map(einzeln.map((v) => [v.id, jahresbetrag(v.felder)]));
  for (const b of bausteine) fragen.push({ typ: "baustein", text: VORLAGEN.baustein(b.text, b.bewusst), ids: [b.id], tage: null, jahresbetrag: jahrVon.get(b.id) ?? null, rang: 20 });

  // Nicht geschickt: nur wenn sicher (mindestens ein Auszug, jede Unterlage mit Sparte, nicht „ohne KI“)
  const geschickt = new Set<AuslesenSparte>([...(o.unterlagenSparten ?? []), ...einzeln.map((v) => v.sparte)]);
  const nichtGeschickt = o.ohneKi || !einzeln.length || (o.unterlagenOhneSparte ?? 0) > 0 ? [] : NICHT_GESCHICKT_SPARTEN.filter((s) => !geschickt.has(s));
  if (nichtGeschickt.length) fragen.push({ typ: "nicht_geschickt", text: VORLAGEN.nichtGeschickt(nichtGeschickt), ids: [], tage: null, jahresbetrag: null, rang: 30 });

  fragen.sort((a, b) => a.rang - b.rang || (a.tage ?? Infinity) - (b.tage ?? Infinity) || (b.jahresbetrag ?? -1) - (a.jahresbetrag ?? -1));

  return {
    vertraege: einzeln.length,
    monatSumme: mitBetrag ? rund(summe) : null,
    jahrSumme: mitBetrag ? rund(jahr) : null,
    ohneBetrag,
    ungeprueft: einzeln.filter((v) => !v.geprueft).length,
    kuendigungen,
    doppelt,
    bausteine: bausteine.map(({ id, text }) => ({ id, text })),
    nichtGeschickt,
    fragen: fragen.map(({ rang: _rang, ...f }) => f),
  };
}
