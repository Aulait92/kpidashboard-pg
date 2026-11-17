// Cross-Selling im Termin (Ole, 16.11.2026, Teil A2, A7, A10): „Ihr Schutz im Überblick“ als Ampel mit 4 Zuständen je
// Sparte (bei uns, woanders, prüfen, Lücke) und „Chance im Termin“ mit höchstens 2 erkannten Lücken samt Gesprächsöffner.
// Grundsatz: Bedarf entdecken, nicht verkaufen. Nie Gesundheitsangaben. Seit 17.11.2026 (Ole: Cross-Selling nach dem
// Komplettcheck, auch BU und PKV) stehen alle Sparten des Tarifkatalogs im Überblick, sobald der Vermittler sie
// hinzufügt oder ein Vertrag bei uns sie belegt; automatische Lücken-Vorschläge bleiben bei Sach, Haftpflicht,
// Rechtsschutz, Unfall und Tier (große Produkte nur als Vorsorge-Thema).
//
// Reine Funktionen (Terminvorbereitung im Browser, Präsentation, Demo). Vorschlag aus Formular, Chat und Verträgen:
// schutzVorschlag; gespeichert wird er mit der Tarifauswahl (Appointment.tarifauswahl.schutz), danach entscheidet der
// Vermittler.

import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

export type SchutzStatus = "bei-uns" | "woanders" | "pruefen" | "luecke";

export const SCHUTZ_STATUS: Record<SchutzStatus, { label: string; kurz: string; farbe: string }> = {
  "bei-uns": { label: "Bei uns versichert", kurz: "Bei uns", farbe: "#16a34a" },
  woanders: { label: "Woanders versichert", kurz: "Woanders", farbe: "#2563eb" },
  pruefen: { label: "Prüfen", kurz: "Prüfen", farbe: "#d97706" },
  luecke: { label: "Lücke", kurz: "Lücke", farbe: "#dc2626" },
};
export const SCHUTZ_REIHENFOLGE: SchutzStatus[] = ["bei-uns", "woanders", "pruefen", "luecke"];

/** Eine Sparte im Überblick, wie in der Terminvorbereitung erfasst (Tarifauswahl.schutz). */
export type SchutzEintrag = {
  /** Sparte im Tarifkatalog (haftpflicht, hausrat, …) */
  key: string;
  label: string;
  status: SchutzStatus;
  /** „Woanders“: was der Kunde hat und wo (ohne Beratung, A7) */
  versicherer?: string | null;
  /** ungefährer Beitrag im Monat */
  beitrag?: number | null;
  /** Ablauf bzw. Hauptfälligkeit, „2027-03“ */
  ablauf?: string | null;
  /** Gesprächsöffner (ein Satz, Ansprache des Kunden) */
  oeffner?: string | null;
  /** Vertrag schon bei uns, z. B. „seit 03/2026“ */
  seit?: string | null;
};

/** Zeile der Folie „Ihr Schutz im Überblick“ (liegt mit den Angeboten in offersJson). */
export type SchutzZeile = { key: string; label: string; status: SchutzStatus; info: string | null; versicherer: string | null };

/** Höchstens so viele Zeilen auf der Folie (gemessen: 6 Zeilen plus Kombi-Zeile passen über die Fußzeile). */
export const SCHUTZ_MAX = 6;
/** Höchstens so viele Chancen in der Terminvorbereitung (Teil A2) */
export const CHANCEN_MAX = 2;

