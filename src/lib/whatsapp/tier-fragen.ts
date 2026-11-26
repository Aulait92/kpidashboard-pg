// Tierkrankenversicherung (TKV): feste Fragen nach der Buchung (Ole, 18.11.2026; Live-Test: die Gesundheitsfrage zur
// Katze kam nie). Bis dahin standen die TKV-Angaben nur als Prompt-Text in lib/whatsapp/produkt-fragen.ts
// (tierCheckliste), den der Assistent nach der Buchung gar nicht mehr bekam; die Rechner-Tabelle
// (lib/preise/rechner-angaben.ts) kennt für Katze und Hund nur Formularangaben, also war nach der Buchung nichts offen.
//
// Ablauf (lib/whatsapp/termin-strecke.ts): Buchungsnachricht → diese Fragen, eine pro Nachricht, nur was fehlt → Komplettcheck
// → wie bisher (Vertragsfrage, Policen-Bitte, Schluss).
//   1. Gesundheit: „Ist Minka aktuell gesund?“ [Ja, gesund] [War in Behandlung]; bei Behandlung frei: was und wann
//   2. nur wenn das Formular es nicht liefert: Geburtsjahr, Rasse, Geschlecht, Haltung (nur Katzen), Kennzeichnung (Chip
//      bzw. Tätowierung, Ole 26.11.2026: wichtig fürs Angebot, kommt auch ins Meta-Formular; Liste, weil 4 Antworten);
//      Kastration nie
//   3. weitere Tiere (Anzahl > 1, eine Frage für alle), gewünschter Schutz (nur wenn aus Frage 2 des Erstanschreibens
//      noch offen), bestehende Tierversicherung (bei Ja: bis wann, Monat und Jahr), Geburtsdatum des Halters
//   4. Geburtsdatum des Halters geprüft (Ole, 19.11.2026): unter 18 ist meist das Datum des Tieres (wird dort notiert, dann
//      einmal nach dem eigenen gefragt), Zukunft oder über 100 einmal neu fragen; danach nie weiter nachbohren
// Gesundheitsangaben zu Tieren sind keine Art.-9-Daten (lib/gesundheitsdaten.ts istTierLead).
// Rein, ohne Datenbank (testbar).

import { a, type Ansprache } from "@/lib/ansprache";
import { qualificationPoints, type QualificationData, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { ablaufBeispiel, ablaufLesen, geburtsdatumPruefen, monatJahrText } from "@/lib/datum-antwort";
import { KENNZEICHNUNG_TEXT, kennzeichnungAusFormular, kennzeichnungLesen, type Kennzeichnung } from "@/lib/tier-kennzeichnung";

export type TierFrageKey =
  | "gesundheit"
  | "gesundheitDetail"
  | "geburtTier"
  | "rasse"
  | "geschlecht"
  | "haltung"
  /** Chip bzw. Tätowierung (Liste: Gechippt, Tätowiert, Beides, Weder noch, Weiß ich nicht) */
  | "kennzeichnung"
  | "weitere"
  | "tarifwunsch"
  | "vorhanden"
  | "vorhandenAblauf"
  | "geburt"
  /** nach einem Datum unter 18 (meist das des Tieres): einmal nach dem eigenen fragen */
  | "geburtEigen"
  /** nach einem Datum in der Zukunft oder über 100 Jahren: einmal neu fragen */
  | "geburtNochmal";

export type TierKnopf = { id: string; title: string };
export type TierListe = { knopf: string; zeilen: TierKnopf[] };
/** buttons: bis 3 Knöpfe; liste: WhatsApp-Liste, wenn die Antworten nicht auf 3 Knöpfe passen */
export type TierFrage = { key: TierFrageKey; text: string; buttons: TierKnopf[] | null; liste?: TierListe | null };

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

/** „von Minka“ bzw. „Ihrer Katze“ (Genitiv, ohne Name). */
const GENITIV: Record<Art, { sie: string; du: string }> = {
  katze: { sie: "Ihrer Katze", du: "deiner Katze" },
  hund: { sie: "Ihres Hundes", du: "deines Hundes" },
  pferd: { sie: "Ihres Pferdes", du: "deines Pferdes" },
  tier: { sie: "Ihres Tieres", du: "deines Tieres" },
};

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
    // Formularfeld mit Wert (auch nicht erkannt: steht dann wörtlich am Lead) bzw. schon im Chat genannt
    kennzeichnung: !!(kennzeichnungAusFormular(q.formular) || /kennzeichnung:|gechippt|t(ä|ae)towiert|\bchip\b|tattoo/i.test(tier)),
    weitere: /weitere tiere|katze 2|hund 2|pferd 2/i.test(tier),
    tarifwunsch: !!g.tarifwunsch,
    vorhanden: !!g.vorhanden,
    vorhandenOffen: /^tierversicherung vorhanden$/i.test(g.vorhanden ?? ""),
    geburt: !!(g.geburt || f(/^geburtsdatum$|geburtsdatum \(person|^ihr geburtsdatum|geburtsdatum (des )?halters/i)),
  };
}

