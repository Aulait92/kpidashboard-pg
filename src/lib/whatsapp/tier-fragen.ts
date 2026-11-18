// Tierkrankenversicherung (TKV): feste Fragen nach der Buchung (Ole, 18.11.2026; Live-Test: die Gesundheitsfrage zur
// Katze kam nie). Bis dahin standen die TKV-Angaben nur als Prompt-Text in lib/whatsapp/produkt-fragen.ts
// (tierCheckliste), den der Assistent nach der Buchung gar nicht mehr bekam; die Rechner-Tabelle
// (lib/preise/rechner-angaben.ts) kennt für Katze und Hund nur Formularangaben, also war nach der Buchung nichts offen.
//
// Ablauf (lib/whatsapp/termin-strecke.ts): Buchungsnachricht → diese Fragen, eine pro Nachricht, nur was fehlt → Komplettcheck
// → wie bisher (Vertragsfrage, Policen-Bitte, Schluss).
//   1. Gesundheit: „Ist Minka aktuell gesund?“ [Ja, gesund] [War in Behandlung]; bei Behandlung frei: was und wann
//   2. nur wenn das Formular es nicht liefert: Geburtsjahr, Rasse, Geschlecht, Haltung (nur Katzen); Kastration nie
//   3. weitere Tiere (Anzahl > 1, eine Frage für alle), gewünschter Schutz (nur wenn aus Frage 2 des Erstanschreibens
//      noch offen), bestehende Tierversicherung (bei Ja: bis wann), Geburtsdatum des Halters
// Gesundheitsangaben zu Tieren sind keine Art.-9-Daten (lib/gesundheitsdaten.ts istTierLead).
// Rein, ohne Datenbank (testbar).

import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints, type QualificationData, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";

export type TierFrageKey =
  | "gesundheit"
  | "gesundheitDetail"
  | "geburtTier"
  | "rasse"
  | "geschlecht"
  | "haltung"
  | "weitere"
  | "tarifwunsch"
  | "vorhanden"
  | "vorhandenAblauf"
  | "geburt";

export type TierKnopf = { id: string; title: string };
export type TierFrage = { key: TierFrageKey; text: string; buttons: TierKnopf[] | null };

export type TierQuelle = { source: string | null | undefined; formular: { label: string; value: string }[]; angaben: unknown };

/** Feste TKV-Fragen nach der Buchung? (Tierkranken- bzw. Tier-OP-Produkt, nicht Privatschutz, Futter, Halterhaftpflicht) */
export function istTierStrecke(source: string | null | undefined): boolean {
  return produktCheckliste(source)?.key === "tier";
}

type Art = "katze" | "hund" | "pferd" | "tier";

export type TierInfo = { art: Art; name: string | null; anzahl: number };