/** Sparten des Überblicks mit Bezeichnung (nur Sach, Haftpflicht, Rechtsschutz, Unfall, Tier). */
export const SCHUTZ_SPARTEN: Record<string, string> = {
  haftpflicht: "Privathaftpflicht",
  hausrat: "Hausrat",
  rechtsschutz: "Rechtsschutz",
  unfall: "Unfall",
  wohngebaeude: "Wohngebäude",
  "tierhalter-hund": "Hundehalterhaftpflicht",
  "tierhalter-pferd": "Pferdehalterhaftpflicht",
  "katze-kranken": "Katzenkranken",
  "katze-op": "Katzen-OP",
  "hund-kranken": "Hundekranken",
  "hund-op": "Hunde-OP",
  "pferd-op": "Pferde-OP",
  "pferd-kranken": "Pferdekranken",
  // Alle Versicherungsprodukte (Ole, 17.11.2026): erscheinen, wenn der Vermittler sie hinzufügt bzw. ein Vertrag sie belegt
  bu: "Berufsunfähigkeit",
  risikoleben: "Risikoleben",
  grundfaehigkeit: "Grundfähigkeit",
  pkv: "Private Krankenversicherung",
  zahnzusatz: "Zahnzusatz",
  krankenhauszusatz: "Krankenhauszusatz",
  ambulant: "Ambulante Zusatz",
  pflegezusatz: "Pflegezusatz",
  rente: "Private Rente",
  basisrente: "Basisrente",
  kfz: "Kfz",
  "reise-kranken": "Auslandsreisekranken",
  sterbegeld: "Sterbegeld",
  dienstunfaehigkeit: "Dienstunfähigkeit",
  krankentagegeld: "Krankentagegeld",
  kinderinvaliditaet: "Kinderinvalidität",
  reiseruecktritt: "Reiserücktritt",
};

/**
 * Gewicht als Chance (Teil A10): typische Lückenquote (GDV 2026: Rechtsschutz und Unfall deutlich seltener vorhanden als
 * Haftpflicht und Hausrat), Pflicht und Eigentum vorn.
 */
const GEWICHT: Record<string, number> = {
  "tierhalter-hund": 100,
  "tierhalter-pferd": 95,
  wohngebaeude: 80,
  rechtsschutz: 60,
  unfall: 55,
  hausrat: 40,
  haftpflicht: 35,
  "katze-kranken": 30,
  "hund-kranken": 30,
  "katze-op": 30,
  "hund-op": 30,
  "pferd-op": 30,
  "pferd-kranken": 25,
};
export const gewichtVon = (key: string) => GEWICHT[key] ?? 10;

// ─── Hundehaftpflicht: Pflicht je Bundesland aus der PLZ ─────────────────────────────────────

/** Länder mit allgemeiner Pflicht zur Hundehaftpflicht (Teil A10): BE, HB, HH, NI, ST, SH, TH. */
const PFLICHT_LAENDER: Record<string, string> = { BE: "Berlin", HB: "Bremen", HH: "Hamburg", NI: "Niedersachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };

/**
 * Nur eindeutige PLZ-Bereiche (Präfixe); an Landesgrenzen, wo ein Bereich zwei Ländern gehört, bewusst keine Angabe,
 * dann heißt es neutral „in einigen Bundesländern Pflicht“.
 */
const PLZ_LAND: [string, string][] = [
  ...["100", "101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113", "114", "115", "116", "117", "118", "119", "120", "121", "122", "123", "124", "125", "126", "127", "128", "129", "130", "131", "132", "133", "134", "135", "136", "137", "138", "139", "140", "141"].map((p): [string, string] => [p, "BE"]),
  ...["200", "201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "220", "221", "222", "223", "224", "225", "226", "227"].map((p): [string, string] => [p, "HH"]),
  ...["281", "282", "283", "284", "285", "286", "287", "2756", "2757", "2758"].map((p): [string, string] => [p, "HB"]),
  ...["228", "229", "230", "231", "232", "233", "234", "235", "236", "237", "238", "24", "25"].map((p): [string, string] => [p, "SH"]),
  ...["212", "213", "216", "217", "218", "219", "26", "270", "271", "272", "273", "274", "276", "277", "278", "279", "288", "289", "29", "30", "31", "380", "381", "382", "383", "384", "385", "49"].map((p): [string, string] => [p, "NI"]),
  ...["060", "061", "062", "063", "064", "388", "389", "39"].map((p): [string, string] => [p, "ST"]),
  ...["070", "071", "072", "073", "074", "075", "076", "077", "98", "99"].map((p): [string, string] => [p, "TH"]),
];

/** Bundesland mit Pflicht zur Hundehaftpflicht aus einer PLZ (bzw. Adresse mit PLZ); null = keine bzw. unklar. */
export function hundePflichtLand(text: string | null | undefined): string | null {
  const plz = (text ?? "").match(/\b(\d{5})\b/)?.[1];
  if (!plz) return null;
  const treffer = PLZ_LAND.filter(([p]) => plz.startsWith(p)).sort((x, y) => y[0].length - x[0].length)[0];
  return treffer ? PFLICHT_LAENDER[treffer[1]] : null;
}

// ─── Vorschlag aus Formular, Chat und Verträgen ──────────────────────────────────────────────

const angabenVon = (d: VorbereitungDaten) => Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
const formWert = (d: VorbereitungDaten, re: RegExp) => d.formular.find((f) => re.test(f.label))?.value?.trim() || null;

/** Sparte(n), die in einem Text vorkommen („alte Haftpflicht von 2012“ → haftpflicht). */
function spartenIm(text: string): string[] {
  const t = text.toLocaleLowerCase("de");
  const out: string[] = [];
  const ohneTier = t.replace(/(tier|hunde?|pferde?)\s*-?\s*halter\s*-?\s*haftpflicht|hundehaftpflicht|pferdehaftpflicht/g, " ");
  if (/haftpflicht/.test(ohneTier)) out.push("haftpflicht");
  if (/hausrat/.test(t)) out.push("hausrat");
  if (/rechtsschutz/.test(t)) out.push("rechtsschutz");
  if (/unfall/.test(t)) out.push("unfall");
  if (/geb(ä|ae|a)ude/.test(t)) out.push("wohngebaeude");
  if (/hunde?\s*-?\s*(halter)?\s*-?\s*haftpflicht|tierhalter/.test(t)) out.push("tierhalter-hund");
  if (/pferde?\s*-?\s*(halter)?\s*-?\s*haftpflicht/.test(t)) out.push("tierhalter-pferd");
  return out;
}

/** „Keine Hausrat“, „ohne Rechtsschutz“, „keine Unfallversicherung“: ausdrücklich nicht vorhanden. */
function ausdruecklichOhne(text: string): string[] {
  const t = text.toLocaleLowerCase("de");
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(keine?n?|ohne|nicht)\s+([a-zäöüß\- ]{3,40})/g)) for (const s of spartenIm(m[2].split(/[,;.]/)[0])) out.add(s);
  return [...out];
}