const knopf = (key: TierFrageKey, wert: string, title: string): TierKnopf => ({ id: `tier:${key}:${wert}`, title });

/** Text und Knöpfe einer Frage. person = „Herr Kannapinn“; jetzt für das Beispiel der Ablauffrage. */
export function tierFrage(key: TierFrageKey, q: TierQuelle, an: Ansprache, person: string, jetzt: Date = new Date()): TierFrage {
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
    case "kennzeichnung":
      // 4 Antworten passen nicht auf 3 Knöpfe: Liste (wie die Fragen-Engine, lib/vorbereitung/fragen.ts)
      return {
        key,
        text: `Ist ${w} gechippt oder tätowiert?`,
        buttons: null,
        liste: { knopf: "Antwort wählen", zeilen: KENNZEICHNUNG_ZEILEN.map(([wert, title]) => knopf(key, wert, title)) },
      };
    case "weitere":
      return {
        key,
        text: a(
          an,
          `Du hast ${i.anzahl} Tiere angegeben: Wie heißen die anderen, und wie alt sind sie ungefähr? Gern auch Rasse, ob weiblich oder männlich und ob gechippt oder tätowiert.`,
          `Sie haben ${i.anzahl} Tiere angegeben: Wie heißen die anderen, und wie alt sind sie ungefähr? Gern auch Rasse, ob weiblich oder männlich und ob gechippt oder tätowiert.`,
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
      // Ole, 19.11.2026: „Der Monat reicht“ wurde als „ohne Jahr“ gelesen
      return { key, text: `Bis wann läuft die Versicherung ungefähr? Monat und Jahr reichen, zum Beispiel ${ablaufBeispiel(jetzt)}.`, buttons: null };
    case "geburt":
      return {
        key,
        text: a(
          an,
          `Für das Angebot braucht ${person} noch dein eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?`,
          `Für das Angebot braucht ${person} noch Ihr eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?`,
        ),
        buttons: null,
      };
    case "geburtEigen": {
      const von = i.name ? `von ${i.name}` : a(an, GENITIV[i.art].du, GENITIV[i.art].sie);
      return {
        key,
        text: a(
          an,
          `Danke, das ist sicher das Geburtsdatum ${von}, das habe ich notiert. Für den Vertrag braucht ${person} noch dein eigenes Geburtsdatum.`,
          `Danke, das ist sicher das Geburtsdatum ${von}, das habe ich notiert. Für den Vertrag braucht ${person} noch Ihr eigenes Geburtsdatum.`,
        ),
        buttons: null,
      };
    }
    case "geburtNochmal":
      return {
        key,
        text: a(an, "Das Datum scheint nicht zu passen. Wie lautet dein Geburtsdatum, zum Beispiel 14.05.1985?", "Das Datum scheint nicht zu passen. Wie lautet Ihr Geburtsdatum, zum Beispiel 14.05.1985?"),
        buttons: null,
      };
  }
}

/** Zeilen der Kennzeichnungsfrage (Wert in der Payload, Titel höchstens 24 Zeichen). */
const KENNZEICHNUNG_ZEILEN: [Kennzeichnung, string][] = [
  ["chip", "Gechippt"],
  ["tattoo", "Tätowiert"],
  ["beides", "Beides"],
  ["keine", "Weder noch"],
  ["unbekannt", "Weiß ich nicht"],
];

/** Reihenfolge der Fragen (Kennzeichnung nach den übrigen Angaben zum Tier, vor den weiteren Tieren). */
const REIHE: TierFrageKey[] = ["gesundheit", "gesundheitDetail", "geburtTier", "rasse", "geschlecht", "haltung", "kennzeichnung", "weitere", "tarifwunsch", "vorhanden", "vorhandenAblauf", "geburt", "geburtEigen", "geburtNochmal"];

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
    kennzeichnung: !b.kennzeichnung,
    weitere: i.anzahl > 1 && !b.weitere,
    tarifwunsch: !b.tarifwunsch,
    vorhanden: !b.vorhanden,
    vorhandenAblauf: b.vorhandenOffen,
    geburt: !b.geburt,
    // nur nach einer unpassenden Antwort auf „geburt“ (tierAntwortAuswerten markiert die jeweils andere als beantwortet)
    geburtEigen: !b.geburt && beantwortet.has("geburt"),
    geburtNochmal: !b.geburt && beantwortet.has("geburt"),
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
 * ungeprueft: Datum auch nach der Nachfrage unklar (lib/whatsapp/datum-nachfrage.ts), wörtlich mit Vermerk übernehmen.
 */
export function tierAntwortAuswerten(key: TierFrageKey, text: string, knopfWert: string | null, q: TierQuelle, jetzt: Date = new Date(), o: { ungeprueft?: boolean } = {}): TierAuswertung | null {
  const roh = (text ?? "").replace(/\s+/g, " ").trim();
  const t = norm(roh);
  if (!knopfWert && (!t || (roh.includes("?") && !WEISS_NICHT.test(t)))) return null;
  const g = angabenVon(q.angaben);
  const i = tierInfo(q);
  const tier = (label: string, wert: string): TierAuswertung => ({ angaben: { tier: tierErgaenzen(g.tier, label, wert) }, beantwortet: [key] });
  if (o.ungeprueft) {
    if (key === "vorhandenAblauf") return { angaben: { vorhanden: `Tierversicherung vorhanden, läuft bis ${roh}` }, beantwortet: [key] };
    if (key === "geburt" || key === "geburtEigen" || key === "geburtNochmal") return { angaben: { geburt: roh }, beantwortet: ["geburt", "geburtEigen", "geburtNochmal"] };
    if (key === "geburtTier") return tier("Geboren", roh);
  }
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
    case "kennzeichnung": {
      const k = knopfWert && knopfWert in KENNZEICHNUNG_TEXT ? (knopfWert as Kennzeichnung) : offen ? "unbekannt" : kennzeichnungLesen(roh);
      return tier("Kennzeichnung", k ? KENNZEICHNUNG_TEXT[k] : roh);
    }
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
    case "vorhandenAblauf": {
      // Monat und Jahr lesen („03/27“, „März“, „Ende des Jahres“); weiß nicht: offen, nicht nachfragen; sonst wie gesagt
      const ab = offen ? "weiss_nicht" : ablaufLesen(roh, jetzt);
      const wert = ab === "weiss_nicht" ? "Tierversicherung vorhanden, Ablauf offen" : `Tierversicherung vorhanden, läuft bis ${ab ? monatJahrText(ab) : roh}`;
      return { angaben: { vorhanden: wert }, beantwortet: [key] };
    }
    case "geburt":
    case "geburtEigen":
    case "geburtNochmal": {
      const alle: TierFrageKey[] = ["geburt", "geburtEigen", "geburtNochmal"];
      const p = offen ? ({ art: "unbekannt" } as const) : geburtsdatumPruefen(roh, jetzt);
      if (p.art === "unbekannt") return { angaben: { geburt: "offen" }, beantwortet: alle };
      if (p.art === "ok") return { angaben: { geburt: p.datum }, beantwortet: alle };
      if (p.art === "unlesbar") return { angaben: { geburt: roh }, beantwortet: alle };
      if (key === "geburt" && p.art === "minderjaehrig") {
        // Meist das Datum des Tieres: dort notieren, wenn noch leer oder gleich (Jahr), dann einmal nach dem eigenen fragen
        const tierBisher = [form(q.formular, /geburtsmonat/i), form(q.formular, /geburtsjahr|geburtsdatum.*tier|alter.*tier/i), /(?:^|;\s*)Geboren:\s*([^;]+)/i.exec(g.tier ?? "")?.[1]]
          .filter(Boolean)
          .join(" ");
        // weicht es vom bekannten ab, bleibt das bekannte stehen und das Datum steht daneben (der Vermittler klärt es)
        const passt = !tierBisher || tierBisher.includes(String(p.jahr));
        return { angaben: { tier: tierErgaenzen(g.tier, passt ? "Geboren" : "Datum aus dem Chat", p.datum) }, beantwortet: ["geburt", "geburtNochmal"] };
      }
      if (key === "geburt") return { angaben: {}, beantwortet: ["geburt", "geburtEigen"] };
      // zweite Antwort passt wieder nicht: festhalten, nicht weiter nachfragen (klärt der Vermittler im Termin)
      return { angaben: { geburt: `offen (Angabe: ${p.datum})` }, beantwortet: alle };
    }
  }
  return null;
}

