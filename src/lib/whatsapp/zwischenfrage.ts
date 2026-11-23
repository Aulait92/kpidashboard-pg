// Genau eine Frage mehr vor dem Terminvorschlag (Ole, 17.11.2026):
//   Öffnungsfrage (Erstanschreiben) → Antwort → genau EINE Zwischenfrage mit Antwortknöpfen → Antwort → Terminvorschlag.
// Die Zwischenfrage ist das erste noch unbekannte Feld aus den „Angaben fürs Angebot“ des Produkts
// (lib/preise/rechner-angaben.ts); Bekanntes aus dem Formular bzw. Chat wird nie erneut gefragt. Die App stellt sie
// selbst (bot.ts), ohne KI, und schickt nach der Antwort per Knopf direkt den Terminvorschlag, der die Antwort aufgreift
// (gespraech.ts terminNutzenSatz: „was Haftpflicht und Hausrat für Sie kosten“).
// Freitext statt Knopf, Terminwunsch, Rückfrage oder Absage des Leads: nicht weiterfragen, der Assistent bietet direkt
// den Termin an (bzw. bucht die Wunschzeit). Gefragt wird höchstens einmal.
// Aktiv nur Privatschutz (ZWISCHENFRAGE_AKTIV); die übrigen Produkte sind als Vorschlag vorbereitet
// (docs/vorschlag-zwischenfrage.md), Ole entscheidet. Rein, ohne Datenbank.

import { a, type Ansprache } from "@/lib/ansprache";
import type { VermittlerName } from "@/lib/vermittler-nennung";
import { enthaeltErsteFrage, erstfrageKnopfWert, frageplan, outreachProdukt, type FormAntwort } from "@/lib/whatsapp/erstanschreiben";
import { isOutreachPurpose, type NoticePurpose } from "@/lib/whatsapp/templates";
import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import type { Knopf } from "@/lib/whatsapp/gespraech";
import { qmText, wohnflaecheLesen } from "@/lib/wohnflaeche";

/** Eine mögliche Zwischenfrage: Feld, Erkennung im Formular, Frage (ohne Einleitung) und Knöpfe (höchstens 3, je 20 Zeichen). */
export type ZwischenDef = {
  key: string;
  feld: QualificationKey;
  /** Formularfelder, die die Frage schon beantworten */
  bekannt: RegExp;
  /** Weitere Felder im Chat (qualificationData), die sie beantworten */
  bekanntAngaben?: QualificationKey[];
  sie: string;
  du: string;
  knoepfe: string[];
  /** Freie Zahl statt Knöpfen (Wohnfläche in m², Ole 19.11.2026); frühere Knopfantworten bleiben gültig */
  zahl?: { alteKnoepfe: string[] };
  /** Frühere Fassungen der Frage (laufende Chats erkennen die Frage weiter) */
  frueher?: string[];
  /** Nur für dieses Tier (Tierkrankenversicherung) */
  tier?: "katze" | "hund";
};

const PRIVATSCHUTZ_VERSICHERN: ZwischenDef = {
  key: "versichern",
  feld: "versichern",
  bekannt: /lebenssituation|familienstand|zu versichernde|mitversichert|für wen soll/i,
  bekanntAngaben: ["versichern", "lebenssituation"],
  sie: "Wer soll mitversichert sein?",
  du: "Wer soll mitversichert sein?",
  knoepfe: ["Nur ich", "Zu zweit", "Familie mit Kindern"],
};

// Ersatzfragen (Ole, 18.11.2026: „es fehlt immer noch die eine zwischenfrage“): steht die Familie schon im Formular,
// kommt die nächste Rechner-Angabe dran (Hausrat: Wohnfläche, Haftpflicht: öffentlicher Dienst), damit vor dem
// Terminvorschlag immer genau eine Zwischenfrage kommt.
const PRIVATSCHUTZ_WOHNFLAECHE: ZwischenDef = {
  key: "wohnflaeche",
  feld: "wohnflaeche",
  bekannt: /wohnfl(ä|a)che|quadratmeter|m²/i,
  bekanntAngaben: ["wohnflaeche"],
  // Ole, 19.11.2026: Bereiche reichen dem Rechner nicht, die genaue Zahl als freie Eingabe
  sie: "Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.",
  du: "Wie viele Quadratmeter Wohnfläche hat deine Wohnung? Bitte als Zahl, zum Beispiel 72.",
  knoepfe: [],
  zahl: { alteKnoepfe: ["Bis 60 m²", "60 bis 100 m²", "Über 100 m²"] },
  frueher: ["Wie groß ist Ihre Wohnung ungefähr?", "Wie groß ist deine Wohnung ungefähr?"],
};