/** Sparte einer Vertragssparte (LeadContract.sparte) im Überblick; privatschutz ist nicht eindeutig, also keine. */
const VERTRAG_SPARTE: Record<string, string> = {
  unfall: "unfall",
  hausrat: "hausrat",
  wohngebaeude: "wohngebaeude",
  rechtsschutz: "rechtsschutz",
  kfz: "kfz",
  bu: "bu",
  pkv: "pkv",
  pkv_tarif: "pkv",
};

export type SchutzKontext = {
  /** Sparten im Angebot dieses Termins */
  angebot: string[];
  /** aktive Verträge des Kontakts bei uns (LeadContract), mit Abschlussdatum */
  vertraege?: { sparte: string; seit: Date | null }[];
};

const oeffnerText = (key: string, an: Ansprache, x: { land: string | null; tiername: string | null }): string | null => {
  const T: Record<string, [string, string]> = {
    haftpflicht: ["Wenn dir aus Versehen etwas kaputtgeht, das anderen gehört: Wer zahlt das bei dir?", "Wenn Ihnen aus Versehen etwas kaputtgeht, das anderen gehört: Wer zahlt das bei Ihnen?"],
    hausrat: ["Ist dein Hausrat versichert, also alles, was du bei einem Umzug mitnehmen würdest?", "Ist Ihr Hausrat versichert, also alles, was Sie bei einem Umzug mitnehmen würden?"],
    rechtsschutz: ["Streit mit Vermieter oder Arbeitgeber: Wer zahlt bei dir den Anwalt?", "Streit mit Vermieter oder Arbeitgeber: Wer zahlt bei Ihnen den Anwalt?"],
    unfall: ["Unfälle in der Freizeit zahlt die gesetzliche Unfallversicherung nicht. Hast du dafür vorgesorgt?", "Unfälle in der Freizeit zahlt die gesetzliche Unfallversicherung nicht. Haben Sie dafür vorgesorgt?"],
    wohngebaeude: ["Ist dein Haus gegen Feuer, Sturm und Leitungswasser versichert?", "Ist Ihr Haus gegen Feuer, Sturm und Leitungswasser versichert?"],
    "tierhalter-pferd": ["Ist dein Pferd haftpflichtversichert? Die Privathaftpflicht zahlt dafür nicht.", "Ist Ihr Pferd haftpflichtversichert? Die Privathaftpflicht zahlt dafür nicht."],
  };
  if (key === "tierhalter-hund") {
    const wer = x.tiername ? x.tiername : a(an, "dein Hund", "Ihr Hund");
    const pflicht = x.land ? ` In ${x.land} ist sie Pflicht.` : "";
    return a(an, `Hat ${wer} eine eigene Haftpflicht? Die Privathaftpflicht zahlt für Hundeschäden nicht.${pflicht}`, `Hat ${wer} eine eigene Haftpflicht? Die Privathaftpflicht zahlt für Hundeschäden nicht.${pflicht}`);
  }
  if (/^(katze|hund|pferd)-(kranken|op)$/.test(key))
    return a(an, "Eine Operation beim Tierarzt kostet schnell mehrere tausend Euro. Ist dein Tier dafür versichert?", "Eine Operation beim Tierarzt kostet schnell mehrere tausend Euro. Ist Ihr Tier dafür versichert?");
  const t = T[key];
  return t ? a(an, t[0], t[1]) : null;
};

