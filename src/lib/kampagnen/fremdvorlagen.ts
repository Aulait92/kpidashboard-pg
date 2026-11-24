// Gemeinsames Anzeigenlernen mit Leitplanken (Ole, 24.11.2026).
//
// Mit `vorlagenVon` nutzt ein Lauf die bestlaufenden Anzeigen eines ANDEREN Kunden (Quelle) als Muster für den
// Zielkunden. Zugesagt ist: „Ihre Anzeigen nutzen Muster und Ergebnisse aller Kunden und umgekehrt, ohne Namen,
// Personenfotos, Logos oder Zahlen einzelner Kunden.“ Übernommen werden dürfen nur Aufhänger, Textaufbau und Bildidee;
// die Quelle wird nie gezeigt; Kunden mit Widerspruch sind weder Quelle noch Ziel.
//
// Diese Datei sichert das technisch ab (nicht nur per Anweisung an das Modell):
// 1. Muster statt Gewinner: aus den Gewinnern der Quelle wird ein bereinigtes Muster (FremdMuster) ohne Anzeigen-ID,
//    Anzeigen- und Kampagnennamen, Kennzahlen und Bild-URL. In den Texten sind Namensteile der Quelle, Orte, Zahlen,
//    Links und fremde Versicherer durch Platzhalter ersetzt, das Modell sieht sie nie.
// 2. Feste Ausgabeprüfung (kein Modell): keine Namensteile der Quelle, keine längeren wörtlichen Übernahmen, keine
//    stehen gebliebenen Platzhalter, auch nicht im Schlüssel des Winkels (landet im Anzeigennamen bei Meta).
// 3. Gespeicherte Kontexte (auch im alten Format vom 24.11.2026) werden beim Weiterverwenden bereinigt; bei
//    Widerspruch von Quelle oder Ziel werden die Muster entfernt (lern-sperre.ts).
// Für die eigenen Gewinner eines Kunden ändert sich nichts: ohne Fremdvorlagen geben alle Funktionen hier den Kontext
// unverändert zurück.

import type { Prisma } from "@/generated/prisma/client";
import { gueltigeBildidee } from "@/lib/kampagnen/bildidee";
import { ausgenommeneUnter, type LernSperre } from "@/lib/kampagnen/lern-sperre";
import type { AdCopy, Angle, Bildidee, CampaignContext, EigenerGewinner, Finding, FremdMuster } from "@/lib/kampagnen/types";

export const HINWEIS_FREMD = "Muster aus einem anderen Werbekonto";
export const HINWEIS_ENTFERNT = `${HINWEIS_FREMD} entfernt: gemeinsames Anzeigenlernen ist für diesen Lauf nicht mehr möglich (Widerspruch oder Quelle nicht mehr prüfbar).`;
export const HINWEIS_GESPERRT = `${HINWEIS_FREMD} nicht geladen: gemeinsames Anzeigenlernen ist für diesen Lauf ausgeschlossen (Widerspruch).`;
/** Ab so vielen gleichen Wörtern in Folge gilt ein Text als wörtlich übernommen. */
export const MAX_GLEICHE_WOERTER = 8;
const MAX_MUSTER = 5;
const MAX_TEXT = 700;

export function hinweisFremd(anzahl: number): string {
  return anzahl > 0
    ? `${HINWEIS_FREMD}: ${anzahl} ${anzahl === 1 ? "Anzeige" : "Anzeigen"} als Muster (ohne Namen, Bilder und Zahlen).`
    : `${HINWEIS_FREMD}: keine passenden Anzeigen gefunden.`;
}

// ─── Erkennen ──────────────────────────────────────────────────────────

/** Altes Format (Commit 6f668ea vom 24.11.2026): der Hinweis nannte den Quellkunden, die Gewinner standen ungefiltert im Kontext. */
const ALT_HINWEIS = /^Vorlagen aus dem Werbekonto von\s+/;

type KontextTeil = Pick<CampaignContext, "fremdvorlagen" | "eigeneGewinnerHinweis">;

export function istAltformat(ctx: KontextTeil | null | undefined): boolean {
  return typeof ctx?.eigeneGewinnerHinweis === "string" && ALT_HINWEIS.test(ctx.eigeneGewinnerHinweis);
}

/** Stammen die Vorlagen dieses Kontexts aus dem Werbekonto eines anderen Kunden (neues Kennzeichen oder alter Hinweis)? */
export function hatFremdvorlagen(ctx: KontextTeil | null | undefined): boolean {
  return !!ctx && (ctx.fremdvorlagen === true || istAltformat(ctx));
}

/** Name des Quellkunden aus dem alten Hinweis (nur um die Quelle wiederzufinden, wird nie gespeichert oder gezeigt). */
export function altQuellName(ctx: KontextTeil | null | undefined): string | null {
  if (!istAltformat(ctx)) return null;
  const name = ctx!.eigeneGewinnerHinweis!.replace(ALT_HINWEIS, "").split(/\s+·\s+Eigene Gewinner/)[0].trim();
  return name || null;
}

// ─── Namensteile der Quelle ────────────────────────────────────────────

/** Kundendaten der Quelle, aus denen die Namensteile gebildet werden. */
export type QuelleDaten = {
  id: string;
  name: string;
  region?: string | null;
  firmen?: (string | null | undefined)[];
  kontakt?: { name?: string | null; firstName?: string | null; lastName?: string | null; leaderNames?: string | null; city?: string | null; zip?: string | null } | null;
  /** Anzeigenamen der Logins (Berater im Team) */
  team?: (string | null | undefined)[];
  adAccountId?: string | null;
  /** Facebook-Seiten der Quelle (für den Ausschluss in der Werbebibliothek) */
  seiten?: string[];
};