const PRIVATSCHUTZ_OEFFENTLICH: ZwischenDef = {
  key: "oeffentlicherDienst",
  feld: "beruf",
  bekannt: /öffentlich|beruf|beamt/i,
  bekanntAngaben: ["beruf"],
  sie: "Arbeiten Sie im öffentlichen Dienst?",
  du: "Arbeitest du im öffentlichen Dienst?",
  knoepfe: ["Ja", "Nein"],
};

/**
 * Zwischenfragen je Produkt in der Reihenfolge der Angaben fürs Angebot. Nur Privatschutz ist aktiv; die anderen sind
 * Vorschläge (docs/vorschlag-zwischenfrage.md) und greifen erst, wenn ihr Zweck in ZWISCHENFRAGE_AKTIV steht.
 */
export const ZWISCHENFRAGEN: Partial<Record<NoticePurpose, ZwischenDef[]>> = {
  outreach_privatschutz: [PRIVATSCHUTZ_VERSICHERN, PRIVATSCHUTZ_WOHNFLAECHE, PRIVATSCHUTZ_OEFFENTLICH],
  // Vorschlag: Angaben des Tier-Rechners (Haltung, Geschlecht), Alter und Tierart stehen meist im Formular
  outreach_tkv: [
    { key: "haltung", feld: "tier", tier: "katze", bekannt: /haltung/i, sie: "Ist Ihre Katze eine Wohnungskatze oder ein Freigänger?", du: "Ist deine Katze eine Wohnungskatze oder ein Freigänger?", knoepfe: ["Wohnungskatze", "Freigänger", "Beides"] },
    { key: "geschlechtTier", feld: "tier", bekannt: /geschlecht/i, sie: "Ist Ihr Tier männlich oder weiblich?", du: "Ist dein Tier männlich oder weiblich?", knoepfe: ["Männlich", "Weiblich"] },
  ],
  // Vorschlag: Versicherungsstatus (Art. 9 DSGVO: keine Fragen zu Zähnen, Befunden oder Behandlungen)
  outreach_zahn: [
    { key: "vorhanden", feld: "vorhanden", bekannt: /gesetzlich oder privat|krankenkasse|krankenversichert/i, bekanntAngaben: ["vorhanden"], sie: "Sind Sie gesetzlich krankenversichert?", du: "Bist du gesetzlich krankenversichert?", knoepfe: ["Ja, gesetzlich", "Nein, privat"] },
  ],
  // Vorschlag: gesetzlich oder privat (der Monatsbeitrag aus dem Funnel heißt: schon privat, dann nicht fragen)
  outreach_pkv: [
    { key: "vorhanden", feld: "vorhanden", bekannt: /gesetzlich oder privat|wie lange in pkv|aktuelle versicherung|monatsbeitrag|aktueller beitrag/i, bekanntAngaben: ["vorhanden"], sie: "Sind Sie aktuell gesetzlich oder schon privat versichert?", du: "Bist du aktuell gesetzlich oder schon privat versichert?", knoepfe: ["Gesetzlich", "Schon privat"] },
  ],
};

/** Produkte, bei denen die App die Zwischenfrage wirklich stellt (Ole, 17.11.2026: zunächst nur Privatschutz). */
export const ZWISCHENFRAGE_AKTIV: readonly NoticePurpose[] = ["outreach_privatschutz"];

/** Einleitung vor der Frage: „Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann:“ */
export function zwischenEinleitung(an: Ansprache, person: VermittlerName): string {
  return a(an, `Danke! Damit ${person.nom} dir im Termin gleich passende Beiträge zeigen kann:`, `Danke! Damit ${person.nom} Ihnen im Termin gleich passende Beiträge zeigen kann:`);
}

/** Text der Zwischenfrage samt Einleitung. */
export function zwischenfrageText(def: ZwischenDef, an: Ansprache, person: VermittlerName): string {
  return `${zwischenEinleitung(an, person)} ${a(an, def.du, def.sie)}`;
}