const monatJahr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", month: "2-digit", year: "numeric" }).format(d);

/**
 * Vorschlag für den Überblick: die Sparten des Angebots, Verträge bei uns, Genanntes aus Formular und Chat („was haben
 * Sie und wo“), dazu die naheliegenden Lücken nach Lebenslage (Teil A2 und A10):
 * - Tier im Haushalt und keine Haftpflicht → Privathaftpflicht (bei Katze als Öffner für das Bündel)
 * - Miete bzw. Eigentum → Hausrat; Eigentum bzw. Haus → Wohngebäude
 * - Hund → Hundehalterhaftpflicht (Pflicht in BE, HB, HH, NI, ST, SH, TH, aus der PLZ), Pferd → Pferdehalterhaftpflicht
 * - Privatschutz-Kunde mit Tier → Tierkranken
 * - Rechtsschutz und Unfall für jeden Haushalt (seltener vorhanden, daher vorn)
 * Unbekanntes heißt „prüfen“, ausdrücklich Fehlendes „Lücke“, Genanntes „woanders“, Verträge bei uns „bei uns“.
 */
export function schutzVorschlag(d: VorbereitungDaten, k: SchutzKontext, an: Ansprache = "sie"): SchutzEintrag[] {
  const q = angabenVon(d);
  const kat = produktCheckliste(d.lead.produkt)?.key ?? null;
  const formularText = d.formular.map((f) => `${f.label}: ${f.value}`).join(" ");
  const vorhanden = [q.vorhanden, formWert(d, /vorhanden|bestehende|bisherige|versichert bei/i)].filter(Boolean).join(" ");
  const alles = [q.lebenssituation, q.tier, q.gebaeude, q.wohnflaeche, q.interesse, q.anlass, d.lead.produkt, formularText].filter(Boolean).join(" ").toLocaleLowerCase("de");
  const tierText = [q.tier, formWert(d, /tierart/i), kat === "tier" ? d.lead.produkt : null].filter(Boolean).join(" ").toLocaleLowerCase("de");
  const hund = /hund/.test(tierText) || /\bhund/.test(alles);
  const pferd = /pferd/.test(tierText) || /\bpferd/.test(alles);
  const katze = /katze|kater/.test(tierText) || /\bkatze/.test(alles);
  const tier = hund || pferd || katze || kat === "tier";
  const eigentum = /eigentum|eigenheim|eigenes haus|einfamilienhaus|reihenhaus|doppelhaus|eigentumswohnung|wohneinheit|\bbj\.|baujahr/.test(alles) || !!q.gebaeude;
  const wohnung = eigentum || /miete|mietwohnung|wohnung|zieht|umzug|m²|qm/.test(alles) || !!q.wohnflaeche;
  const land = hundePflichtLand(d.lead.adresse ?? q.plz ?? formWert(d, /postleitzahl|plz|adresse/i));
  const tiername = (q.tier ?? "").match(/^(?:hund|rüde|hündin)\s+([A-ZÄÖÜ][a-zäöüß]+)/i)?.[1] ?? null;

  const genannt = new Set(spartenIm(vorhanden));
  const ohne = new Set(ausdruecklichOhne(vorhanden));
  // „sonst nichts“, „keine“: alles nicht Genannte fehlt ausdrücklich
  const sonstNichts = /sonst (nichts|keine)|^\s*(nichts|keine|nein)\s*\.?\s*$/i.test(vorhanden.trim());

  const relevant: string[] = ["rechtsschutz", "unfall", "haftpflicht"];
  if (wohnung || kat === "privatschutz") relevant.push("hausrat");
  if (eigentum) relevant.push("wohngebaeude");
  if (hund) relevant.push("tierhalter-hund");
  if (pferd) relevant.push("tierhalter-pferd");
  // Privatschutz-Kunde mit Tier → Tierkranken als Chance (nicht beim Tier-Lead selbst, der bekommt sie schon)
  if (kat === "privatschutz" && tier) relevant.push(hund ? "hund-op" : pferd ? "pferd-op" : "katze-op");

  const vertraege = new Map<string, Date | null>();
  for (const v of k.vertraege ?? []) {
    const s = VERTRAG_SPARTE[v.sparte];
    if (s && !vertraege.has(s)) vertraege.set(s, v.seit);
  }

  const keys = [...new Set([...k.angebot, ...vertraege.keys(), ...genannt, ...relevant])].filter((s) => SCHUTZ_SPARTEN[s] || k.angebot.includes(s));
  const out: SchutzEintrag[] = keys.map((key) => {
    const label = SCHUTZ_SPARTEN[key] ?? key;
    const oeffner = oeffnerText(key, an, { land, tiername });
    if (vertraege.has(key)) {
      const seit = vertraege.get(key);
      return { key, label, status: "bei-uns", seit: seit ? `seit ${monatJahr(seit)}` : null, oeffner };
    }
    if (genannt.has(key) && !ohne.has(key)) return { key, label, status: "woanders", oeffner };
    if (ohne.has(key) || (sonstNichts && vorhanden.trim())) return { key, label, status: "luecke", oeffner };
    return { key, label, status: "pruefen", oeffner };
  });
  // Angebot zuerst (Reihenfolge des Angebots), dann nach Gewicht als Chance
  return out.sort((x, y) => {
    const ax = k.angebot.indexOf(x.key);
    const ay = k.angebot.indexOf(y.key);
    if (ax >= 0 || ay >= 0) return (ax < 0 ? 99 : ax) - (ay < 0 ? 99 : ay);
    return gewichtVon(y.key) - gewichtVon(x.key);
  });
}

