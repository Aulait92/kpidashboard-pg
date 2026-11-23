// Datumsangaben aus freien Chat-Antworten von Leads lesen (Ole, 19.11.2026). Rein, ohne Datenbank, testbar; „heute“
// immer in Berlin.
//   - Ablauf eines bestehenden Vertrags („Bis wann läuft die Versicherung ungefähr? Monat und Jahr reichen, zum Beispiel
//     03/2027.“, lib/whatsapp/tier-fragen.ts): ablaufLesen, ablaufBeispiel
//   - Geburtsdatum des Leads mit Plausibilität (18 bis 110 Jahre, nicht in der Zukunft): geburtsdatumPruefen
//   - Antwort auf eine Datumsfrage einordnen, mit Vorschlag bei Tippfehlern (Ole, 21.11.2026: „220.8.92“ wurde ungeprüft
//     übernommen): datumBefund, datumVorschlaege (die Nachfrage selbst: lib/whatsapp/datum-nachfrage.ts)

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

/** Geburtsdatum der Person: mindestens 18, höchstens 110 Jahre (Ole, 21.11.2026), nicht in der Zukunft. */
export const GEBURT_MIN_ALTER = 18;
export const GEBURT_MAX_ALTER = 110;
/** Geburt eines Tieres: höchstens 40 Jahre (Pferde), nicht in der Zukunft. */
export const TIER_MAX_ALTER = 40;

type Tmj = { tag: number; monat: number; jahr: number };

/** Zweistelliges Jahr: 19xx, wenn es sonst in der Zukunft läge, sonst 20xx („92“ → 1992, „19“ → 2019). */
const jahrVoll = (y: string, h: { jahr: number }) => (y.length === 4 ? Number(y) : Number(y) > h.jahr % 100 ? 1900 + Number(y) : 2000 + Number(y));

/** Gibt es den Tag im Kalender (31.02. nicht)? */
const gibtEs = (d: Tmj) => {
  const x = new Date(Date.UTC(d.jahr, d.monat - 1, d.tag));
  return d.jahr >= 1000 && x.getUTCFullYear() === d.jahr && x.getUTCMonth() === d.monat - 1 && x.getUTCDate() === d.tag;
};

/** „TT.MM.JJJJ“ */
export const ttMmJjjj = (d: Tmj) => `${String(d.tag).padStart(2, "0")}.${String(d.monat).padStart(2, "0")}.${d.jahr}`;

/**
 * Datum aus einer Antwort: „14.05.1985“, „14.5.85“, „14/05/1985“, „14 05 1985“, „1985-05-14“, „14. Mai 1985“,
 * „14051985“, „140585“; null = keins erkannt.
 */
export function datumLesen(text: string | null | undefined, jetzt: Date = new Date()): Tmj | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const h = berlinHeute(jetzt);
  const jahr = (y: string) => jahrVoll(y, h);
  let d: Tmj | null = null;
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m) d = { jahr: Number(m[1]), monat: Number(m[2]), tag: Number(m[3]) };
  if (!d && (m = /\b(\d{1,2})(?: ?[./-] ?| )(\d{1,2})(?: ?[./-] ?| )(\d{4}|\d{2})\b/.exec(t))) d = { tag: Number(m[1]), monat: Number(m[2]), jahr: jahr(m[3]) };
  if (!d && (m = new RegExp(`\\b(\\d{1,2})\\.? ?(${WORT})\\.? ?(\\d{4}|\\d{2})\\b`).exec(t))) {
    const monat = monatAusWort(m[2]);
    if (monat) d = { tag: Number(m[1]), monat, jahr: jahr(m[3]) };
  }
  // ohne Trennzeichen, nur die Zahl: „22081992“ bzw. „220892“
  if (!d && (m = /^(\d{2})(\d{2})(\d{4}|\d{2})\.?$/.exec(t))) d = { tag: Number(m[1]), monat: Number(m[2]), jahr: jahr(m[3]) };
  if (!d) return null;
  return gibtEs(d) ? d : null;
}

/** Alter in vollen Jahren an einem Tag (Berlin). */
function alterAm(d: Tmj, h: Tmj): number {
  return h.jahr - d.jahr - (h.monat < d.monat || (h.monat === d.monat && h.tag < d.tag) ? 1 : 0);
}

const KEINE_ANGABE_RE = /^(offen|keine angabe|möchte ich nicht|moechte ich nicht|lieber nicht|sag ich nicht|nicht angeben)\b/i;

/**
 * Antwort auf die Frage nach dem eigenen Geburtsdatum prüfen. ok: 18 bis 110 Jahre; minderjaehrig: unter 18 (z. B. das
 * Geburtsdatum des Tieres oder eines Kindes); unplausibel: in der Zukunft oder über 110 (Tippfehler wie 1.1.2090);
 * unbekannt: „weiß nicht“, keine Angabe; unlesbar: kein Datum erkannt. datum immer „TT.MM.JJJJ“.
 */