/** Knöpfe der Zwischenfrage (Payload zwischen:<feld>:<wert>; die Antwort kommt als Text an den Assistenten bzw. bot.ts). Leer bei freier Zahl. */
export function zwischenKnoepfe(def: ZwischenDef): Knopf[] {
  return def.knoepfe.map((k) => ({ id: `zwischen:${def.feld}:${k.toLowerCase().replace(/[^a-zäöüß0-9]+/g, "_")}`, title: k }));
}

/** Erkennt eine Zwischenfrage in einer Nachricht von uns. */
export const ZWISCHEN_TEXT = "im Termin gleich passende Beiträge zeigen kann:";
export const ZWISCHEN_RE = /im Termin gleich passende Beiträge zeigen kann:/;

/**
 * Einmalige Nachfrage bei freier Zahl (Wohnfläche): nach einer Spanne („60 bis 80“) bzw. einer unplausiblen Zahl
 * („1.200“). Danach nie wieder, unklare Antworten gehen ohne Wert weiter (der Vermittler fragt im Termin).
 */
export function zwischenNachfrageText(art: "spanne" | "unplausibel", an: Ansprache): string {
  return art === "spanne"
    ? a(an, "Danke! Weißt du es etwas genauer? Eine Zahl reicht.", "Danke! Wissen Sie es etwas genauer? Eine Zahl reicht.")
    : a(
        an,
        "Die Zahl scheint nicht zu passen. Wie viele Quadratmeter Wohnfläche hat deine Wohnung? Bitte als Zahl, zum Beispiel 72.",
        "Die Zahl scheint nicht zu passen. Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.",
      );
}
export const ZWISCHEN_NACHFRAGE_RE = /^Danke! (Weißt du|Wissen Sie) es etwas genauer\? Eine Zahl reicht\.$|^Die Zahl scheint nicht zu passen\. Wie viele Quadratmeter/;

/** Antwort auf eine Zwischenfrage mit freier Zahl (Wohnfläche). nachfrage = Antwort auf die einmalige Nachfrage. */
function zahlSchritt(def: ZwischenDef, antwort: string, nachfrage: boolean): ZwischenSchritt {
  const alt = def.zahl!.alteKnoepfe.find((k) => k.toLowerCase() === antwort.trim().toLowerCase().replace(/[.!]+$/, ""));
  if (alt) return { art: "antwort", def, wert: alt, frei: false };
  const r = wohnflaecheLesen(antwort);
  if (r?.art === "zahl") return { art: "antwort", def, wert: qmText(r.qm), frei: false };
  if (r?.art === "weiss_nicht") return { art: "antwort", def, wert: null, frei: false, ohneWert: true };
  const ohneWert: ZwischenSchritt = { art: "antwort", def, wert: null, frei: false, ohneWert: true };
  // Keine Zahl: Freitext, Rückfrage oder Terminwunsch übernimmt der Assistent; nach der Nachfrage geht es ohne Wert weiter
  if (!r) return nachfrage && schlichteAntwort(antwort) ? ohneWert : { art: "antwort", def, wert: null, frei: true };
  if (!nachfrage) return { art: "nachfragen", def, nachfrage: r.art, wert: r.art === "spanne" ? `ca. ${qmText(r.qm)}` : null };
  // zweite unklare Antwort: nicht weiter fragen (eine Spanne bleibt als ca.-Wert gespeichert)
  return ohneWert;
}

/** Die nächste noch unbekannte Zwischenfrage des Produkts (null = keine offen bzw. nicht aktiv). */
export function offeneZwischenfrage(
  source: string | null | undefined,
  formular: FormAntwort[] | null | undefined,
  angaben: unknown,
  opts: { aktiv?: readonly NoticePurpose[] } = {},
): ZwischenDef | null {
  const p = outreachProdukt(source);
  if (!p || !(opts.aktiv ?? ZWISCHENFRAGE_AKTIV).includes(p.purpose)) return null;
  const q = qualificationPoints(angaben);
  const form = formular ?? [];
  for (const def of ZWISCHENFRAGEN[p.purpose] ?? []) {
    if (def.tier && p.tier !== def.tier) continue;
    if (form.some((f) => def.bekannt.test(f.label) && f.value?.trim())) continue;
    if ((def.bekanntAngaben ?? []).some((k) => q.find((x) => x.key === k)?.value)) continue;
    return def;
  }
  return null;
}

