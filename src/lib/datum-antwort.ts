// Datumsangaben aus freien Chat-Antworten von Leads lesen (Ole, 19.11.2026). Rein, ohne Datenbank, testbar; „heute“
// immer in Berlin.
//   - Ablauf eines bestehenden Vertrags („Bis wann läuft die Versicherung ungefähr? Monat und Jahr reichen, zum Beispiel
//     03/2027.“, lib/whatsapp/tier-fragen.ts): ablaufLesen, ablaufBeispiel
//   - Geburtsdatum des Leads mit Plausibilität (18 bis 100 Jahre, nicht in der Zukunft): geburtsdatumPruefen

const MONATE: Record<string, number> = {
  januar: 1, jänner: 1, jaenner: 1, jan: 1,
  februar: 2, feber: 2, feb: 2,
  märz: 3, maerz: 3, marz: 3, mär: 3, mrz: 3,
  april: 4, apr: 4,
  mai: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  dezember: 12, dez: 12,
};

export const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;

const WORT = "[a-zäöüß]+";

/** Monat aus einem Wort („März“, „mär.“, „Sept“); null = kein Monat. */
export function monatAusWort(wort: string): number | null {
  return MONATE[wort.toLowerCase().replace(/\.$/, "")] ?? null;
}

/** Jahr, Monat und Tag heute in Berlin. */
export function berlinHeute(jetzt: Date): { jahr: number; monat: number; tag: number } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(jetzt);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { jahr: n("year"), monat: n("month"), tag: n("day") };
}

export type MonatJahr = { monat: number; jahr: number };

const plus = (mj: MonatJahr, n: number): MonatJahr => {
  const i = mj.jahr * 12 + (mj.monat - 1) + n;
  return { jahr: Math.floor(i / 12), monat: (i % 12) + 1 };
};

/** „03/2027“ */
export const mmJjjj = (mj: MonatJahr) => `${String(mj.monat).padStart(2, "0")}/${mj.jahr}`;
/** „März 2027“ */
export const monatJahrText = (mj: MonatJahr) => `${MONATSNAMEN[mj.monat - 1]} ${mj.jahr}`;

/** Beispiel für die Ablauffrage: Monat in etwa 4 Monaten ab heute (Berlin), „03/2027“. */
export function ablaufBeispiel(jetzt: Date = new Date()): string {
  const h = berlinHeute(jetzt);
  return mmJjjj(plus({ monat: h.monat, jahr: h.jahr }, 4));
}

/** „weiß nicht“, „keine Ahnung“, „weiß ich nicht genau“, „k.A.“, „muss ich nachschauen“ … */
export const WEISS_NICHT_RE =
  /\b(wei(ß|ss) (ich )?(es )?nicht|wei(ß|ss) nicht|keine ahnung|k\.? ?a\.?(?=$|[\s,.!])|kein plan|nicht sicher|unsicher|kann ich (gerade |jetzt )?nicht sagen|(muss|m(ü|u)sste) ich (erst )?(nach(schauen|sehen|gucken)|schauen|gucken)|keine angabe)/i;

const ZAHLWORT: Record<string, number> = { einem: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, "zwölf": 12, zwoelf: 12 };

const jahr2 = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Ablauf eines Vertrags aus einer freien Antwort: Monat und Jahr. „03/2027“, „03/27“, „3/27“, „3.2027“, „03.2027“,
 * „15.03.2027“, „März 2027“, „Mär 27“, „Anfang nächsten Jahres“ (Januar nächstes Jahr), „Ende des Jahres“/„Jahresende“
 * (Dezember dieses Jahres), „nächsten Monat“, „in 3 Monaten“, nur der Monat („März“, „im März“: nächstes Vorkommen, der
 * laufende Monat zählt als dieses Jahr). "weiss_nicht" = Lead weiß es nicht (nicht nachfragen); null = nicht erkannt.
 */