export function geburtsdatumPruefen(text: string | null | undefined, jetzt: Date = new Date()): GeburtPruefung {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const d = datumLesen(t, jetzt);
  if (!d) return !t || WEISS_NICHT_RE.test(t) || KEINE_ANGABE_RE.test(t) ? { art: "unbekannt" } : { art: "unlesbar" };
  const datum = ttMmJjjj(d);
  const h = berlinHeute(jetzt);
  const zukunft = d.jahr * 10000 + d.monat * 100 + d.tag > h.jahr * 10000 + h.monat * 100 + h.tag;
  const alter = alterAm(d, h);
  if (zukunft || alter > GEBURT_MAX_ALTER) return { art: "unplausibel", datum };
  if (alter < GEBURT_MIN_ALTER) return { art: "minderjaehrig", datum, alter, jahr: d.jahr };
  return { art: "ok", datum, alter };
}

// ─── Antwort auf eine Datumsfrage einordnen (Ole, 21.11.2026) ─────────────────────────────────────────────────────────
// Nachgefragt wird nur, wenn der Lead eine Zahl geschrieben hat, die kein gültiges, plausibles Datum ergibt. Antworten ohne
// Zahl („weiß nicht“, „Welpe“, „letzten Sommer“) und Altersangaben („5 Jahre“) bleiben beim bisherigen Ablauf.

/** Welche Datumsfrage: eigenes Geburtsdatum, Geburt des Tieres (das Jahr reicht), Ablauf eines Vertrags (Monat und Jahr). */
export type DatumArt = "geburt" | "geburtTier" | "ablauf";

export type DatumBefund =
  /** gültig und plausibel; wert normalisiert (Geburtsdatum „TT.MM.JJJJ“, Tier auch „MM/JJJJ“ bzw. „JJJJ“, Ablauf „MM/JJJJ“) */
  | { art: "ok"; wert: string }
  /** eigenes Geburtsdatum unter 18 (meist das des Tieres oder eines Kindes): bisheriger Ablauf (geburt-chat.ts, tier-fragen.ts) */
  | { art: "jung"; wert: string }
  /** kein Datumsversuch (keine Zahl, „weiß nicht“, Altersangabe): bisheriger Ablauf */
  | { art: "frei" }
  /** Tippfehler mit eindeutiger Korrektur: ein oder zwei Vorschläge */
  | { art: "vorschlag"; vorschlaege: string[] }
  /** Datum erkannt, aber in der Zukunft bzw. zu alt */
  | { art: "unplausibel"; wert: string }
  /** Zahl, aber kein Datum */
  | { art: "unlesbar" };

/** Ist d ein plausibles Datum für die Frage? (nicht in der Zukunft, Alter 0 bis 110 bzw. bei Tieren 0 bis 40 Jahre) */
function plausibel(d: Tmj, art: DatumArt, h: Tmj): boolean {
  if (!gibtEs(d)) return false;
  if (art === "ablauf") return d.jahr >= h.jahr - 1 && d.jahr <= h.jahr + 15;
  const zukunft = d.jahr * 10000 + d.monat * 100 + d.tag > h.jahr * 10000 + h.monat * 100 + h.tag;
  return !zukunft && alterAm(d, h) <= (art === "geburtTier" ? TIER_MAX_ALTER : GEBURT_MAX_ALTER);
}