// ─── Unverständliche Antwort auf „Was war es ungefähr, und wann?“ (Ole, 20.11.2026: „Hier wurde Quatsch geantwortet“) ───
// Die Antwort muss nach Behandlung oder Zeit klingen (Stichwort aus Medizin bzw. Tierarzt, Körperteil, Zeitangabe, Zahl)
// oder „weiß nicht“ sein. Sonst fragt die App genau einmal nach; die zweite Antwort wird immer übernommen.
const DETAIL_STICHWORT =
  /(behandl|tierarzt|klinik|\bop\b|operat|zahn|zähn|zaehn|durchfall|erbroch|erbrech|übergeb|magen|darm|haut|fell|ohr|auge|bein|pfote|pfote|hüft|hueft|knie|gelenk|kreuzband|rücken|ruecken|allergi|juck|impf|kastr|sterili|verletz|bruch|gebrochen|wunde|entzünd|entzuend|infekt|husten|schnupfen|niere|blase|harn|herz|leber|schilddrüs|diabet|tumor|krebs|zecke|floh|flöhe|wurm|würm|parasit|lahm|humpel|fieber|schnitt|biss|unfall|giardien|epilep|arthrose|gewicht|übergewicht|krank|medikament|tablette|antibiot|röntgen|roentgen|ultraschall|blut|vorsorge|kontrolle|check|untersuch|spritze|narkose|geburt|trächtig|zyste|abszess|ekzem|pilz|milben|bindehaut|katarakt|struvit|futter|vergift|atem|asthma|nase|maul|kiefer|schwanz|kralle|krallen|routine|nichts schlimmes|kleinigkeit)/;