/**
 * „Chance im Termin“ (Teil A2): höchstens 2 Sparten außerhalb des Angebots, die nicht bei uns versichert sind, nach
 * Gewicht; „woanders“ zählt mit (Haupthebel: Bündelvorteil und Wechsel-Service, Teil A7).
 */
export function chancen(schutz: SchutzEintrag[], angebot: string[], max = CHANCEN_MAX): SchutzEintrag[] {
  const rang: Record<SchutzStatus, number> = { luecke: 3, woanders: 2, pruefen: 1, "bei-uns": 0 };
  return schutz
    .filter((s) => !angebot.includes(s.key) && s.status !== "bei-uns")
    .sort((x, y) => gewichtVon(y.key) + rang[y.status] * 5 - (gewichtVon(x.key) + rang[x.status] * 5))
    .slice(0, max);
}

/** Info-Zeile „woanders“: „bei HUK-COBURG, Ablauf 03/2027, ca. 8 € im Monat“. */
export function woandersInfo(s: Pick<SchutzEintrag, "versicherer" | "ablauf" | "beitrag">): string | null {
  const teile = [
    s.versicherer ? `bei ${s.versicherer}` : null,
    s.ablauf && /^\d{4}-\d{2}$/.test(s.ablauf) ? `Ablauf ${s.ablauf.slice(5)}/${s.ablauf.slice(0, 4)}` : null,
    s.beitrag != null ? `ca. ${String(s.beitrag.toFixed(2)).replace(".", ",").replace(/,00$/, "")} € im Monat` : null,
  ].filter(Boolean);
  return teile.length ? teile.join(", ") : null;
}