/**
 * Ein Wort, das die Quelle erkennbar macht. `schwach`: zugleich ein gewöhnliches Wort (z. B. der Nachname „Koch“ oder
 * der Ort „Essen“), zählt nur neben einem weiteren Namensteil oder einem Wort wie „Agentur“, „Herr“ bzw. „in“.
 */
export type Namensteil = { wort: string; art: "name" | "ort"; schwach?: boolean };

const falte = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
/** Zweite Schreibweise ohne Umlaut-Umschrift („Muller“ für „Müller“). */
const falteKurz = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
const woerter = (s: string | null | undefined): string[] => (s ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Füllwörter: nie ein Namensteil, auch nicht bei Orten („Frankfurt am Main“, „Bad Homburg vor der Höhe“). Dazu Flüsse
 * und Bundesländer (Flächenländer): Sie machen keinen einzelnen Kunden erkennbar.
 */
const FUELL = new Set(
  `und oder der die das den dem des ein eine einer eines von vom zu zum zur in im am an auf bei mit fuer aus ueber unter ob vor nach um bis durch
  bad sankt ober nieder hohen main rhein neckar donau elbe weser ruhr saale havel spree mosel lahn inn isar lech ems hoehe nord sued ost west mitte
  stadt land kreis landkreis region raum umgebung deutschland bayern nrw nordrhein westfalen niedersachsen hessen sachsen anhalt thueringen
  brandenburg saarland schleswig holstein rheinland pfalz mecklenburg vorpommern wuerttemberg`.split(/\s+/),
);

/** Wortstämme rund um Versicherung und Vermittlung: Allerweltswörter, die in fast jedem Kundennamen vorkommen. */
const ALLERWELT_STAMM =
  /versicher|assekuranz|makler|agentur|vertretung|vertreter|vermittl|berat|finanz|vorsorge|service|buero|kanzlei|gruppe|partner|direkt|geschaeftsstelle|filiale|zentrale|zentrum|kontor|consult|invest|immobilien|kredit|holding|management|konzept|loesung|experte|spezialist|gesellschaft|verband|leiter|leitung|inhaber|kaufmann|kauffrau|fachmann|fachfrau|fachwirt/;

/** Versicherer und Vertriebe (für die Bereinigung der Mustertexte und als Allerweltswörter in Kundennamen). */
const VERSICHERER = [
  "Allianz", "AXA", "ERGO", "HUK-COBURG", "HUK Coburg", "HUK24", "HUK", "DEVK", "LVM", "Provinzial", "SIGNAL IDUNA", "Signal-Iduna", "Generali", "Zurich",
  "Württembergische", "Wüstenrot", "Gothaer", "Debeka", "Barmenia", "HDI", "R+V", "VGH", "Concordia", "Continentale", "Nürnberger", "Mecklenburgische",
  "HanseMerkur", "ARAG", "DKV", "Uelzener", "AGILA", "Helvetia", "Basler", "Baloise", "Alte Leipziger", "Hallesche", "Itzehoer", "Öffentliche",
  "SparkassenVersicherung", "Versicherungskammer Bayern", "Versicherungskammer", "WWK", "Volkswohl Bund", "Stuttgarter", "Swiss Life", "die Bayerische",
  "Münchener Verein", "DVAG", "Deutsche Vermögensberatung", "MLP", "tecis", "CosmosDirekt", "VHV", "Universa", "Petplan", "Lassie", "Getsafe",
  "Haftpflichtkasse", "InterRisk", "ROLAND", "DEURAG", "DELA", "Monuta", "Ammerländer", "Janitos", "KRAVAG", "Condor", "Volksfürsorge", "AachenMünchener",
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VERSICHERER_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${VERSICHERER.map((v) => esc(v).replace(/[\s-]+/g, "[\\s-]?")).join("|")})(?![\\p{L}\\p{N}])`, "giu");

const VERSICHERER_WORT = new Set(VERSICHERER.flatMap((v) => woerter(v).map(falte)));

/** Allerweltswörter in Kundennamen: Rechtsformen, Anreden, Füllwörter, Versicherer (deren Wortteile). */
const ALLERWELT = new Set([
  ...`gmbh ohg gbr ug ag kg co mbh ek inh dr prof dipl ing kfm herr frau familie soehne sohn gebrueder kollegen kollege kollegin nachfolger nachf
  team test kunde kunden kundin haus praxis studio bank sparkasse volksbank
  ihr ihre ihren ihrem unser unsere mein meine dein deine sie wir ich du plus pro extra premium online digital regional lokal persoenlich
  deutsche deutscher bund leben life swiss alte verein bayerische`.split(/\s+/),
  ...VERSICHERER_WORT,
]);

/**
 * Gewöhnliche Wörter, die zugleich häufige Nachnamen, Vornamen oder Ortsnamen sind. Sie bleiben Namensteile, zählen
 * aber nur im Zusammenhang (neben einem weiteren Namensteil, nach „Herr“, „Team“, „Agentur“ bzw. nach „in“): sonst
 * würde jede Hausrat-Anzeige mit „Sturm“ oder „Keller“ anschlagen.
 */
const SCHWACH = new Set(
  `sommer winter herbst fruehling sturm regen sonne stern mond himmel engel koenig kaiser graf herzog prinz ritter vogt bauer koch richter jaeger schaefer
  fischer schneider weber wagner mueller schuster zimmermann schreiber schmied becker kraemer schulz schulze wolf fuchs hahn vogel hund katz baer lamm haas
  klein gross lang lange kurz jung alt neu gut schoen stark frei frank ernst sauer kuhn kuehn braun schwarz weiss roth rot gruen keller stein berg horn busch
  wald feld bach see hof burg dorf brunnen bruecke muehle kirch linde eiche baum blum rose kraus krause freund kind mann schutz sorge glueck ruhe recht kraft
  licht zeit tag nacht morgen abend heim markt platz weg ort essen halle wissen laufen singen baden weiden lage lehre greifen wedel hagen kiel ulm`.split(/\s+/),
);

/** Wörter, nach bzw. vor denen auch ein schwacher Namensteil als Name zählt („Team Sommer“, „Koch Versicherungen“, „in Essen“). */
const MARKER_VOR_NAME = new Set(
  `herr frau familie team inhaber inhaberin ansprechpartner ansprechpartnerin berater beraterin makler maklerin agentur buero vertretung generalvertretung
  hauptvertretung generalagentur hauptagentur versicherungsbuero versicherungsagentur versicherungsmakler versicherungsberater versicherungsvertretung
  geschaeftsstelle dr prof`.split(/\s+/),
);
const MARKER_NACH_NAME = new Set(
  `versicherungen versicherung versicherungsbuero versicherungsagentur versicherungsmakler versicherungsvermittlung assekuranz finanz finanzen finanzberatung
  team agentur gmbh ohg kg ek`.split(/\s+/),
);
const MARKER_VOR_ORT = new Set(`in aus um raum region stadt kreis landkreis umgebung`.split(/\s+/));

const istAllerwelt = (gefaltet: string) => ALLERWELT.has(gefaltet) || ALLERWELT_STAMM.test(gefaltet);
const istPlz = (w: string) => /^\d{5}$/.test(w);

/** Angaben des Zielkunden, deren Wörter nie als Namensteil der Quelle zählen (gleicher Ort, gleicher Nachname, Produkt). */
export type ZielDaten = Partial<Pick<CampaignContext, "customerName" | "advisorName" | "city" | "zip" | "region" | "insurer" | "product" | "patterns" | "special">>;

/**
 * Namensteile der Quelle aus ihren Kundendaten: Kundenname, Agentur bzw. Firma, Vor- und Nachname des Ansprechpartners,
 * weitere Inhaber und Berater, Ort, Postleitzahl und Region. Ausgenommen sind Allerweltswörter („Versicherung“,
 * „Allianz“, „Generalvertretung“) und alles, was auch zum Zielkunden gehört.
 */
export function namensteileDerQuelle(q: QuelleDaten, ziel?: ZielDaten | null): Namensteil[] {
  const eigen = new Set<string>();
  for (const s of [ziel?.customerName, ziel?.advisorName, ziel?.city, ziel?.zip, ziel?.region, ziel?.insurer, ziel?.product, ziel?.patterns, ziel?.special]) {
    for (const w of woerter(s)) {
      eigen.add(falte(w));
      eigen.add(falteKurz(w));
    }
  }
  const out = new Map<string, Namensteil>();
  const add = (s: string | null | undefined, art: Namensteil["art"]) => {
    for (const w of woerter(s)) {
      const k = falte(w);
      if (/^\d+$/.test(w) ? !(art === "ort" && istPlz(w)) : w.length < 3) continue;
      if (eigen.has(k) || eigen.has(falteKurz(w)) || FUELL.has(k)) continue;
      if (art === "name" && istAllerwelt(k)) continue;
      if (!out.has(k)) out.set(k, { wort: w, art, ...(SCHWACH.has(k) ? { schwach: true } : {}) });
    }
  };
  add(q.name, "name");
  for (const f of q.firmen ?? []) add(f, "name");
  add(q.kontakt?.name, "name");
  add(q.kontakt?.firstName, "name");
  add(q.kontakt?.lastName, "name");
  add(q.kontakt?.leaderNames, "name");
  for (const t of q.team ?? []) add(t, "name");
  add(q.kontakt?.city, "ort");
  add(q.kontakt?.zip, "ort");
  add(q.region, "ort");
  return [...out.values()];
}

/**
 * Je Wort des Textes der Namensteil der Quelle, den es trifft (sonst null). Ganze Wörter; ab 6 Buchstaben auch als
 * Wortteil („Lohmanns“). Schwache Namensteile zählen nur im Zusammenhang.
 */
function namenJeWort(toks: string[], teile: Namensteil[], o: { kleinZaehlt?: boolean } = {}): (Namensteil | null)[] {
  if (!teile.length) return toks.map(() => null);
  const gefaltet = toks.map((t) => [falte(t), falteKurz(t)] as const);
  const schluessel = teile.map((t) => [falte(t.wort), falteKurz(t.wort)] as const);
  const roh = toks.map((tok, i) => {
    for (let n = 0; n < teile.length; n++) {
      const [a, b] = schluessel[n];
      const gleich = gefaltet[i][0] === a || gefaltet[i][1] === b;
      const alsTeil = !gleich && !teile[n].schwach && a.length >= 6 && (gefaltet[i][0].includes(a) || gefaltet[i][1].includes(b));
      if (!gleich && !alsTeil) continue;
      // Kurze Namen („Max“) nur großgeschrieben, sonst schlägt „max. 5 Minuten“ an
      if (gleich && a.length <= 4 && !o.kleinZaehlt && !/^[\p{Lu}\d]/u.test(tok)) continue;
      return teile[n];
    }
    return null;
  });
  return roh.map((teil, i) => {
    if (!teil?.schwach) return teil;
    if ((i > 0 && roh[i - 1]) || (i + 1 < toks.length && roh[i + 1])) return teil;
    const vor = i > 0 ? gefaltet[i - 1][0] : "";
    const nach = i + 1 < toks.length ? gefaltet[i + 1][0] : "";
    if (teil.art === "ort") return MARKER_VOR_ORT.has(vor) || (i > 0 && istPlz(toks[i - 1])) ? teil : null;
    return MARKER_VOR_NAME.has(vor) || VERSICHERER_WORT.has(vor) || MARKER_NACH_NAME.has(nach) ? teil : null;
  });
}

/** Wörter eines Textes, die Namensteile der Quelle sind. */
function namenImText(text: string | null | undefined, teile: Namensteil[], o: { kleinZaehlt?: boolean } = {}): string[] {
  if (!text || !teile.length) return [];
  const toks = woerter(text);
  const treffer = namenJeWort(toks, teile, o);
  return [...new Set(toks.filter((_, i) => treffer[i]))];
}

// ─── Mustertexte bereinigen ────────────────────────────────────────────

const PLATZHALTER = /\[(?:Zahl|Name|Ort|Versicherer|Link|Hashtag)\]/gi;
const EINER = "ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun";
const ZEHNER = "zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|sechzig|siebzig|achtzig|neunzig";
const ZEHN_BIS_NEUNZEHN = "zehn|elf|zwölf|zwoelf|dreizehn|vierzehn|fünfzehn|fuenfzehn|sechzehn|siebzehn|achtzehn|neunzehn";
const ZAHLWORT = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:${EINER})und(?:${ZEHNER})|(?:${EINER}|${ZEHN_BIS_NEUNZEHN}|${ZEHNER})?(?:hundert|tausend)(?:e|en)?|${ZEHNER}|${ZEHN_BIS_NEUNZEHN}|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|millionen?|milliarden?)(?![\\p{L}\\p{N}])`,
  "giu",
);