export function ablaufLesen(text: string | null | undefined, jetzt: Date = new Date()): MonatJahr | "weiss_nicht" | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const h = berlinHeute(jetzt);
  const heute: MonatJahr = { monat: h.monat, jahr: h.jahr };
  const ok = (mj: MonatJahr | null): MonatJahr | null =>
    mj && mj.monat >= 1 && mj.monat <= 12 && mj.jahr >= h.jahr - 1 && mj.jahr <= h.jahr + 15 ? mj : null;
  const naechstes = (monat: number): MonatJahr => ({ monat, jahr: monat >= h.monat ? h.jahr : h.jahr + 1 });

  // Zahlen: 15.03.2027 | 2027-03 | 03/2027, 03/27, 3/27, 3.2027, 03.2027, 3-27
  let m = /\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/.exec(t);
  if (m) return ok({ monat: Number(m[2]), jahr: jahr2(m[3]) });
  m = /\b(20\d{2})[-/](\d{1,2})\b/.exec(t);
  if (m) return ok({ monat: Number(m[2]), jahr: Number(m[1]) });
  m = /\b(\d{1,2}) ?[/.-] ?(\d{4}|\d{2})\b/.exec(t);
  if (m) {
    const r = ok({ monat: Number(m[1]), jahr: jahr2(m[2]) });
    if (r) return r;
  }

  // Monat als Wort, mit Jahr („März 2027“, „Mär 27“, „märz '27“) oder ohne (nächstes Vorkommen)
  for (const w of t.matchAll(new RegExp(`(${WORT})\\.?(?: ?'? ?(\\d{4}|\\d{2})\\b)?`, "g"))) {
    const monat = monatAusWort(w[1]);
    if (!monat) continue;
    if (w[2]) return ok({ monat, jahr: jahr2(w[2]) });
    const jahr = /\b(20\d{2})\b/.exec(t)?.[1];
    if (jahr) return ok({ monat, jahr: Number(jahr) });
    if (/\b(n(ä|ae)chste[nms]?|kommende[nms]?) jahr/.test(t)) return ok({ monat, jahr: h.jahr + 1 });
    return naechstes(monat);
  }

  // Anfang, Mitte, Ende eines Jahres
  const naechstesJahr = /(n(ä|ae)chste[nms]?|kommende[nms]?) jahr/;
  const lage = (w: string) => (/anfang/.test(w) ? 1 : /mitte/.test(w) ? 6 : 12);
  m = /\b(anfang|mitte|ende)\b[^\d]{0,12}\b(20\d{2})\b/.exec(t);
  if (m) return ok({ monat: lage(m[1]), jahr: Number(m[2]) });
  m = new RegExp(`\\b(anfang|mitte|ende)( des| dieses)?( ${naechstesJahr.source})`).exec(t);
  if (m) return ok({ monat: lage(m[1]), jahr: h.jahr + 1 });
  if (/jahresanfang|anfang (des |dieses )?jahr/.test(t)) return naechstes(1);
  if (/jahresende|jahreswechsel|silvester|ende (des |dieses )?jahr/.test(t)) return { monat: 12, jahr: h.jahr };
  if (/jahresmitte|mitte (des |dieses )?jahr/.test(t)) return naechstes(6);

  // Monate relativ
  if (/(ü|ue)bern(ä|ae)chste[nms]? monat/.test(t)) return plus(heute, 2);
  if (/(n(ä|ae)chste[nms]?|kommende[nms]?) monat/.test(t)) return plus(heute, 1);
  if (/(diese[nms]?|laufende[nms]?) monat|ende (des )?monats|monatsende/.test(t)) return heute;
  m = /\bin (\d{1,2}|einem|einen|zwei|drei|vier|f(ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(ö|oe)lf) monat/.exec(t);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ZAHLWORT[m[1]];
    if (n) return plus(heute, n);
  }

  if (WEISS_NICHT_RE.test(t)) return "weiss_nicht";
  return null;
}