/** Zeilen für die Folie: Angebot zuerst, dann die übrigen nach Gewicht, höchstens SCHUTZ_MAX. */
export function schutzZeilen(schutz: SchutzEintrag[], angebot: string[]): SchutzZeile[] {
  const imAngebot = angebot.map((k) => schutz.find((s) => s.key === k)).filter((s): s is SchutzEintrag => !!s);
  const rest = schutz.filter((s) => !angebot.includes(s.key)).sort((x, y) => gewichtVon(y.key) - gewichtVon(x.key));
  return [...imAngebot, ...rest].slice(0, SCHUTZ_MAX).map((s) => ({
    key: s.key,
    label: s.label,
    status: s.status,
    info: s.status === "bei-uns" ? (s.seit ?? null) : s.status === "woanders" ? woandersInfo(s) : null,
    versicherer: s.status === "woanders" ? (s.versicherer ?? null) : null,
  }));
}

// ─── Vorsorge-Thema (Teil C2): große Produkte nur als Thema, ohne Gesundheitsangaben ─────────

export type VorsorgeKey = "pkv" | "bu" | "risikoleben" | "pflege";
export const VORSORGE_THEMEN: Record<VorsorgeKey, string> = {
  pkv: "PKV-Check",
  bu: "Berufsunfähigkeit",
  risikoleben: "Risikoleben und Altersvorsorge",
  pflege: "Pflegevorsorge",
};
export type VorsorgeThema = { key: VorsorgeKey; label: string; oeffner: string };
/** Sparte im Tarifkatalog zum Vorsorge-Thema („In die Präsentation“, Ole 17.11.2026). */
export const VORSORGE_SPARTE: Record<VorsorgeKey, string> = { pkv: "pkv", bu: "bu", risikoleben: "risikoleben", pflege: "pflegezusatz" };

/** Alter in Jahren aus „22.08.1992“ bzw. „1992-08-22“; null, wenn unklar. */
export function alterAus(text: string | null | undefined, heute: Date): number | null {
  const t = text ?? "";
  const m = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/) ?? t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!m) return null;
  const [j, mo, ta] = m[3].length === 4 ? [Number(m[3]), Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2]), Number(m[3])];
  let alter = heute.getUTCFullYear() - j;
  if (heute.getUTCMonth() + 1 < mo || (heute.getUTCMonth() + 1 === mo && heute.getUTCDate() < ta)) alter--;
  return alter >= 0 && alter < 120 ? alter : null;
}

/**
 * Höchstens ein Vorsorge-Thema (Teil C2), getrennt von den Sach-Chancen, nur aus Beruf, Lebenslage und Alter, nie aus
 * Gesundheitsangaben: selbständig oder Beamter → PKV-Check; jung, Azubi oder Studium → Berufsunfähigkeit; Kinder oder
 * Immobilie → Risikoleben und Altersvorsorge; ab 50 → Pflegevorsorge. aus = vom Vermittler abgeschaltete Themen.
 * Gespeichert wird nichts (Teil C4: nur Thema, Termin, Ergebnis, wenn der Vermittler einen Termin macht).
 */