/** Terminwunsch (Tag, Uhrzeit, „anrufen“) in einer Nachricht des Leads. */
const TERMINWUNSCH = /\b(termin\w*|heute|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|wochenende|uhr|vormittags?|nachmittags?|abends?|mittags?|anruf\w*|telefon\w*|zurückruf\w*|rückruf|video\w*|treffen)\b|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*h\b/i;
/** Nennt der Lead einen Terminwunsch (Tag, Uhrzeit, „Termin“, „anrufen“)? Dann geht die Buchung vor (auch bei der
 * Frage „Entscheidet noch jemand mit?“ vor dem Terminvorschlag, bot.ts). Rein. */
export function nenntTerminwunsch(text: string | null | undefined): boolean {
  return TERMINWUNSCH.test(text ?? "");
}
/** Absage, Stopp oder falscher Kontakt: kein Weiterfragen. */
const ABSAGE = /kein (interesse|bedarf)|nicht (mehr )?(interessiert|nötig)|stopp?\b|abmelden|falsche nummer|aus versehen|versehentlich/i;

/** Ist die Antwort des Leads eine schlichte Antwort (dann darf die Zwischenfrage kommen)? Rein. */
export function schlichteAntwort(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 200) return false;
  if (t.includes("?") || TERMINWUNSCH.test(t) || ABSAGE.test(t)) return false;
  return true;
}

/** Knopf- bzw. Freitextantwort auf die Zwischenfrage auf einen Knopfwert abbilden (null = Freitext ohne klare Zuordnung). */
export function zwischenWert(def: ZwischenDef, text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  const hit = def.knoepfe.find((k) => k.toLowerCase() === t.toLowerCase().replace(/[.!]+$/, ""));
  if (hit) return hit;
  if (def.key !== "versichern" || t.includes("?") || t.length > 80) return null;
  if (/kind|familie|tochter|sohn|söhne|töchter/i.test(t)) return "Familie mit Kindern";
  if (/zu zweit|wir beide|partner|freund|ehe|frau|mann\b|paar|verheiratet/i.test(t)) return "Zu zweit";
  if (/nur ich|nur mich|ich allein|alleine?|single|nur für mich/i.test(t)) return "Nur ich";
  return null;
}

export type VerlaufNachricht = { direction: string; body: string | null; kind?: string | null; purpose?: string | null; sentBy?: string | null };

/** Nachrichten von uns, die das Gespräch nicht weiterführen (Erstinformation als PDF bzw. Link, automatisches Nachfassen). */
function neutral(m: VerlaufNachricht): boolean {
  if (m.kind === "document") return true;
  if (/^Erstinformation zu /.test(m.body ?? "")) return true;
  return m.sentBy === "system" && !isOutreachPurpose(m.purpose ?? "");
}

export type ZwischenSchritt =
  /** Jetzt die Zwischenfrage stellen; die Antwort auf die Öffnungsfrage steht in `antwort` (für feld) */
  | { art: "fragen"; def: ZwischenDef; antwort: { feld: QualificationKey; wert: string } | null }
  /**
   * Antwort auf die Zwischenfrage: wert = Knopfwert bzw. erkannte Antwort; frei = Freitext/Terminwunsch, der Assistent
   * übernimmt; ohneWert = „weiß nicht“ bzw. zweite unklare Antwort: ohne Wert weiter zum Terminvorschlag
   */
  | { art: "antwort"; def: ZwischenDef; wert: string | null; frei: boolean; ohneWert?: boolean }
  /** Freie Zahl unklar (Spanne, unplausibel): einmal nachfragen; wert = vorläufig zu speichern (Mittelwert der Spanne) */
  | { art: "nachfragen"; def: ZwischenDef; nachfrage: "spanne" | "unplausibel"; wert: string | null }
  /** Antwort auf die Öffnungsfrage mit Terminwunsch, Rückfrage oder Absage: nicht weiterfragen */
  | { art: "ueberspringen" };

/**
 * Was ist vor dem Termin dran (rein, testbar)? verlauf = Nachrichten des Chats in zeitlicher Reihenfolge (inbound und
 * outbound), die letzte ist die neue Nachricht des Leads. null = nichts Besonderes, der Assistent macht wie bisher weiter.
 * Die Antwort auf die Öffnungsfrage wird im Feld dieser Frage festgehalten (z. B. „vorhanden“, frageplan).
 */