export type GeburtPruefung =
  | { art: "ok"; datum: string; alter: number }
  | { art: "minderjaehrig"; datum: string; alter: number; jahr: number }
  | { art: "unplausibel"; datum: string }
  | { art: "unbekannt" }
  | { art: "unlesbar" };

/** Geburtsdatum der Person: mindestens 18, höchstens 100 Jahre, nicht in der Zukunft. */
export const GEBURT_MIN_ALTER = 18;
export const GEBURT_MAX_ALTER = 100;

/** Datum aus einer Antwort: „14.05.1985“, „14.5.85“, „1985-05-14“, „14. Mai 1985“; null = keins erkannt. */
export function datumLesen(text: string | null | undefined, jetzt: Date = new Date()): { tag: number; monat: number; jahr: number } | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const h = berlinHeute(jetzt);
  const jahr = (y: string) => (y.length === 4 ? Number(y) : Number(y) > h.jahr % 100 ? 1900 + Number(y) : 2000 + Number(y));
  let d: { tag: number; monat: number; jahr: number } | null = null;
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) d = { jahr: Number(m[1]), monat: Number(m[2]), tag: Number(m[3]) };
  if (!d && (m = /\b(\d{1,2}) ?[./-] ?(\d{1,2}) ?[./-] ?(\d{4}|\d{2})\b/.exec(t))) d = { tag: Number(m[1]), monat: Number(m[2]), jahr: jahr(m[3]) };
  if (!d && (m = new RegExp(`\\b(\\d{1,2})\\.? ?(${WORT})\\.? ?(\\d{4}|\\d{2})\\b`).exec(t))) {
    const monat = monatAusWort(m[2]);
    if (monat) d = { tag: Number(m[1]), monat, jahr: jahr(m[3]) };
  }
  if (!d) return null;
  const x = new Date(Date.UTC(d.jahr, d.monat - 1, d.tag));
  return x.getUTCFullYear() === d.jahr && x.getUTCMonth() === d.monat - 1 && x.getUTCDate() === d.tag ? d : null;
}

/** Alter in vollen Jahren an einem Tag (Berlin). */
function alterAm(d: { tag: number; monat: number; jahr: number }, h: { tag: number; monat: number; jahr: number }): number {
  return h.jahr - d.jahr - (h.monat < d.monat || (h.monat === d.monat && h.tag < d.tag) ? 1 : 0);
}

const KEINE_ANGABE_RE = /^(offen|keine angabe|möchte ich nicht|moechte ich nicht|lieber nicht|sag ich nicht|nicht angeben)\b/i;

/**
 * Antwort auf die Frage nach dem eigenen Geburtsdatum prüfen. ok: 18 bis 100 Jahre; minderjaehrig: unter 18 (z. B. das
 * Geburtsdatum des Tieres oder eines Kindes); unplausibel: in der Zukunft oder über 100 (Tippfehler wie 1.1.2090);
 * unbekannt: „weiß nicht“, keine Angabe; unlesbar: kein Datum erkannt. datum immer „TT.MM.JJJJ“.
 */
export function geburtsdatumPruefen(text: string | null | undefined, jetzt: Date = new Date()): GeburtPruefung {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const d = datumLesen(t, jetzt);
  if (!d) return !t || WEISS_NICHT_RE.test(t) || KEINE_ANGABE_RE.test(t) ? { art: "unbekannt" } : { art: "unlesbar" };
  const datum = `${String(d.tag).padStart(2, "0")}.${String(d.monat).padStart(2, "0")}.${d.jahr}`;
  const h = berlinHeute(jetzt);
  const zukunft = d.jahr * 10000 + d.monat * 100 + d.tag > h.jahr * 10000 + h.monat * 100 + h.tag;
  const alter = alterAm(d, h);
  if (zukunft || alter > GEBURT_MAX_ALTER) return { art: "unplausibel", datum };
  if (alter < GEBURT_MIN_ALTER) return { art: "minderjaehrig", datum, alter, jahr: d.jahr };
  return { art: "ok", datum, alter };
}