export function vorsorgeThema(d: VorbereitungDaten, aus: string[] = [], an: Ansprache = "sie", heute = d.termin.startsAt): VorsorgeThema | null {
  const q = angabenVon(d);
  const beruf = [q.beruf, formWert(d, /beruf|tätigkeit|status/i)].filter(Boolean).join(" ").toLocaleLowerCase("de");
  const lage = [q.lebenssituation, q.kinder, q.gebaeude, formWert(d, /lebenssituation|wohnsituation/i)].filter(Boolean).join(" ").toLocaleLowerCase("de");
  const alter = alterAus(q.geburt ?? formWert(d, /geburt/i), heute);
  const kinder = !!q.kinder?.trim() && !/^(keine?|nein|0)\b/i.test(q.kinder.trim()) ? true : /kind|familie/.test(lage);
  const immobilie = /eigentum|eigenheim|eigenes haus|einfamilienhaus|reihenhaus|eigentumswohnung|immobilie/.test(lage) || !!q.gebaeude;
  const kandidaten: [VorsorgeKey, boolean, [string, string]][] = [
    [
      "pkv",
      /selbst(st)?ändig|freiberuf|unternehmer|beamt/.test(beruf),
      /beamt/.test(beruf)
        ? ["Als Beamter trägt dein Dienstherr einen Teil der Krankheitskosten. Hast du deinen Restschutz schon einmal vergleichen lassen?", "Als Beamter trägt Ihr Dienstherr einen Teil der Krankheitskosten. Haben Sie Ihren Restschutz schon einmal vergleichen lassen?"]
        : ["Als Selbständiger zahlst du in der GKV den Höchstbeitrag. Hast du das schon einmal vergleichen lassen?", "Als Selbständiger zahlen Sie in der GKV den Höchstbeitrag. Haben Sie das schon einmal vergleichen lassen?"],
    ],
    [
      "bu",
      /azubi|ausbildung|student|studium|berufsstart|berufseinst/.test(beruf) || (alter != null && alter < 30),
      ["Deine Arbeitskraft bringt dir dein ganzes Berufsleben Einkommen. Hast du schon überlegt, wie du es absicherst?", "Ihre Arbeitskraft bringt Ihnen Ihr ganzes Berufsleben Einkommen. Haben Sie schon überlegt, wie Sie es absichern?"],
    ],
    [
      "risikoleben",
      kinder || immobilie,
      ["Wäre deine Familie finanziell abgesichert, wenn dein Einkommen wegfällt?", "Wäre Ihre Familie finanziell abgesichert, wenn Ihr Einkommen wegfällt?"],
    ],
    ["pflege", alter != null && alter >= 50, ["Ab 50 lohnt ein Blick auf die Pflegevorsorge. Hast du dafür schon einen Plan?", "Ab 50 lohnt ein Blick auf die Pflegevorsorge. Haben Sie dafür schon einen Plan?"]],
  ];
  const hit = kandidaten.find(([key, ok]) => ok && !aus.includes(key));
  return hit ? { key: hit[0], label: VORSORGE_THEMEN[hit[0]], oeffner: a(an, hit[2][0], hit[2][1]) } : null;
}

export const cleanVorsorgeAus = (raw: unknown): VorsorgeKey[] =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((x): x is VorsorgeKey => typeof x === "string" && x in VORSORGE_THEMEN))];

// ─── Bereinigen ─────────────────────────────────────────────────────────────────────────────

const STATUS = new Set<string>(SCHUTZ_REIHENFOLGE);
const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

export function cleanSchutz(raw: unknown): SchutzEintrag[] {
  const out: SchutzEintrag[] = [];
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, 14)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const key = typeof r.key === "string" && /^[a-z0-9-]{2,60}$/.test(r.key) ? r.key : null;
    const label = txt(r.label, 60);
    const status = typeof r.status === "string" && STATUS.has(r.status) ? (r.status as SchutzStatus) : null;
    if (!key || !label || !status || out.some((o) => o.key === key)) continue;
    const beitrag = typeof r.beitrag === "number" && Number.isFinite(r.beitrag) && r.beitrag >= 0 && r.beitrag < 10000 ? Math.round(r.beitrag * 100) / 100 : null;
    const ablauf = typeof r.ablauf === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.ablauf) ? r.ablauf : null;
    out.push({
      key,
      label,
      status,
      ...(txt(r.versicherer, 60) ? { versicherer: txt(r.versicherer, 60) } : {}),
      ...(beitrag != null ? { beitrag } : {}),
      ...(ablauf ? { ablauf } : {}),
      ...(txt(r.oeffner, 240) ? { oeffner: txt(r.oeffner, 240) } : {}),
      ...(txt(r.seit, 30) ? { seit: txt(r.seit, 30) } : {}),
    });
  }
  return out;
}

export function cleanSchutzZeilen(raw: unknown): SchutzZeile[] {
  const out: SchutzZeile[] = [];
  for (const x of (Array.isArray(raw) ? raw : []).slice(0, SCHUTZ_MAX)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const key = typeof r.key === "string" && /^[a-z0-9-]{2,60}$/.test(r.key) ? r.key : null;
    const label = txt(r.label, 60);
    const status = typeof r.status === "string" && STATUS.has(r.status) ? (r.status as SchutzStatus) : null;
    if (!key || !label || !status || out.some((o) => o.key === key)) continue;
    out.push({ key, label, status, info: txt(r.info, 120), versicherer: txt(r.versicherer, 60) });
  }
  return out;
}