export function zwischenSchritt(o: {
  source: string | null | undefined;
  verlauf: VerlaufNachricht[];
  formular?: FormAntwort[] | null;
  /** Angaben des Assistenten (Conversation.qualificationData) */
  angaben?: unknown;
  aktiv?: readonly NoticePurpose[];
}): ZwischenSchritt | null {
  const p = outreachProdukt(o.source);
  if (!p || !(o.aktiv ?? ZWISCHENFRAGE_AKTIV).includes(p.purpose)) return null;
  const v = o.verlauf;
  const last = v.at(-1);
  if (!last || last.direction !== "inbound") return null;
  // Antworten des Leads seit unserer letzten (nicht neutralen) Nachricht
  let i = v.length - 1;
  while (i >= 0 && (v[i].direction === "inbound" || (v[i].direction === "outbound" && neutral(v[i])))) i--;
  const unsere = i >= 0 ? v[i] : null;
  const antwort = v
    .slice(i + 1)
    .filter((m) => m.direction === "inbound")
    .map((m) => (m.body ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (!unsere || !antwort) return null;
  // Zwischenfrage schon gestellt: nur die Antwort direkt darauf zählt, danach nie wieder
  const gestellt = v.findIndex((m) => m.direction === "outbound" && ZWISCHEN_RE.test(m.body ?? ""));
  if (gestellt >= 0) {
    // Antwort auf die einmalige Nachfrage (freie Zahl): unsere letzte ist die Nachfrage direkt nach der Zwischenfrage
    const idx = v.indexOf(unsere);
    const nachfrage =
      idx !== gestellt && ZWISCHEN_NACHFRAGE_RE.test(unsere.body ?? "") && v.slice(gestellt + 1, idx).every((m) => m.direction !== "outbound" || neutral(m));
    if (idx !== gestellt && !nachfrage) return null;
    const frage = v[gestellt].body ?? "";
    const def = (ZWISCHENFRAGEN[p.purpose] ?? []).find((d) => [d.sie, d.du, ...(d.frueher ?? [])].some((x) => frage.includes(x))) ?? (ZWISCHENFRAGEN[p.purpose] ?? [])[0];
    if (!def) return null;
    if (def.zahl) return zahlSchritt(def, antwort, nachfrage);
    if (nachfrage) return null;
    const wert = zwischenWert(def, antwort);
    return { art: "antwort", def, wert, frei: !wert };
  }
  // Unsere letzte Nachricht war die Öffnungsfrage (Erstanschreiben bzw. erste Antwort des Assistenten)?
  const istEroeffnung = isOutreachPurpose(unsere.purpose ?? "") || enthaeltErsteFrage(unsere.body, o.source);
  if (!istEroeffnung) return null;
  if (!schlichteAntwort(antwort)) return { art: "ueberspringen" };
  const offen = offeneZwischenfrage(o.source, o.formular, o.angaben, { aktiv: o.aktiv });
  if (!offen) return null;
  const feld = (frageplan(o.source, o.formular, { gesendet: unsere.body }).gestellt?.feld ?? null) as QualificationKey | null;
  // Antwort auf die Öffnungsfrage festhalten, nicht wenn sie dasselbe Feld wie die Zwischenfrage betrifft. Knopf der
  // festen Frage aus v10/v11 (Ole, 19.11.2026): derselbe Wert wie in knopf.ts („Alles neu“ → „noch nichts versichert …“)
  const wert = erstfrageKnopfWert(unsere.body, antwort, unsere.purpose)?.wert ?? antwort.replace(/\s+/g, " ").slice(0, 160);
  return { art: "fragen", def: offen, antwort: feld && feld !== offen.feld && feld !== ("wunsch" as QualificationKey) ? { feld, wert } : null };
}

/** Prompt-Hinweis für den Assistenten, wenn die App nicht weiterfragt (Freitext, Terminwunsch, Absage). */
export function zwischenHinweis(s: ZwischenSchritt): string | null {
  if (s.art === "ueberspringen" || (s.art === "antwort" && s.frei)) {
    return "Vor dem Termin wird nichts mehr gefragt (Zwischenfrage beantwortet bzw. übersprungen). Halte Angaben aus der letzten Nachricht mit record_qualification fest. Nennt der Lead einen Terminwunsch, gilt die Regel zur Wunschzeit; stellt er eine Frage, beantworte sie kurz als einleitung; sagt er ab, verabschiede dich freundlich. Sonst: setze qualifiziert=true und nutze sofort termin_vorschlagen. Stell keine weitere Frage.";
  }
  return null;
}