/** Alle Fassungen einer Zahl ohne eine ihrer Ziffern („220“ → „22“, „20“), von hinten nach vorn, ohne Doppelte. */
function ohneEineZiffer(z: string): string[] {
  const out: string[] = [];
  for (let i = z.length - 1; i >= 0; i--) {
    const x = z.slice(0, i) + z.slice(i + 1);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

/**
 * Vorschläge bei einem Tippfehler (höchstens zwei, sonst keiner): genau ein Teil hat eine Ziffer zu viel
 * („220.8.92“ → 22.08.1992 oder 20.08.1992, „22.088.1992“ → 22.08.1992, „22.08.19992“ → 22.08.1999 oder 22.08.1992)
 * bzw. Tag und Monat vertauscht („08.22.1992“ → 22.08.1992). Beim Tier auch nur das Jahr („20199“ → 2019).
 * Jeder Vorschlag muss ein plausibles Datum für die Frage ergeben.
 */
export function datumVorschlaege(text: string | null | undefined, art: DatumArt, jetzt: Date = new Date()): string[] {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const h = berlinHeute(jetzt);
  const out: string[] = [];
  const dazu = (d: Tmj) => {
    if (plausibel(d, art, h) && !out.includes(ttMmJjjj(d))) out.push(ttMmJjjj(d));
  };
  const m = /(?:^|\D)(\d{1,3}) ?[./-] ?(\d{1,3}) ?[./-] ?(\d{2,5})(?!\d)/.exec(t);
  if (m) {
    const [tag, monat, jahr] = [m[1], m[2], m[3]];
    const zuLang = [tag.length > 2, monat.length > 2, jahr.length === 3 || jahr.length > 4];
    if (zuLang.filter(Boolean).length === 1) {
      if (zuLang[0]) for (const x of ohneEineZiffer(tag)) dazu({ tag: Number(x), monat: Number(monat), jahr: jahrVoll(jahr, h) });
      if (zuLang[1]) for (const x of ohneEineZiffer(monat)) dazu({ tag: Number(tag), monat: Number(x), jahr: jahrVoll(jahr, h) });
      if (zuLang[2]) for (const x of ohneEineZiffer(jahr)) dazu({ tag: Number(tag), monat: Number(monat), jahr: jahrVoll(x, h) });
    } else if (!zuLang.some(Boolean) && Number(monat) > 12 && Number(tag) <= 12) {
      dazu({ tag: Number(monat), monat: Number(tag), jahr: jahrVoll(jahr, h) });
    }
  } else if (art === "geburtTier") {
    const j = /^\D*(\d{5})\D*$/.exec(t);
    if (j) {
      for (const x of ohneEineZiffer(j[1])) {
        const y = Number(x);
        if (!x.startsWith("0") && y >= h.jahr - TIER_MAX_ALTER && y <= h.jahr && !out.includes(x)) out.push(x);
      }
    }
  }
  return out.length <= 2 ? out : [];
}

/** Altersangabe statt Datum („5 Jahre“, „8 Monate alt“, „zweijährig“). */
const ALTER_RE = /\d+\s*(jahr|j\b|monat|mon\b|woche|wo\b|tag)|\balt\b|jährig|jaehrig/i;

/**
 * Antwort auf eine Datumsfrage einordnen (rein). Nur eine Zahl, die kein gültiges, plausibles Datum ergibt, führt zu
 * vorschlag, unplausibel bzw. unlesbar; alles ohne Zahl ist „frei“ (bisheriger Ablauf).
 */
export function datumBefund(text: string | null | undefined, art: DatumArt, jetzt: Date = new Date()): DatumBefund {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t || !/\d/.test(t) || WEISS_NICHT_RE.test(t) || KEINE_ANGABE_RE.test(t)) return { art: "frei" };
  const h = berlinHeute(jetzt);
  const fehler = (): DatumBefund => {
    const v = datumVorschlaege(t, art, jetzt);
    return v.length ? { art: "vorschlag", vorschlaege: v } : { art: "unlesbar" };
  };

  if (art === "ablauf") {
    const ab = ablaufLesen(t, jetzt);
    if (ab === "weiss_nicht") return { art: "frei" };
    return ab ? { art: "ok", wert: mmJjjj(ab) } : fehler();
  }

  if (art === "geburt") {
    const p = geburtsdatumPruefen(t, jetzt);
    if (p.art === "ok") return { art: "ok", wert: p.datum };
    if (p.art === "minderjaehrig") return { art: "jung", wert: p.datum };
    if (p.art === "unplausibel") return { art: "unplausibel", wert: p.datum };
    return fehler();
  }

  // Geburt des Tieres: ganzes Datum, Monat und Jahr, nur das Jahr oder eine Altersangabe. Nur reine Zahlen werden
  // normalisiert, Text mit Datum („ca. März 2019“) bleibt wörtlich.
  const nurZahl = /^[\d\s./-]+$/.test(t);
  const d = datumLesen(t, jetzt);
  if (d) return plausibel(d, art, h) ? { art: "ok", wert: nurZahl ? ttMmJjjj(d) : t } : { art: "unplausibel", wert: ttMmJjjj(d) };
  const v = datumVorschlaege(t, art, jetzt);
  if (v.length) return { art: "vorschlag", vorschlaege: v };
  const lc = t.toLowerCase();
  let mj: MonatJahr | null = null;
  const zahl = /\b(\d{1,2}) ?[./-] ?(\d{4}|\d{2})\b/.exec(lc);
  if (zahl && Number(zahl[1]) >= 1 && Number(zahl[1]) <= 12) mj = { monat: Number(zahl[1]), jahr: jahrVoll(zahl[2], h) };
  if (!mj) {
    for (const w of lc.matchAll(new RegExp(`(${WORT})\\.? ?'? ?(\\d{4}|\\d{2})\\b`, "g"))) {
      const monat = monatAusWort(w[1]);
      if (monat) {
        mj = { monat, jahr: jahrVoll(w[2], h) };
        break;
      }
    }
  }
  if (mj) {
    const ok = plausibel({ tag: 1, ...mj }, art, h);
    return ok ? { art: "ok", wert: nurZahl ? mmJjjj(mj) : t } : { art: "unplausibel", wert: mmJjjj(mj) };
  }
  if (ALTER_RE.test(t)) return { art: "frei" };
  const jahre = [...t.matchAll(/\b(\d{4})\b/g)].map((x) => Number(x[1]));
  if (jahre.length === 1) {
    const y = jahre[0];
    return y >= h.jahr - TIER_MAX_ALTER && y <= h.jahr ? { art: "ok", wert: nurZahl ? String(y) : t } : { art: "unplausibel", wert: String(y) };
  }
  // eine bloße Zahl mit höchstens 2 Stellen ist eine Altersangabe („3“, „ca. 5“)
  if (/^\D*\d{1,2}\D*$/.test(t)) return { art: "frei" };
  return { art: "unlesbar" };
}