const form = (f: TierQuelle["formular"], re: RegExp) => f.find((x) => re.test(x.label))?.value?.replace(/\s+/g, " ").trim() || null;
const angabenVon = (raw: unknown) => Object.fromEntries(qualificationPoints(raw).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;

/** Tierart, Name und Anzahl aus Formular und Produkt. */
export function tierInfo(q: TierQuelle): TierInfo {
  const t = `${form(q.formular, /tierart/i) ?? ""} ${q.source ?? ""}`.toLowerCase();
  const art: Art = /katze|kater/.test(t) ? "katze" : /hund/.test(t) ? "hund" : /pferd/.test(t) ? "pferd" : "tier";
  const name = form(q.formular, /tiername|name des tieres|name (der katze|des hundes|des pferdes)/i);
  const n = Number((form(q.formular, /anzahl tiere|anzahl (katzen|hunde|pferde)/i) ?? "").match(/\d+/)?.[0] ?? "1");
  return { art, name: name && name.length <= 30 ? name : null, anzahl: n > 1 ? n : 1 };
}

const WORT: Record<Art, { sie: string; du: string; plural: string; pluralDu: string }> = {
  katze: { sie: "Ihre Katze", du: "deine Katze", plural: "Ihre Katzen", pluralDu: "deine Katzen" },
  hund: { sie: "Ihr Hund", du: "dein Hund", plural: "Ihre Hunde", pluralDu: "deine Hunde" },
  pferd: { sie: "Ihr Pferd", du: "dein Pferd", plural: "Ihre Pferde", pluralDu: "deine Pferde" },
  tier: { sie: "Ihr Tier", du: "dein Tier", plural: "Ihre Tiere", pluralDu: "deine Tiere" },
};

const PLURAL: Record<Art, string> = { katze: "Katzen", hund: "Hunde", pferd: "Pferde", tier: "Tiere" };

/** „Minka“ bzw. „Ihre Katze“ (Nominativ). */
function wer(an: Ansprache, i: TierInfo): string {
  return i.name ?? a(an, WORT[i.art].du, WORT[i.art].sie);
}

/** Was aus Formular und Angaben schon bekannt ist (Formularfelder wie in lib/ppl/perspective.ts bzw. Meta-Formular). */
function bekannt(q: TierQuelle) {
  const g = angabenVon(q.angaben);
  const tier = g.tier ?? "";
  const f = (re: RegExp) => form(q.formular, re);
  return {
    gesundheit: !!g.tiergesundheit,
    gesundheitOffen: /^war in behandlung$/i.test(g.tiergesundheit ?? ""),
    // Alter aus Frage 1 des Erstanschreibens („Wie alt ist Ihre Katze?“, angaben.tier) zählt auch
    geburtTier: !!(f(/geburtsjahr|geburtsdatum.*tier|geburtstag.*tier|alter.*tier|^alter$/i) || /\b(19|20)\d{2}\b|\d+\s*(jahr|monat|woche)|jährig|welpe|kitten|baby/i.test(tier)),
    rasse: !!(f(/rasse/i) || /\brasse\b/i.test(tier)),
    geschlecht: !!(f(/geschlecht/i) || /\b(weiblich|männlich|maennlich|kater|katze \(w\)|rüde|ruede|hündin|huendin|stute|hengst|wallach)\b/i.test(tier.replace(/^katze\b/i, ""))),
    haltung: !!(f(/haltung/i) || /wohnungskatze|freig(ä|a)nger|wohnung\b|drinnen|draußen/i.test(tier)),
    weitere: /weitere tiere|katze 2|hund 2|pferd 2/i.test(tier),
    tarifwunsch: !!g.tarifwunsch,
    vorhanden: !!g.vorhanden,
    vorhandenOffen: /^tierversicherung vorhanden$/i.test(g.vorhanden ?? ""),
    geburt: !!(g.geburt || f(/^geburtsdatum$|geburtsdatum \(person|^ihr geburtsdatum|geburtsdatum (des )?halters/i)),
  };
}

const knopf = (key: TierFrageKey, wert: string, title: string): TierKnopf => ({ id: `tier:${key}:${wert}`, title });

/** Text und Knöpfe einer Frage. person = „Herr Kannapinn“. */
export function tierFrage(key: TierFrageKey, q: TierQuelle, an: Ansprache, person: string): TierFrage {
  const i = tierInfo(q);
  const mehrere = i.anzahl > 1;
  const w = wer(an, i);
  const wortArt = i.art === "katze" ? "Katze" : i.art === "hund" ? "Hund" : i.art === "pferd" ? "Pferd" : "Tier";
  switch (key) {
    case "gesundheit":
      return mehrere
        ? {
            key,
            text: i.name
              ? a(an, `Sind ${i.name} und deine anderen ${PLURAL[i.art]} aktuell gesund?`, `Sind ${i.name} und Ihre anderen ${PLURAL[i.art]} aktuell gesund?`)
              : a(an, `Sind ${WORT[i.art].pluralDu} aktuell gesund?`, `Sind ${WORT[i.art].plural} aktuell gesund?`),
            buttons: [knopf(key, "gesund", "Ja, alle gesund"), knopf(key, "behandlung", "War in Behandlung")],
          }
        : { key, text: `Ist ${w} aktuell gesund?`, buttons: [knopf(key, "gesund", "Ja, gesund"), knopf(key, "behandlung", "War in Behandlung")] };
    case "gesundheitDetail":
      return {
        key,
        text: mehrere
          ? a(
              an,
              `Danke! Welches Tier war es, was war es ungefähr, und wann? Ein Stichwort reicht, z. B. ${i.name ?? wortArt}, Zahnbehandlung im Frühjahr. ${person} bespricht das im Termin mit dir.`,
              `Danke! Welches Tier war es, was war es ungefähr, und wann? Ein Stichwort reicht, z. B. ${i.name ?? wortArt}, Zahnbehandlung im Frühjahr. ${person} bespricht das im Termin mit Ihnen.`,
            )
          : a(
              an,
              `Danke! Was war es ungefähr, und wann? Ein Stichwort reicht, z. B. Zahnbehandlung im Frühjahr. ${person} bespricht das im Termin mit dir.`,
              `Danke! Was war es ungefähr, und wann? Ein Stichwort reicht, z. B. Zahnbehandlung im Frühjahr. ${person} bespricht das im Termin mit Ihnen.`,
            ),
        buttons: null,
      };
    case "geburtTier":
      return { key, text: `Wann ist ${w} ungefähr geboren? Das Jahr reicht.`, buttons: null };
    case "rasse":
      return {
        key,
        text: `Welche Rasse hat ${w}?`,
        buttons: i.art === "katze" ? [knopf(key, "mischling", "Hauskatze/Mischling")] : i.art === "hund" ? [knopf(key, "mischling", "Mischling")] : null,
      };
    case "geschlecht":
      return { key, text: `Ist ${w} weiblich oder männlich?`, buttons: [knopf(key, "w", "Weiblich"), knopf(key, "m", "Männlich")] };
    case "haltung":
      return { key, text: `Ist ${w} eine Wohnungskatze oder ein Freigänger?`, buttons: [knopf(key, "wohnung", "Wohnungskatze"), knopf(key, "frei", "Freigänger")] };
    case "weitere":
      return {
        key,
        text: a(
          an,
          `Du hast ${i.anzahl} Tiere angegeben: Wie heißen die anderen, und wie alt sind sie ungefähr? Gern auch Rasse und ob weiblich oder männlich.`,
          `Sie haben ${i.anzahl} Tiere angegeben: Wie heißen die anderen, und wie alt sind sie ungefähr? Gern auch Rasse und ob weiblich oder männlich.`,
        ),
        buttons: null,
      };
    case "tarifwunsch":
      return {
        key,
        text: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?",
        buttons: [knopf(key, "op", "Nur Operationen"), knopf(key, "voll", "Auch Behandlungen")],
      };
    case "vorhanden":
      return { key, text: mehrere ? a(an, "Hast du für deine Tiere schon eine Tierversicherung?", "Haben Sie für Ihre Tiere schon eine Tierversicherung?") : `Hat ${w} schon eine Tierversicherung?`, buttons: [knopf(key, "nein", "Nein"), knopf(key, "ja", "Ja")] };
    case "vorhandenAblauf":
      return { key, text: "Bis wann läuft die Versicherung ungefähr? Der Monat reicht.", buttons: null };
    case "geburt":
      return { key, text: a(an, `Für das Angebot braucht ${person} noch dein Geburtsdatum. Wie lautet es?`, `Für das Angebot braucht ${person} noch Ihr Geburtsdatum. Wie lautet es?`), buttons: null };
  }
}

/** Reihenfolge der Fragen. */
const REIHE: TierFrageKey[] = ["gesundheit", "gesundheitDetail", "geburtTier", "rasse", "geschlecht", "haltung", "weitere", "tarifwunsch", "vorhanden", "vorhandenAblauf", "geburt"];

/** Offene Fragen in der Reihenfolge (nur was fehlt und noch nicht beantwortet ist). Leer = alles da. */
export function offeneTierFragen(q: TierQuelle, beantwortet: ReadonlySet<string>): TierFrageKey[] {
  if (!istTierStrecke(q.source)) return [];
  const b = bekannt(q);
  const i = tierInfo(q);
  const fehlt: Record<TierFrageKey, boolean> = {
    gesundheit: !b.gesundheit,
    gesundheitDetail: b.gesundheitOffen,
    geburtTier: !b.geburtTier,
    rasse: !b.rasse && i.art !== "tier",
    geschlecht: !b.geschlecht,
    haltung: i.art === "katze" && !b.haltung,
    weitere: i.anzahl > 1 && !b.weitere,
    tarifwunsch: !b.tarifwunsch,
    vorhanden: !b.vorhanden,
    vorhandenAblauf: b.vorhandenOffen,
    geburt: !b.geburt,
  };
  return REIHE.filter((k) => fehlt[k] && !beantwortet.has(k));
}

/** Angabe zum Tier an angaben.tier anhängen („Rasse: Hauskatze/Mischling“), höchstens 200 Zeichen (qualification.ts). */
export function tierErgaenzen(bisher: string | null | undefined, label: string, wert: string): string {
  const neu = `${label}: ${wert.replace(/\s+/g, " ").trim()}`.slice(0, 200);
  const alt = (bisher ?? "")
    .split(/;\s*/)
    .filter((s) => s.trim() && !s.toLowerCase().startsWith(`${label.toLowerCase()}:`))
    .join("; ");
  const platz = 200 - neu.length - 2;
  return alt && platz > 0 ? `${alt.slice(0, platz)}; ${neu}` : neu;
}

export type TierAuswertung = {
  /** neue Angaben (über die bisherigen legen) */
  angaben: QualificationData;
  /** beantwortete Fragen (Gesundheit frei beschrieben: auch die Nachfrage) */
  beantwortet: TierFrageKey[];
};

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[.!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
const WEISS_NICHT = /^(weiß (ich )?nicht|weiss (ich )?nicht|keine ahnung|k\.? ?a\.?|unsicher|bin (mir )?nicht sicher|kann ich nicht sagen)\b/;
const JA = /^(ja|jo|jap|jep|jup|yes|jawohl|genau|klar|sicher)\b/;
const NEIN = /^(nein|nee|ne|nö|noe|no|leider nein|leider nicht|nicht)\b/;

/**
 * Antwort auf eine Tierfrage auswerten (Knopf: wert aus der Payload, sonst Text). null = keine Antwort auf die Frage
 * (z. B. eine Rückfrage des Leads): dann antwortet der Assistent, und die Frage kommt noch einmal.
 */
export function tierAntwortAuswerten(key: TierFrageKey, text: string, knopfWert: string | null, q: TierQuelle): TierAuswertung | null {
  const roh = (text ?? "").replace(/\s+/g, " ").trim();
  const t = norm(roh);
  if (!knopfWert && (!t || (roh.includes("?") && !WEISS_NICHT.test(t)))) return null;
  const g = angabenVon(q.angaben);
  const i = tierInfo(q);
  const tier = (label: string, wert: string): TierAuswertung => ({ angaben: { tier: tierErgaenzen(g.tier, label, wert) }, beantwortet: [key] });
  const offen = !knopfWert && WEISS_NICHT.test(t);
  switch (key) {
    case "gesundheit": {
      const gesund = i.anzahl > 1 ? "alle gesund" : "gesund";
      if (knopfWert === "gesund") return { angaben: { tiergesundheit: gesund }, beantwortet: [key] };
      if (knopfWert === "behandlung") return { angaben: { tiergesundheit: "War in Behandlung" }, beantwortet: [key] };
      if (offen) return { angaben: { tiergesundheit: "unklar, im Termin klären" }, beantwortet: [key, "gesundheitDetail"] };
      const woerter = t.split(" ").length;
      const einschraenkung = /\b(aber|außer|ausser|nur|war|hatte|hat|behandl\w*|tierarzt|op|operation|krank\w*|allergi\w*|zahn|zähne|medikament\w*|chronisch|probleme?|nicht)\b/;
      const gesundWort = /\b(kerngesund|gesund|fit|topfit|putzmunter|nicht krank|keine (probleme|beschwerden|krankheiten|vorerkrankungen))\b/.test(t) && !/\bnicht (ganz |so |mehr )?gesund\b/.test(t);
      const rest = t
        .replace(/^(ja|jo|jap|jep|jup|yes|genau|klar)\b,? ?/, "")
        .replace(/\b(ist|sind) (sie|er|es|alle|beide) (kern)?gesund\b/, "")
        .replace(/\bnicht krank\b|\bkeine (probleme|beschwerden|krankheiten|vorerkrankungen)\b/g, "");
      if ((JA.test(t) || gesundWort || /^alles (gut|ok|okay|bestens)\b/.test(t)) && !einschraenkung.test(rest)) {
        return { angaben: { tiergesundheit: gesund }, beantwortet: [key] };
      }
      if ((NEIN.test(t) || /^(war in behandlung|nicht ganz|nicht so|krank|eher nicht)\b/.test(t)) && woerter <= 4) {
        return { angaben: { tiergesundheit: "War in Behandlung" }, beantwortet: [key] };
      }
      return { angaben: { tiergesundheit: `War in Behandlung: ${roh}` }, beantwortet: [key, "gesundheitDetail"] };
    }
    case "gesundheitDetail":
      return { angaben: { tiergesundheit: offen ? "War in Behandlung (Details im Termin)" : `War in Behandlung: ${roh}` }, beantwortet: [key] };
    case "geburtTier":
      return tier("Geboren", offen ? "offen" : roh);
    case "rasse":
      return tier("Rasse", knopfWert === "mischling" ? (i.art === "katze" ? "Hauskatze/Mischling" : "Mischling") : offen ? "offen" : roh);
    case "geschlecht":
      return tier("Geschlecht", knopfWert === "w" ? "weiblich" : knopfWert === "m" ? "männlich" : offen ? "offen" : roh);
    case "haltung":
      return tier("Haltung", knopfWert === "wohnung" ? "Wohnungskatze" : knopfWert === "frei" ? "Freigänger" : offen ? "offen" : roh);
    case "weitere":
      return tier("Weitere Tiere", offen ? "offen" : roh);
    case "tarifwunsch":
      return {
        angaben: { tarifwunsch: knopfWert === "op" ? "nur OP-Schutz" : knopfWert === "voll" ? "volle Krankenversicherung (auch Tierarztbehandlung)" : offen ? "offen" : roh },
        beantwortet: [key],
      };
    case "vorhanden": {
      if (knopfWert === "nein" || (!knopfWert && (NEIN.test(t) || /^(keine|noch keine|noch nicht|bisher nicht|bisher keine)\b/.test(t)) && t.split(" ").length <= 5)) {
        return { angaben: { vorhanden: "keine Tierversicherung" }, beantwortet: [key, "vorhandenAblauf"] };
      }
      if (knopfWert === "ja" || (JA.test(t) && t.split(" ").length <= 2)) return { angaben: { vorhanden: "Tierversicherung vorhanden" }, beantwortet: [key] };
      return { angaben: { vorhanden: offen ? "offen" : `Tierversicherung: ${roh}` }, beantwortet: [key, "vorhandenAblauf"] };
    }
    case "vorhandenAblauf":
      return { angaben: { vorhanden: offen ? "Tierversicherung vorhanden, Ablauf offen" : `Tierversicherung vorhanden, läuft bis ${roh}` }, beantwortet: [key] };
    case "geburt":
      return { angaben: { geburt: offen ? "offen" : roh }, beantwortet: [key] };
  }
  return null;
}