const DETAIL_ZEIT =
  /(\d|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|frühjahr|fruehjahr|frühling|fruehling|sommer|herbst|winter|woche|monat|jahr|gestern|heute|letzt|vorig|kürzlich|kuerzlich|neulich|früher|frueher|lange her|seit|welpe|kitten|baby|jung)/;

/** Klingt die Antwort auf die Detailfrage zur Behandlung nach einer Angabe? (sonst einmal nachfragen) */
export function detailVerstaendlich(text: string): boolean {
  const t = norm(text ?? "");
  if (!t) return false;
  if (WEISS_NICHT.test(t) || /^(nein|nichts|keine|nix)\b/.test(t)) return true;
  return DETAIL_STICHWORT.test(t) || DETAIL_ZEIT.test(t);
}

/** Nachfrage bei unverständlicher Antwort (eine Nachricht, ohne Knöpfe). */
export function detailNachfrageText(an: Ansprache, q: TierQuelle): string {
  const i = tierInfo(q);
  const wer = i.anzahl > 1 ? a(an, "deine Tiere", "Ihre Tiere") : i.name ?? a(an, WORT[i.art].du, WORT[i.art].sie);
  return a(
    an,
    `Das habe ich leider nicht ganz verstanden. Was hatte${i.anzahl > 1 ? "n" : ""} ${wer} ungefähr, und wann? Zum Beispiel: Durchfall im Sommer. Weißt du es nicht mehr, schreib einfach „weiß nicht“.`,
    `Das habe ich leider nicht ganz verstanden. Was hatte${i.anzahl > 1 ? "n" : ""} ${wer} ungefähr, und wann? Zum Beispiel: Durchfall im Sommer. Wissen Sie es nicht mehr, schreiben Sie einfach „weiß nicht“.`,
  );
}