/**
 * Namen, die nicht in den Kundendaten der Quelle stehen (z. B. ein Mitarbeiter in der Anzeige): Nach Wörtern wie
 * „Berater“, „Agentur“, „Team“, „Herr“, „Frau“ folgen in Anzeigen fast immer Eigennamen. Die großgeschriebenen Wörter
 * direkt danach werden im Mustertext vorsorglich ersetzt (lieber ein Hauptwort zu viel als ein Name zu wenig).
 */
const NAME_NACH_WORT =
  /(?<![\p{L}\p{N}])((?:(?:Versicherungs)?(?:[Bb]erater(?:in)?|[Mm]akler(?:in)?|[Vv]ertreter(?:in)?|[Ff]achmann|[Ff]achfrau|[Ee]xpert(?:e|in))|Ansprechpartner(?:in)?|Inhaber(?:in)?|(?:General|Haupt)?(?:[Aa]gentur|[Vv]ertretung)|(?:Versicherungs)?[Bb]üro|Team|Herrn?|Frau|Familie)\s+(?:(?:Dr|Prof)\.\s+)*)(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/gu;
/** Gruß am Ende („Ihr Max Lohmann“). */
const NAME_AM_ENDE = /((?:Ihre?|Deine?|Eure?|Euer)\s+)(\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+)(\s*[.!]?\s*)$/u;

/** Namensteile der Quelle (Namen und Orte) durch Platzhalter ersetzen, alles andere bleibt. */
export function ohneNamen(text: string | null | undefined, teile: Namensteil[]): string | null {
  if (text == null) return null;
  if (!teile.length) return text;
  const treffer = namenJeWort(woerter(text), teile);
  let i = 0;
  return text
    .replace(/[\p{L}\p{N}]+/gu, (w) => {
      const teil = treffer[i++];
      return teil ? (teil.art === "ort" ? "[Ort]" : "[Name]") : w;
    })
    .replace(/(\[(Name|Ort)\])(?:[\s.\/:-]*\[\2\])+/g, "$1");
}

/**
 * Text einer fremden Anzeige als Muster aufbereiten: Namensteile der Quelle, Orte, Zahlen (auch ausgeschrieben), Links,
 * Mail-Adressen, Profile, Hashtags und fremde Versicherer werden zu Platzhaltern. So bleiben Aufhänger, Aufbau, Länge
 * und Tonfall erkennbar, aber nichts, was die Quelle erkennbar macht.
 */
export function bereinigeMusterText(text: string | null | undefined, o: { teile: Namensteil[]; versicherer?: string | null }, max = MAX_TEXT): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const eigener = o.versicherer ? falte(o.versicherer).replace(/[^a-z0-9]/g, "") : "";
  const ohneKontakt = t
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu, "[Link]")
    // Satzzeichen am Ende gehören zum Satz, nicht zur Adresse
    .replace(/(?:https?:\/\/|www\.)\S*[^\s.,;:!?)\]„“"']/gi, "[Link]")
    .replace(/(?<![\p{L}\p{N}@.])[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]+)*\.(?:de|com|net|org|info|eu|at|ch|io|app|online|shop)(?:\/\S*[^\s.,;:!?)\]„“"'])?(?![\p{L}\p{N}])/giu, "[Link]")
    .replace(/(?<![\p{L}\p{N}])@[\p{L}\p{N}_.]{2,}/gu, "[Name]")
    .replace(/(?<![\p{L}\p{N}])#[\p{L}\p{N}_]+/gu, "[Hashtag]");
  // Erst die Namen (sie brauchen die Nachbarwörter, z. B. „Allianz Koch“), dann fremde Versicherer, dann Zahlen
  const bereinigt = (ohneNamen(ohneKontakt, o.teile) ?? "")
    .replace(NAME_NACH_WORT, "$1[Name]")
    .replace(NAME_AM_ENDE, "$1[Name]$3")
    .replace(VERSICHERER_RE, (v) => {
      const k = falte(v).replace(/[^a-z0-9]/g, "");
      return eigener && (eigener.includes(k) || k.includes(eigener)) ? v : "[Versicherer]";
    })
    .replace(/\d+(?:[.,:\/ -]\d+)*/g, "[Zahl]")
    .replace(ZAHLWORT, "[Zahl]")
    .replace(/(\[(Zahl|Name|Ort|Versicherer|Link|Hashtag)\])(?:[\s.\/:-]*\[\2\])+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return bereinigt.slice(0, max) || null;
}

const sauberCta = (cta: unknown) => (typeof cta === "string" && /^[A-Z][A-Z_]{1,39}$/.test(cta.trim()) ? cta.trim() : null);

type BereinigeOpts = { teile: Namensteil[]; versicherer?: string | null };

function musterAus(
  w: { primaryText?: unknown; headline?: unknown; description?: unknown; cta?: unknown; video?: unknown; passtZumProdukt?: unknown },
  o: BereinigeOpts,
  bildidee: Bildidee | null,
): FremdMuster {
  const text = (v: unknown, max: number) => bereinigeMusterText(typeof v === "string" ? v : null, o, max);
  return {
    passtZumProdukt: w.passtZumProdukt === true,
    video: w.video === true,
    primaryText: text(w.primaryText, MAX_TEXT),
    headline: text(w.headline, 200),
    description: text(w.description, 300),
    cta: sauberCta(w.cta),
    bildidee,
  };
}

/**
 * Gewinner der Quelle in bereinigte Muster übersetzen. Bewusst wird NUR übernommen: Reihenfolge, „passt zum Produkt“,
 * Video ja/nein, bereinigte Texte, Button und (falls ermittelt) die abstrakte Bildidee. Anzeigen-ID, Namen, Kennzahlen
 * und Bild-URL gehen hier verloren.
 */
export function fremdMusterAus(gewinner: EigenerGewinner[] | null | undefined, o: BereinigeOpts, bildideen: (Bildidee | null | undefined)[] = []): FremdMuster[] {
  return (gewinner ?? []).slice(0, MAX_MUSTER).map((w, i) => musterAus(w ?? {}, o, gueltigeBildidee(bildideen[i])));
}

/** Gespeichertes Muster beim Lesen erneut auf die erlaubten Felder beschränken (nichts anderes kommt weiter). */
function gespeichertesMuster(m: unknown, o: BereinigeOpts): FremdMuster | null {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const x = m as Record<string, unknown>;
  return musterAus(x, o, gueltigeBildidee(x.bildidee));
}

// ─── Kontext bereinigen (reine Funktion) ───────────────────────────────

/**
 * Kontext mit Fremdvorlagen in die sichere Form bringen (gleichbleibend bei wiederholtem Aufruf): Muster statt Gewinner,
 * neutraler Hinweis, Kennzeichen `fremdvorlagen`. Erkennt auch das alte Format. Ohne Fremdvorlagen: unverändert.
 * `teile`: Namensteile der Quelle; fehlen sie (kein Zugriff auf die Kundendaten), wird wenigstens der Name aus dem
 * alten Hinweis verwendet.
 */
export function leitplankenKontext(ctx: CampaignContext, teile?: Namensteil[]): CampaignContext {
  if (!hatFremdvorlagen(ctx)) return ctx;
  const altName = altQuellName(ctx);
  const t = teile ?? (altName ? namensteileDerQuelle({ id: "", name: altName }, ctx) : []);
  const o: BereinigeOpts = { teile: t, versicherer: ctx.insurer };
  const gespeichert = (Array.isArray(ctx.fremdMuster) ? ctx.fremdMuster : []).map((m) => gespeichertesMuster(m, o)).filter((m): m is FremdMuster => !!m);
  // Gewinner im Kontext eines Fremd-Laufs gibt es nur im alten Format: sie gehören der Quelle und werden zu Mustern
  const muster = [...gespeichert, ...fremdMusterAus(Array.isArray(ctx.eigeneGewinner) ? ctx.eigeneGewinner : [], o)].slice(0, MAX_MUSTER);
  return {
    ...ctx,
    wish: ohneNamen(ctx.wish, t),
    eigeneGewinner: null,
    eigeneGewinnerHinweis: hinweisFremd(muster.length),
    fremdvorlagen: true,
    fremdMuster: muster.length ? muster : null,
  };
}

/** Kontext ohne Muster aus dem anderen Werbekonto (Widerspruch oder Quelle nicht prüfbar). */
export function ohneFremdvorlagen(ctx: CampaignContext, teile: Namensteil[], hinweis = HINWEIS_ENTFERNT): CampaignContext {
  return { ...ctx, wish: ohneNamen(ctx.wish, teile), eigeneGewinner: null, eigeneGewinnerHinweis: hinweis, fremdvorlagen: false, fremdMuster: null, vorlagenQuelleId: null };
}

// ─── Muster für die Agenten ────────────────────────────────────────────

/** Zeilen für die Anweisungen (null ohne Muster). Nur Rang, Texte und Button: keine Namen, keine Kennzahlen, kein Bild. */
export function fremdMusterBlock(muster: FremdMuster[] | null | undefined): string | null {
  if (!muster?.length) return null;
  return muster
    .map((m, i) => {
      const zeilen = [
        `Lernmuster ${i + 1}${m.passtZumProdukt ? " (gleiches Produkt)" : " (anderes Produkt, nur Aufbau und Tonfall übertragen)"}${m.video ? "; Video-Anzeige" : ""}`,
        m.primaryText ? `   Primärtext: „${m.primaryText}“` : null,
        m.headline || m.description || m.cta
          ? `   ${[m.headline ? `Überschrift: „${m.headline}“` : null, m.description ? `Beschreibung: „${m.description}“` : null, m.cta ? `Button: ${m.cta}` : null].filter(Boolean).join("; ")}`
          : null,
      ];
      return zeilen.filter(Boolean).join("\n");
    })
    .join("\n");
}

/** „Lernmuster 2“ im Winkel; bei Läufen aus dem alten Format steht dort noch „Eigener Gewinner 2“. */
const MUSTER_NR = /(?:lernmuster|eigene[rnm]?\s+gewinner)\s*(?:nr\.?\s*)?(\d)/i;
const MUSTER_WORT = /lernmuster|eigene[rnm]?\s+gewinner/i;

/** Muster, auf das sich ein Winkel bezieht, sonst das beste mit Bildidee. */
export function musterFuerWinkel(muster: FremdMuster[] | null | undefined, angleText: string): FremdMuster | null {
  if (!muster?.length) return null;
  const m = MUSTER_NR.exec(angleText);
  const genannt = m ? muster[Number(m[1]) - 1] : undefined;
  if (genannt) return genannt;
  return muster.find((w) => w.bildidee && w.passtZumProdukt) ?? muster.find((w) => w.bildidee) ?? null;
}

/** Anzahl Winkel, die sich ausdrücklich auf ein Lernmuster beziehen. */
export function winkelMitLernmuster(angles: { insight: string; hook?: string; title?: string }[]): number {
  return angles.filter((a) => MUSTER_WORT.test(`${a.title ?? ""} ${a.hook ?? ""} ${a.insight}`)).length;
}

/** Nummern der Muster (ab 0), die in den Winkeln genannt sind (für die Admin-Ansicht). */
function genutzteMuster(angles: { insight: string; hook?: string; title?: string }[] | null | undefined): number[] {
  const re = new RegExp(MUSTER_NR.source, "gi");
  return [...new Set((angles ?? []).flatMap((a) => [...`${a.title ?? ""} ${a.hook ?? ""} ${a.insight}`.matchAll(re)].map((m) => Number(m[1]) - 1)))];
}

// ─── Feste Ausgabeprüfung (kein Modell) ────────────────────────────────

/** Wörter für den Vergleich: klein, ohne Satzzeichen, Zahlen als „#“. Platzhalter trennen (dort beginnt eine neue Folge). */
function folgen(text: string | null | undefined): string[][] {
  if (!text) return [];
  return text
    .replace(/\[Zahl\]/gi, " 0 ")
    .split(/\[(?:Name|Ort|Versicherer|Link|Hashtag)\]/i)
    .map((teil) =>
      teil
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .map((w) => (/^\d+$/.test(w) ? "#" : w))
        // „1.200,50“ wird beim Trennen zu mehreren Zahlen: als eine zählen
        .filter((w, i, a) => !(w === "#" && a[i - 1] === "#")),
    )
    .filter((f) => f.length);
}

function nGramme(texte: (string | null | undefined)[], n: number): Set<string> {
  const out = new Set<string>();
  for (const t of texte) for (const f of folgen(t)) for (let i = 0; i + n <= f.length; i++) out.add(f.slice(i, i + n).join(" "));
  return out;
}

/**
 * Längere wörtliche Übernahme: die erste Folge von mindestens `n` gleichen Wörtern, die in einem Mustertext steht.
 * `erlaubt`: eigene feste Texte (z. B. die Beispiel-Aufforderung aus der Anweisung an den Texter), die nicht zählen.
 */
export function woertlicheUebernahme(ausgabe: string | null | undefined, vorlagen: (string | null | undefined)[], erlaubt: (string | null | undefined)[] = [], n = MAX_GLEICHE_WOERTER): string | null {
  const ausVorlage = nGramme(vorlagen, n);
  if (!ausVorlage.size) return null;
  const frei = nGramme(erlaubt, n);
  for (const f of folgen(ausgabe)) {
    for (let i = 0; i + n <= f.length; i++) {
      const g = f.slice(i, i + n).join(" ");
      if (!ausVorlage.has(g) || frei.has(g)) continue;
      // Folge so weit verlängern, wie sie weiter in den Mustern steht
      let ende = i + n;
      while (ende < f.length && ausVorlage.has(f.slice(ende - n + 1, ende + 1).join(" "))) ende++;
      return f.slice(i, ende).join(" ");
    }
  }
  return null;
}

const musterTexte = (muster: FremdMuster[] | null | undefined) => (muster ?? []).flatMap((m) => [m.primaryText, m.headline, m.description]);

type PruefEingabe = {
  muster: FremdMuster[] | null | undefined;
  teile: Namensteil[];
  /** Eigene feste Texte (Anweisungen, bewährte Muster), deren Wortfolgen nicht als Übernahme zählen */
  erlaubteTexte?: (string | null | undefined)[];
};

/** Befunde zu einem einzelnen Text (leer = in Ordnung). */
function textBefunde(text: string | null | undefined, e: PruefEingabe, o: { ohneUebernahme?: boolean } = {}): { issue: string; fix: string }[] {
  const out: { issue: string; fix: string }[] = [];
  if (!text) return out;
  const namen = namenImText(text, e.teile);
  if (namen.length) {
    out.push({
      issue: `enthält ${namen.map((n) => `„${n}“`).join(", ")}: Name bzw. Ort aus einem anderen Werbekonto`,
      fix: "Diese Wörter streichen. Name, Ort und Versicherer nur aus den Angaben dieses Kunden.",
    });
  }
  const folge = o.ohneUebernahme ? null : woertlicheUebernahme(text, musterTexte(e.muster), e.erlaubteTexte);
  if (folge) {
    out.push({
      issue: `übernimmt ein Lernmuster wörtlich (${folge.split(" ").length} gleiche Wörter in Folge: „${folge.slice(0, 120)}“)`,
      fix: "Mit eigenen Worten neu schreiben. Nur Aufhänger-Art und Aufbau als Muster, keine Sätze übernehmen.",
    });
  }
  const platzhalter = text.match(PLATZHALTER);
  if (platzhalter) {
    out.push({ issue: `enthält den Platzhalter ${[...new Set(platzhalter)].join(", ")} aus einem Lernmuster`, fix: "Platzhalter entfernen bzw. durch die Angaben dieses Kunden ersetzen, nichts erraten." });
  }
  return out;
}

const COPY_FELDER: [keyof AdCopy, string, Finding["area"]][] = [
  ["primaryText", "Primärtext", "text"],
  ["headline", "Überschrift", "text"],
  ["description", "Beschreibung", "text"],
  ["imageHeadline", "Große Zeile im Bild", "bild"],
  ["imageSubline", "Kleine Zeile im Bild", "bild"],
];

/**
 * Feste Prüfung der Anzeigentexte und Bildzeilen bei Mustern aus einem anderen Werbekonto: keine Namensteile der
 * Quelle, keine längeren wörtlichen Übernahmen, keine Platzhalter; auch der Schlüssel des Winkels (Anzeigenname bei
 * Meta). Jeder Treffer ist ein roter Befund (überarbeiten lassen, sonst nichts anlegen).
 */
export function pruefeAusgabe(e: PruefEingabe & { copies?: AdCopy[] | null }): Finding[] {
  const out: Finding[] = [];
  (e.copies ?? []).forEach((ad, index) => {
    for (const [feld, name, area] of COPY_FELDER) {
      for (const b of textBefunde(String(ad[feld] ?? ""), e)) out.push({ severity: "rot", area, index, issue: `${name} ${b.issue}.`, fix: b.fix });
    }
    const imSchluessel = namenImText(ad.angleKey, e.teile, { kleinZaehlt: true });
    if (imSchluessel.length) {
      out.push({
        severity: "rot",
        area: "text",
        index,
        issue: `Schlüssel des Winkels („${ad.angleKey}“) enthält einen Namen bzw. Ort aus einem anderen Werbekonto; er stünde im Anzeigennamen bei Meta.`,
        fix: "Lauf neu starten (der Schlüssel wird beim Erzeugen der Winkel neutral vergeben).",
      });
    }
  });
  return out;
}

/**
 * Dieselbe Prüfung für die Winkel, als Fehlertexte für den zweiten Versuch des Agenten. Titel und Hook gehen in Texte
 * und Bilder ein und werden voll geprüft; die Begründung (insight) bleibt intern und darf ein Muster zitieren, aber
 * keine Namen oder Platzhalter enthalten.
 */
export function winkelFehler(angles: Angle[], e: PruefEingabe): string[] {
  const out: string[] = [];
  angles.forEach((a, i) => {
    for (const feld of ["title", "hook", "insight"] as const) {
      for (const b of textBefunde(a[feld], e, { ohneUebernahme: feld === "insight" })) out.push(`angles[${i}].${feld} ${b.issue}. ${b.fix}`);
    }
  });
  return out;
}

/** Schlüssel der Winkel ohne Namensteile der Quelle: betroffene Schlüssel werden neutral („winkel-2“). */
export function sichereWinkelSchluessel(angles: Angle[], teile: Namensteil[]): Angle[] {
  const vergeben = new Set(angles.map((a) => a.key));
  return angles.map((a, i) => {
    if (!namenImText(a.key, teile, { kleinZaehlt: true }).length) return a;
    let key = `winkel-${i + 1}`;
    for (let n = 2; vergeben.has(key); n++) key = `winkel-${i + 1}-${n}`;
    vergeben.add(key);
    return { ...a, key };
  });
}

// ─── Admin-Ansicht ─────────────────────────────────────────────────────

/** Was die Admin-Ansicht von den Mustern zeigt: keine Texte, keine Bilder, keine Zahlen der Quelle. */
export type MusterAnzeige = { passtZumProdukt: boolean; video: boolean; bildidee: boolean; genutzt: boolean };

export function musterAnzeige(ctx: CampaignContext | null | undefined, angles?: { insight: string; hook?: string; title?: string }[] | null): MusterAnzeige[] | null {
  if (!ctx || !hatFremdvorlagen(ctx)) return null;
  const k = leitplankenKontext(ctx);
  const genutzt = new Set(genutzteMuster(angles));
  return (k.fremdMuster ?? []).map((m, i) => ({ passtZumProdukt: m.passtZumProdukt, video: m.video, bildidee: !!m.bildidee, genutzt: genutzt.has(i) }));
}

// ─── Gespeicherte Kontexte absichern (mit Kundendaten und Sperre) ──────

export type FremdDeps = {
  /** Widerspruch gegen das gemeinsame Anzeigenlernen (Standard: lern-sperre.ts) */
  sperre?: LernSperre;
  /** Kundendaten der Quelle (Standard: Datenbank) */
  quelle?: (id: string) => Promise<QuelleDaten | null>;
  /** Altes Format: Quelle über den Kundennamen aus dem alten Hinweis finden (Standard: Datenbank, Name ist eindeutig) */
  quelleNachName?: (name: string) => Promise<QuelleDaten | null>;
};

export type GesicherterKontext = {
  ctx: CampaignContext;
  /** Der Kontext nutzt (weiterhin) Muster aus einem anderen Werbekonto */
  fremd: boolean;
  /** Der gespeicherte Kontext weicht ab und sollte so gespeichert werden */
  geaendert: boolean;
  /** Namensteile der Quelle für die Ausgabeprüfung: nur im Speicher, werden nie gespeichert */
  namensteile: Namensteil[];
  /** Muster wurden entfernt: Quelle oder Ziel ist ausgenommen, oder die Quelle ist nicht mehr prüfbar */
  entfernt: boolean;
  /** Der Kontext lag im alten Format vor (vor den Leitplanken) */
  altformat: boolean;
  /** Kunden-ID der Quelle (für das Audit-Log) */
  quelleId: string | null;
};

const QUELLE_SELECT = {
  id: true,
  name: true,
  region: true,
  partnerFirma: true,
  metaAdAccountId: true,
  metaPageId: true,
  salesContact: { select: { name: true, firstName: true, lastName: true, leaderNames: true, city: true, zip: true } },
  onboarding: { select: { websiteInfo: true } },
  users: { where: { role: "BUYER" }, select: { displayName: true } },
  leadSources: { where: { pageId: { not: null } }, select: { pageId: true } },
} satisfies Prisma.CustomerSelect;
type QuelleZeile = Prisma.CustomerGetPayload<{ select: typeof QUELLE_SELECT }>;

function quelleAus(c: QuelleZeile): QuelleDaten {
  const web = (c.onboarding?.websiteInfo ?? {}) as { companyName?: string | null };
  return {
    id: c.id,
    name: c.name,
    region: c.region,
    firmen: [c.partnerFirma, web.companyName],
    kontakt: c.salesContact,
    team: c.users.map((u) => u.displayName),
    adAccountId: c.metaAdAccountId,
    seiten: [...new Set([c.metaPageId, ...c.leadSources.map((l) => l.pageId)].filter((x): x is string => !!x))],
  };
}

/** Kundendaten eines Kunden als Quelle (null: Kunde gibt es nicht). */
export async function ladeQuelle(id: string): Promise<QuelleDaten | null> {
  if (!id) return null;
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.customer.findUnique({ where: { id }, select: QUELLE_SELECT });
  return c ? quelleAus(c) : null;
}

/** Altes Format: Quelle über den (eindeutigen) Kundennamen finden. */
export async function ladeQuelleNachName(name: string): Promise<QuelleDaten | null> {
  if (!name) return null;
  const { prisma } = await import("@/lib/prisma");
  const c = await prisma.customer.findUnique({ where: { name }, select: QUELLE_SELECT });
  return c ? quelleAus(c) : null;
}

/** Namen und Facebook-Seiten mehrerer Kunden (Ausschluss in der Werbebibliothek). */
export async function ladeSeiten(ids: string[]): Promise<{ namen: string[]; seiten: string[] }> {
  if (!ids.length) return { namen: [], seiten: [] };
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { name: true, metaPageId: true, leadSources: { where: { pageId: { not: null } }, select: { pageId: true } } },
  });
  return {
    namen: rows.map((r) => r.name),
    seiten: [...new Set(rows.flatMap((r) => [r.metaPageId, ...r.leadSources.map((l) => l.pageId)]).filter((x): x is string => !!x))],
  };
}

/** Vergleich unabhängig von der Reihenfolge der Schlüssel (die Datenbank sortiert JSON-Schlüssel um). */
const stabil = (v: unknown): string =>
  JSON.stringify(v, (_k, wert) => (wert && typeof wert === "object" && !Array.isArray(wert) ? Object.fromEntries(Object.entries(wert).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : wert));
const gleich = (a: unknown, b: unknown) => stabil(a) === stabil(b);

/**
 * Gespeicherten Kontext vor jeder Weiterverwendung absichern (Fortsetzen, Auffrischung, „Bild neu“):
 * - ohne Fremdvorlagen: unverändert (eigener Gewinner-Weg),
 * - altes Format: Quelle über den Namen wiederfinden, Muster bereinigen, Kennzeichen setzen,
 * - Quelle oder Ziel inzwischen ausgenommen, oder Quelle nicht mehr auffindbar: Muster entfernen.
 */
export async function sichereKontext(roh: CampaignContext, deps: FremdDeps = {}): Promise<GesicherterKontext> {
  if (!hatFremdvorlagen(roh)) return { ctx: roh, fremd: false, geaendert: false, namensteile: [], entfernt: false, altformat: false, quelleId: null };
  const altformat = istAltformat(roh);
  const altName = altQuellName(roh);
  let quelle = roh.vorlagenQuelleId ? await (deps.quelle ?? ladeQuelle)(roh.vorlagenQuelleId) : null;
  if (!quelle && altName) quelle = await (deps.quelleNachName ?? ladeQuelleNachName)(altName);
  const teile = quelle ? namensteileDerQuelle(quelle, roh) : altName ? namensteileDerQuelle({ id: "", name: altName }, roh) : [];
  const gesperrt = quelle ? (await ausgenommeneUnter([roh.customerId, quelle.id], deps.sperre)).size > 0 : true;
  if (!quelle || gesperrt) {
    const ctx = ohneFremdvorlagen(roh, teile);
    return { ctx, fremd: false, geaendert: !gleich(roh, ctx), namensteile: teile, entfernt: true, altformat, quelleId: quelle?.id ?? roh.vorlagenQuelleId ?? null };
  }
  const ctx: CampaignContext = { ...leitplankenKontext(roh, teile), vorlagenQuelleId: quelle.id };
  return { ctx, fremd: true, geaendert: !gleich(roh, ctx), namensteile: teile, entfernt: false, altformat, quelleId: quelle.id };
}
