// Termin-Strecke des WhatsApp-Assistenten (Ole, 17.11.2026; Reihenfolge P2), reine Textbausteine, testbar ohne LLM:
//   1. Terminvorschlag (von der App, Werkzeug termin_vorschlagen): ein Satz Nutzen, konkret aus den bekannten Angaben
//      („In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und
//      worauf Sie achten sollten.“), genau zwei Videozeiten als Knöpfe plus „Andere Zeit“ (Payload slot:<ISO>).
//   2. Buchungsnachricht kurz (Ole, 17.11.2026 spät, höchstens 3 Zeilen): Termin fett, „hält sich die Zeit nur für Sie
//      frei“, Link. Sofort gebucht, auch ohne E-Mail-Adresse; keine E-Mail, kein Handy-Browser-Satz an dieser Stelle.
//   3. Komplettcheck (Knöpfe „Ja, gern“ / „Nein, danke“), Kennzeichen am Termin (Appointment.komplettcheck).
//   4. Angebotsfragen nach der Rechner-Tabelle (lib/preise/rechner-angaben.ts), eine pro Nachricht, Ja/Nein mit Knöpfen.
//   5. Nur bei Komplettcheck „Ja“: Frage nach bestehenden Verträgen (lib/whatsapp/vorvertraege.ts), Policen-Einladung.
//   6. Schluss (abschlussText): kurze Bereitlegen-Zeile, ggf. Policen-Bitte, dann „Zum Schluss: Die Einladung mit
//      Kalendereintrag geht an … Stimmt die Adresse?“ [Ja, stimmt] [Andere Adresse]; ohne Adresse die freiwillige Frage
//      danach. Ohne Antwort geht die Einladung nach 30 Min. trotzdem raus, ohne Adresse ein Link per WhatsApp
//      (lib/whatsapp/einladung-rueckfall.ts).
// Ablauf und Versand: lib/whatsapp/termin-strecke.ts. Keine Gedankenstriche, kurze Sätze, keine Versprechen.

import { a, type Ansprache } from "@/lib/ansprache";
import type { Variante } from "@/lib/experimente";
import { terminArtRegel, type TerminFormate, type TerminModus } from "@/lib/termin-formate";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { angabenFuerSparte, spartenDesLeads, type AngabenQuelle, type Folgefrage, type RechnerSparte } from "@/lib/preise/rechner-angaben";
import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";

// Vermittler-Nennung zentral (Ole, 17.11.2026, lib/vermittler-nennung.ts): Sie „Herr/Frau Nachname“, gebeugt; Du Vorname
import type { VermittlerName } from "@/lib/vermittler-nennung";
export { vermittlerName, type VermittlerName } from "@/lib/vermittler-nennung";

type Form = { label: string; value: string }[];
const wert = (formular: Form, re: RegExp) => formular.find((x) => re.test(x.label))?.value?.trim() || null;

const SPARTE_WORT: [RegExp, string][] = [
  [/haftpflicht/i, "Haftpflicht"],
  [/hausrat/i, "Hausrat"],
  [/rechtsschutz/i, "Rechtsschutz"],
  [/wohngeb(ä|a)ude/i, "Wohngebäude"],
  [/unfall/i, "Unfall"],
];

/** Sparten im Interesse als Wörter: [„Haftpflicht“, „Hausrat“] (ohne Tierhalterhaftpflicht). */
function spartenWorte(interesse: string | null): string[] {
  const t = (interesse ?? "").replace(/tierhalter-?\s*haftpflicht/gi, "");
  return SPARTE_WORT.filter(([re]) => re.test(t)).map(([, x]) => x);
}

/** „Haftpflicht- und Hausratversicherung“, „Haftpflichtversicherung“, „Haftpflicht-, Hausrat- und Unfallversicherung“. */
export function versicherungWort(interesse: string | null): string {
  const w = spartenWorte(interesse);
  if (!w.length) return "Absicherung";
  if (w.length === 1) return `${w[0]}versicherung`;
  return `${w.slice(0, -2).map((x) => `${x}-, `).join("")}${w.at(-2)}- und ${w.at(-1)}versicherung`;
}

const liste = (w: string[]) => (w.length <= 1 ? (w[0] ?? "") : `${w.slice(0, -1).join(", ")} und ${w.at(-1)}`);

/** Bekannte Angabe aus Formular bzw. Angaben des Assistenten (Conversation.qualificationData). */
function angabe(formular: Form, angaben: unknown, re: RegExp, keys: QualificationKey[]): string | null {
  const f = wert(formular, re);
  if (f) return f;
  const q = qualificationPoints(angaben);
  for (const k of keys) {
    const hit = q.find((p) => p.key === k)?.value;
    if (hit) return hit;
  }
  return null;
}

/** Lebenssituation aus Formular bzw. Chat: „Familie mit Kindern“, „Paar“ … */
export function lebenssituationAus(formular: Form, angaben?: unknown): string | null {
  return angabe(formular, angaben, /lebenssituation|familienstand|zu versichernde/i, ["lebenssituation", "versichern"]);
}

/** Familie mit Kindern (für „Sie und Ihre Familie“)? */
export function istFamilie(formular: Form, angaben?: unknown): boolean {
  return /kind|familie/i.test(lebenssituationAus(formular, angaben) ?? "");
}

const TIER_AKK = { katze: ["deine Katze", "Ihre Katze"], hund: ["deinen Hund", "Ihren Hund"], pferd: ["dein Pferd", "Ihr Pferd"], tier: ["dein Tier", "Ihr Tier"] } as const;

/**
 * Nutzen des Termins in einem Satz, konkret aus den bekannten Angaben (Ole, 17.11.2026): „In einem kurzen Videotermin
 * zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten.“
 * Kein „doppelt zahlen“, keine Versprechen zu Preisen, Ersparnis oder Eignung.
 */
export function terminNutzenSatz(o: { source: string | null | undefined; formular: Form; angaben?: unknown; an: Ansprache; person: VermittlerName; video?: boolean; kostenlos?: boolean }): string {
  const { an, person } = o;
  const p = outreachProdukt(o.source);
  const purpose = p?.purpose ?? null;
  // Splittest terminvorschlag_kostenlos (lib/experimente.ts): Fassung b mit „kostenlosen“
  const kurz = o.kostenlos ? "kurzen, kostenlosen" : "kurzen";
  const art = o.video === false ? `In einem ${kurz} Termin` : `In einem ${kurz} Videotermin`;
  const zeigt = `${art} zeigt ${a(an, "dir", "Ihnen")} ${person.nom},`;
  const achten = a(an, "und worauf du achten solltest", "und worauf Sie achten sollten");
  if (purpose === "outreach_tkv") {
    const name = wert(o.formular, /tiername|name des tieres/i);
    const tier = name ?? TIER_AKK[p?.tier ?? "tier"][an === "du" ? 0 : 1];
    const was = /\bop\b|op-|operation/i.test(o.source ?? "") ? "eine OP-Versicherung" : "eine Krankenversicherung";
    return `${zeigt} was ${was} für ${tier} kostet ${achten}.`;
  }
  if (purpose === "outreach_pkv") {
    const privat = /privat/i.test(angabe(o.formular, o.angaben, /gesetzlich oder privat|aktuelle versicherung/i, ["vorhanden"]) ?? "");
    if (privat) return `${art} geht ${person.nom} ${a(an, "deinen Tarif mit dir", "Ihren Tarif mit Ihnen")} durch und zeigt ${a(an, "dir", "Ihnen")}, worauf ${a(an, "du achten solltest", "Sie achten sollten")}.`;
    return `${zeigt} was eine private Krankenversicherung für ${a(an, "dich", "Sie")} kostet ${achten}.`;
  }
  if (purpose === "outreach_zahn") return `${zeigt} was eine Zahnzusatzversicherung für ${a(an, "dich", "Sie")} kostet ${achten}.`;
  if (purpose === "outreach_privatschutz") {
    const interesse = angabe(o.formular, o.angaben, /versicherungsinteresse/i, ["interesse"]) ?? o.source ?? null;
    const leben = (lebenssituationAus(o.formular, o.angaben) ?? "").toLowerCase();
    const fuer = /kind|familie/.test(leben)
      ? a(an, "deine Familie", "Ihre Familie")
      : /paar|partner|verheiratet|zu zweit/.test(leben)
        ? a(an, "euch beide", "Sie beide")
        : a(an, "dich", "Sie");
    const w = spartenWorte(interesse);
    if (!w.length) return `${zeigt} was ein guter Schutz für ${fuer} kostet ${achten}.`;
    return `${zeigt} was ${liste(w)} für ${fuer} ${w.length > 1 ? "kosten" : "kostet"} ${achten}.`;
  }
  return `${zeigt} was ein passender Schutz für ${a(an, "dich", "Sie")} kostet ${achten}.`;
}

const TZ = "Europe/Berlin";
const tagKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** „heute um 16 Uhr“, „morgen um 10:30 Uhr“, „Donnerstag, 19.11. um 10 Uhr“ (deutsche Zeit). */
export function zeitKurz(d: Date, now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  const uhr = parts.minute === "00" ? `${Number(parts.hour)} Uhr` : `${Number(parts.hour)}:${parts.minute} Uhr`;
  const morgen = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (tagKey(d) === tagKey(now)) return `heute um ${uhr}`;
  if (tagKey(d) === tagKey(morgen)) return `morgen um ${uhr}`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(d);
  return `${tag} um ${uhr}`;
}

/** „Mittwoch, 18.11. um 10 Uhr“ (für die Buchungsnachricht, immer mit Wochentag und Datum). */
export function zeitLang(d: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  const uhr = parts.minute === "00" ? `${Number(parts.hour)} Uhr` : `${Number(parts.hour)}:${parts.minute} Uhr`;
  return `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(d)} um ${uhr}`;
}

/** Knopftitel einer Zeit (WhatsApp: höchstens 20 Zeichen): „Heute 16 Uhr“, „Morgen 10:30 Uhr“, „Do. 19.11. 10 Uhr“. */
export function knopfZeit(d: Date, now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  const uhr = parts.minute === "00" ? `${Number(parts.hour)} Uhr` : `${Number(parts.hour)}:${parts.minute} Uhr`;
  const morgen = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (tagKey(d) === tagKey(now)) return `Heute ${uhr}`;
  if (tagKey(d) === tagKey(morgen)) return `Morgen ${uhr}`;
  const wd = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short" }).format(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  const lang = `${wd} ${dm} ${uhr}`;
  return lang.length <= 20 ? lang : `${wd} ${dm} ${uhr.replace(" Uhr", "")}`.slice(0, 20);
}

/** Interaktiver Knopf: id = Payload (lib/whatsapp/knopf.ts), title = Text (höchstens 20 Zeichen). */
export type Knopf = { id: string; title: string };

/** Payload eines Zeit-Knopfs (wie lib/whatsapp/knopf.ts slotPayload). */
const SLOT = (iso: string) => `slot:${iso}`;

/** Knöpfe zum Terminvorschlag: zwei Zeiten (Payload slot:<ISO>) und „Andere Zeit“. */
export function terminKnoepfe(starts: readonly string[], now = new Date()): Knopf[] {
  return [...starts.slice(0, 2).map((iso) => ({ id: SLOT(iso), title: knopfZeit(new Date(iso), now) })), { id: "andere_zeit", title: "Andere Zeit" }];
}

/**
 * Terminvorschlag (Ole, 17.11.2026), von der App geschickt (Werkzeug termin_vorschlagen), mit Knöpfen
 * [Heute 16 Uhr] [Morgen 10 Uhr] [Andere Zeit]: „Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was
 * Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder
 * morgen um 10 Uhr?“ erneut = zweiter Vorschlag (nach „Andere Zeit“): ohne Nutzensatz.
 */
export function terminVorschlagText(o: {
  an: Ansprache;
  source: string | null | undefined;
  formular: Form;
  angaben?: unknown;
  person: VermittlerName;
  zeiten: [string, string];
  dank?: boolean;
  /** Ein kurzer eigener Satz statt „Danke!“ (z. B. Antwort auf eine Frage des Leads) */
  einleitung?: string | null;
  video?: boolean;
  erneut?: boolean;
  /** Splittest terminvorschlag_kostenlos, Fassung b: „In einem kurzen, kostenlosen Videotermin …“ */
  kostenlos?: boolean;
}): string {
  const frage = a(o.an, `Passt dir ${o.zeiten[0]} oder ${o.zeiten[1]}?`, `Passt Ihnen ${o.zeiten[0]} oder ${o.zeiten[1]}?`);
  const einleitung = o.einleitung?.replace(/\s+/g, " ").trim() || (o.dank === false || o.erneut ? null : "Danke!");
  const nutzen = o.erneut ? null : terminNutzenSatz({ source: o.source, formular: o.formular, angaben: o.angaben, an: o.an, person: o.person, video: o.video, kostenlos: o.kostenlos });
  return [einleitung, nutzen, frage].filter(Boolean).join(" ");
}

/** Nachfassen 2 Std. nach einem unbeantworteten Terminvorschlag (lib/lead-sequences.ts, mit denselben Knöpfen). */
export function terminNachfassText(an: Ansprache, person: VermittlerName, zeiten: [string, string], video = true): string {
  const art = video ? "den Videotermin" : "den Termin";
  return a(an, `Kurze Nachfrage: Passt dir ${zeiten[0]} oder ${zeiten[1]} für ${art} mit ${person.dat}?`, `Kurze Nachfrage: Passt Ihnen ${zeiten[0]} oder ${zeiten[1]} für ${art} mit ${person.dat}?`);
}

/** Höchstens so viele Punkte in der Bereitlegen-Liste (Ole, 17.11.2026). */
export const MAX_BEREITLEGEN = 3;

/** Punkt „bestehende Verträge und Policen“ (nur bei Komplettcheck „Ja“). */
export const VERTRAEGE_BEREITLEGEN_RE = /bestehenden Verträge und Policen/;

/**
 * Was der Lead zum Termin bereitlegen soll (Ole, 17.11.2026; P2): höchstens 3 Punkte je Produkt, die wichtigsten,
 * nichts doppelt zu bereits Erfragtem.
 *   - „bestehende Verträge und Policen“ nur bei Komplettcheck „Ja“ (dann oben),
 *   - bei Familie die Geburtsdaten der Mitversicherten, für alle Sparten (nicht nur Unfall),
 *   - die IBAN immer zuletzt.
 */
export function bereitlegenListe(
  source: string | null | undefined,
  sparten: readonly RechnerSparte[],
  an: Ansprache,
  opts: { quelle?: AngabenQuelle; komplettcheck?: boolean } = {},
): string[] {
  const purpose = outreachProdukt(source)?.purpose;
  const iban = a(an, "deine IBAN, falls du direkt abschließen möchtest", "Ihre IBAN, falls Sie direkt abschließen möchten");
  const vertraege = opts.komplettcheck ? [a(an, "deine bestehenden Verträge und Policen", "Ihre bestehenden Verträge und Policen")] : [];
  const quelle = opts.quelle ?? { formular: [], angaben: null };
  const familie = istFamilie(quelle.formular, quelle.angaben);
  const geburtsdaten = "die Geburtsdaten aller Personen, die mitversichert werden sollen";
  const mit = (extra: string[]) => [...vertraege, ...extra.slice(0, Math.max(0, MAX_BEREITLEGEN - 1 - vertraege.length)), iban];
  if (purpose === "outreach_tkv") return mit([a(an, "die Chipnummer deines Tieres", "die Chipnummer Ihres Tieres")]);
  if (purpose === "outreach_pkv") return mit([a(an, "deine aktuelle Police mit dem letzten Beitragsschreiben", "Ihre aktuelle Police mit dem letzten Beitragsschreiben"), ...(familie ? [geburtsdaten] : [])]);
  if (purpose === "outreach_zahn") return mit(familie ? [geburtsdaten] : []);
  if (purpose !== "outreach_privatschutz" && !sparten.length) return vertraege;
  const unbekannt = (sparte: RechnerSparte, key: string) => !angabenFuerSparte(quelle, sparte).find((x) => x.key === key)?.wert;
  return mit([
    ...(sparten.includes("hausrat") && unbekannt("hausrat", "wohnflaeche") ? [a(an, "die Wohnfläche deiner Wohnung", "die Wohnfläche Ihrer Wohnung")] : []),
    ...(familie ? [geburtsdaten] : []),
    ...(sparten.some((s) => s.startsWith("tierhalter")) ? ["die Chipnummer jedes Tieres"] : []),
  ]);
}

/**
 * Bereitlegen-Liste für einen Lead aus Produkt, Formular und Chat-Angaben (eine Quelle für WhatsApp-Schluss,
 * Termin-Mails und die Vorlage „Termin: Vorbereitung“, Ole 18.11.2026, M3). Rein.
 */
export function bereitlegenFuerLead(o: { source: string | null | undefined; formular: Form; angaben?: unknown; an: Ansprache; komplettcheck?: boolean }): string[] {
  const quelle: AngabenQuelle = { formular: o.formular, angaben: o.angaben ?? null };
  return bereitlegenListe(o.source, spartenDesLeads(o.source, quelle), o.an, { quelle, komplettcheck: o.komplettcheck === true });
}

/** Formularantworten (Lead.formData) als Liste aus Beschriftung und Wert; Ungültiges fällt weg. */
export function formularAus(raw: unknown): Form {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label as string, value: x.value as string }] : []));
}

/** Punkte der Bereitlegen-Liste als Aufzählung (erster Buchstabe groß, z. B. für Mails). */
export function bereitlegenPunkte(liste: readonly string[]): string[] {
  return liste.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}

/**
 * Komplettcheck-Satz für Termin-Mails (nur bei Komplettcheck „Ja“), ohne Dauer in Minuten (Ole, 17.11.2026; Leitmotiv
 * „doppelt zahlen und sparen“, Ole 19.11.2026, passt zu beiden Fassungen der Frage): „Wie gewünscht schaut Herr
 * Kannapinn im Termin auch kurz, wo Sie vielleicht doppelt zahlen und sparen können und ob Sie insgesamt gut
 * abgesichert sind.“
 */
export function komplettcheckMailSatz(an: Ansprache, person: { nom: string }, familie: boolean): string {
  const wer = familie
    ? a(an, "wo ihr als Familie vielleicht doppelt zahlt und sparen könnt und ob ihr insgesamt gut abgesichert seid", "wo Sie und Ihre Familie vielleicht doppelt zahlen und sparen können und ob Sie insgesamt gut abgesichert sind")
    : a(an, "wo du vielleicht doppelt zahlst und sparen kannst und ob du insgesamt gut abgesichert bist", "wo Sie vielleicht doppelt zahlen und sparen können und ob Sie insgesamt gut abgesichert sind");
  return `Wie gewünscht schaut ${person.nom} im Termin auch kurz, ${wer}.`;
}

/** Frühere Kalenderfrage (bis 17.11.2026; Knöpfe in alten Nachrichten werden weiter verarbeitet, kalenderAntwort). */
export function kalenderFrage(an: Ansprache): string {
  return a(an, "*Hast du dir den Termin schon im Kalender eingetragen?*", "*Haben Sie sich den Termin schon im Kalender eingetragen?*");
}

/**
 * Dank nach der Zusage auf die Kalenderfrage (Ole, 17.11.2026): ohne Namen des Leads, Vermittler nach Regel (Dativ),
 * z. B. „Vielen Dank! Ihr Termin mit Herrn Kannapinn am Mittwoch, 18.11. um 10 Uhr ist vermerkt. Bis dahin!“
 */
export function zusageDank(an: Ansprache, person: { dat: string }, start: Date): string {
  return a(an, `Danke dir! Dein Termin mit ${person.dat} am ${zeitLang(start)} ist vermerkt. Bis dahin!`, `Vielen Dank! Ihr Termin mit ${person.dat} am ${zeitLang(start)} ist vermerkt. Bis dahin!`);
}

/** Erkennt die Kalenderfrage in einer Nachricht von uns. */
export const KALENDER_FRAGE_RE = /den Termin schon im Kalender eingetragen\?/;

/** Knöpfe zur Kalenderfrage (Antwort lib/whatsapp/knopf.ts → zugesagt). */
export const KALENDER_KNOEPFE: Knopf[] = [
  { id: "kalender:ja", title: "Ja" },
  { id: "kalender:gleich", title: "Mache ich gleich" },
];

/**
 * Komplettcheck nach der Buchung (Ole, 17.11.2026), zentral zum Feilen; [Person] = „Herr Kannapinn“. Knöpfe
 * „Ja, gern“ / „Nein, danke“. Bei Familie „Sie und Ihre Familie“. Fassung a (bisher) im Splittest komplettcheck_text.
 */
export const KOMPLETTCHECK_TEXT = {
  sie: "Danke! Soll [Person] im Termin auch kurz schauen, ob Sie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
  sieFamilie: "Danke! Soll [Person] im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
  du: "Danke! Soll [Person] im Termin auch kurz schauen, ob du insgesamt gut abgesichert bist und wo du vielleicht etwas sparen kannst? Das dauert nur ein paar Minuten länger.",
  duFamilie: "Danke! Soll [Person] im Termin auch kurz schauen, ob du und deine Familie insgesamt gut abgesichert seid und wo ihr vielleicht etwas sparen könnt? Das dauert nur ein paar Minuten länger.",
} as const;

/**
 * Fassung b (Ole, 19.11.2026: Kernbotschaft „doppelt zahlen und sparen“), Standard außerhalb des Splittests: Nutzen
 * konkret über doppelte Verträge und Sparen, „können“ statt Versprechen, kostenlos, keine Minutenangabe.
 */
export const KOMPLETTCHECK_TEXT_B = {
  sie: "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll [Person] im Termin kurz drüberschauen, wo Sie vielleicht doppelt zahlen und sparen können? Kostenlos und nur ein paar Minuten länger.",
  sieFamilie: "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll [Person] im Termin kurz drüberschauen, wo Sie und Ihre Familie vielleicht doppelt zahlen und sparen können? Kostenlos und nur ein paar Minuten länger.",
  du: "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll [Person] im Termin kurz drüberschauen, wo du vielleicht doppelt zahlst und sparen kannst? Kostenlos und nur ein paar Minuten länger.",
  duFamilie: "Danke! Oft zahlen Menschen für dieselbe Absicherung doppelt. Soll [Person] im Termin kurz drüberschauen, wo ihr als Familie vielleicht doppelt zahlt und sparen könnt? Kostenlos und nur ein paar Minuten länger.",
} as const;

/** Komplettcheck-Frage für Ansprache und Lebenssituation; variante a = bisher (KOMPLETTCHECK_TEXT), b = neu (Standard). */
export function komplettcheckFrage(an: Ansprache, person: VermittlerName, familie: boolean, variante: Variante = "b"): string {
  const T = variante === "a" ? KOMPLETTCHECK_TEXT : KOMPLETTCHECK_TEXT_B;
  const t = an === "du" ? (familie ? T.duFamilie : T.du) : familie ? T.sieFamilie : T.sie;
  return t.split("[Person]").join(person.nom);
}

/** Erkennt die Komplettcheck-Frage (beide Fassungen) in einer Nachricht von uns. */
export const KOMPLETTCHECK_RE = /im Termin auch kurz schauen, ob .+ insgesamt gut abgesichert|im Termin kurz drüberschauen, wo .+ doppelt zahl/;

/** Knöpfe zum Komplettcheck (Payload, damit „Nein, danke“ nicht als „kein Bedarf“ gilt). */
export const KOMPLETTCHECK_KNOEPFE: Knopf[] = [
  { id: "komplettcheck:ja", title: "Ja, gern" },
  { id: "komplettcheck:nein", title: "Nein, danke" },
];

/**
 * Bei Komplettcheck „Ja“ (nach den Angebotsfragen, P2): Frage nach den bestehenden Verträgen (eigene Nachricht, ohne
 * Knöpfe). einleitung: „Super!“ direkt nach dem Knopf, „Danke!“ nach der letzten Angebotsfrage.
 */
export function vertragsFrage(an: Ansprache, familie: boolean, einleitung = "Super!", person?: { nom: string } | null): string {
  const wer = familie
    ? a(an, "Welche Versicherungen habt ihr als Familie heute schon?", "Welche Versicherungen haben Sie und Ihre Familie heute schon?")
    : a(an, "Welche Versicherungen hast du heute schon?", "Welche Versicherungen haben Sie heute schon?");
  // Grund in einem Halbsatz (Leitmotiv „doppelt zahlen“, Ole 19.11.2026): wer weiß wofür, antwortet eher
  const warum = person ? `${a(an, `Damit ${person.nom} sieht, ob du irgendwo doppelt zahlst:`, `Damit ${person.nom} sieht, ob Sie irgendwo doppelt zahlen:`)} ` : "";
  return `${einleitung} ${warum}${wer} Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Versicherer.`;
}

/** Erkennt die Vertragsfrage in einer Nachricht von uns. */
export const VERTRAGSFRAGE_RE = /Welche Versicherungen ha(ben|st|bt) .*heute schon\?/;

/** Bereitlegen in einer Zeile (Schluss der Strecke): Kurzformen der Punkte aus bereitlegenListe. */
const BEREITLEGEN_KURZ: [RegExp, (an: Ansprache) => string][] = [
  [/bestehenden Verträge/, (an) => a(an, "deine bestehenden Verträge", "Ihre bestehenden Verträge")],
  [/übrigen Policen/, (an) => a(an, "deine übrigen Policen", "Ihre übrigen Policen")],
  [/aktuelle Police/, (an) => a(an, "deine aktuelle Police mit dem letzten Beitragsschreiben", "Ihre aktuelle Police mit dem letzten Beitragsschreiben")],
  [/Wohnfläche/, () => "die Wohnfläche"],
  [/Geburtsdaten/, () => "die Geburtsdaten der Mitversicherten"],
  [/Chipnummer/, () => "die Chipnummer"],
  [/IBAN/, (an) => a(an, "deine IBAN für einen direkten Abschluss", "Ihre IBAN für einen direkten Abschluss")],
];

/**
 * Bereitlegen als ein Satz (Ole, 17.11.2026 spät: die ausführliche Liste kommt in Mail und Vortags-Erinnerung):
 * „Legen Sie zum Termin gern bereit: die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.“
 * null = nichts bereitzulegen.
 */
export function bereitlegenKurz(liste: string[], an: Ansprache): string | null {
  const w = liste.slice(0, MAX_BEREITLEGEN).map((x) => BEREITLEGEN_KURZ.find(([re]) => re.test(x))?.[1](an) ?? x);
  if (!w.length) return null;
  const l = w.length === 1 ? w[0] : `${w.slice(0, -1).join(", ")} und ${w.at(-1)}`;
  return a(an, `Leg zum Termin gern bereit: ${l}.`, `Legen Sie zum Termin gern bereit: ${l}.`);
}

/** Schlussfrage zur Adresse (Knöpfe EMAIL_KNOEPFE): „Zum Schluss: Die Einladung mit Kalendereintrag geht an …“ */
export function emailBestaetigenFrage(email: string): string {
  return `Zum Schluss: Die Einladung mit Kalendereintrag geht an ${email}. Stimmt die Adresse?`;
}

/** Erkennt die Schlussfrage zur Adresse in einer Nachricht von uns. */
export const EMAIL_BESTAETIGEN_RE = /Die Einladung mit Kalendereintrag geht an \S+\. Stimmt die Adresse\?/;

/** Knöpfe zur Schlussfrage (Antwort lib/whatsapp/knopf.ts → termin-strecke.ts emailBestaetigt bzw. emailAndere). */
export const EMAIL_KNOEPFE: Knopf[] = [
  { id: "email:ja", title: "Ja, stimmt" },
  { id: "email:andere", title: "Andere Adresse" },
];

/** Schlussfrage ohne bekannte Adresse (freiwillig, ohne Knöpfe). */
export function emailFrageFreiwillig(an: Ansprache): string {
  return a(
    an,
    "Zum Schluss: Möchtest du die Einladung mit Kalendereintrag per E-Mail? Dann schreib mir einfach deine Adresse.",
    "Zum Schluss: Möchten Sie die Einladung mit Kalendereintrag per E-Mail? Dann schreiben Sie mir einfach Ihre Adresse.",
  );
}

/** Nach „Andere Adresse“: Frage nach der neuen Adresse. */
export function andereAdresseFrage(an: Ansprache): string {
  return a(an, "Gern! An welche E-Mail-Adresse soll die Einladung gehen?", "Gern! An welche E-Mail-Adresse soll die Einladung gehen?");
}

/** Erkennt eine offene Frage nach der Adresse (Schluss ohne Adresse bzw. nach „Andere Adresse“) in einer Nachricht von uns. */
export const EMAIL_FRAGE_RE = /An welche E-Mail-Adresse soll die Einladung gehen\?|Dann schreib(en Sie)? mir einfach (deine|Ihre) Adresse\./;

/** Letzter Satz der Strecke: „Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, …“ */
export function schlussSatz(an: Ansprache): string {
  return a(
    an,
    "Trag dir den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreib mir einfach hier.",
    "Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.",
  );
}

/**
 * Nach „Die Einladung ist unterwegs“ (Ole, 18.11.2026): Frage mit Knöpfen, ob der Termin im Kalender steht. Knopftitel
 * höchstens 20 Zeichen (WhatsApp), deshalb „Nein, bitte nochmal“ statt „Nein, bitte nochmal schicken“.
 */
export function eingetragenFrage(an: Ansprache): string {
  return a(an, "Konntest du den Termin in deinem Kalender eintragen?", "Konnten Sie den Termin in Ihrem Kalender eintragen?");
}

export const EINGETRAGEN_KNOEPFE: Knopf[] = [
  { id: "eingetragen:ja", title: "Ja, eingetragen" },
  { id: "eingetragen:nein", title: "Nein, bitte nochmal" },
];

/** Antwort auf „Ja, eingetragen“: kurzer Dank, fertig. */
export function eingetragenDank(an: Ansprache, start: Date): string {
  return a(an, `Super, danke dir! Dann bis ${zeitLang(start)}.`, `Super, vielen Dank! Dann bis ${zeitLang(start)}.`);
}

/**
 * Antwort auf „Nein, bitte nochmal“: Termin als Text und Links zum Eintragen (Google-Kalender, Kalenderdatei für Apple,
 * Outlook und andere). Ohne Links (Termin nicht ladbar) nur der Text.
 */
export function kalenderNochmalText(o: { an: Ansprache; start: Date; person: { dat: string }; google?: string | null; ics?: string | null; ort?: string | null }): string {
  const kopf = a(o.an, `Kein Problem, hier ist dein Termin noch einmal: *${zeitLang(o.start)}* mit ${o.person.dat}.`, `Kein Problem, hier ist Ihr Termin noch einmal: *${zeitLang(o.start)}* mit ${o.person.dat}.`);
  const links = [o.google ? `Google-Kalender: ${o.google}` : "", o.ics ? `Apple, Outlook und andere: ${o.ics}` : ""].filter(Boolean);
  const tipp = links.length ? a(o.an, "Einfach antippen, dann öffnet sich der Kalendereintrag.", "Einfach antippen, dann öffnet sich der Kalendereintrag.") : "";
  return [kopf, o.ort ? `Adresse: ${o.ort}` : "", links.join("\n"), tipp].filter(Boolean).join("\n\n");
}

/** Antwort auf „Ja, stimmt“ bzw. eine neue Adresse: „Super, die Einladung ist unterwegs. …“ (mit Adresse bei neuer). */
export function einladungUnterwegs(an: Ansprache, email?: string | null): string {
  return `${email ? `Danke, die Einladung ist an ${email} unterwegs.` : "Super, die Einladung ist unterwegs."} ${schlussSatz(an)}`;
}

/** Adresse erkennbar gemeint (mit „@“), aber unvollständig. */
export function adresseUnvollstaendig(an: Ansprache): string {
  return a(
    an,
    "Die Adresse scheint nicht vollständig zu sein. Schreib sie mir bitte noch einmal, z. B. name@beispiel.de.",
    "Die Adresse scheint nicht vollständig zu sein. Schreiben Sie sie mir bitte noch einmal, z. B. name@beispiel.de.",
  );
}

/**
 * Schluss der Strecke (Ole, 17.11.2026 spät), kurz: „Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn
 * notiert. Legen Sie zum Termin gern bereit: …“, ggf. die Policen-Bitte (P2: jeder Lead einmal), dann
 * „Zum Schluss: Die Einladung mit Kalendereintrag geht an … Stimmt die Adresse?“ (Knöpfe EMAIL_KNOEPFE) bzw. ohne
 * Adresse die freiwillige Frage danach. einleitung ersetzt den ersten Satz (nach dem Komplettcheck).
 */
export function abschlussText(o: {
  an: Ansprache;
  person: VermittlerName;
  /** Bereitlegen-Liste (bereitlegenListe), hier als ein Satz (bereitlegenKurz) */
  bereitlegen: string[];
  email: string | null;
  nachFragen: boolean;
  einleitung?: string | null;
  /** Policen-Bitte (P2: jeder Lead einmal), wenn sie noch nicht kam (lib/policen/regeln.ts policenBitteKurz/-Eng) */
  policen?: string | null;
}): string {
  const erst = o.einleitung ?? (o.nachFragen ? `Danke, damit sind alle wichtigen Angaben für ${o.person.dat} notiert.` : null);
  const teile = [[erst, bereitlegenKurz(o.bereitlegen, o.an)].filter(Boolean).join(" "), o.policen ?? "", o.email ? emailBestaetigenFrage(o.email) : emailFrageFreiwillig(o.an)];
  return teile.filter(Boolean).join("\n\n");
}

/** Erster Satz des Abschlusses nach dem Komplettcheck: „Nein, danke“, Verträge genannt bzw. keine Antwort. */
export function abschlussEinleitung(an: Ansprache, person: VermittlerName, art: "komplett_nein" | "vertraege" | "ohne_antwort"): string {
  if (art === "komplett_nein") return `Alles klar, damit ist alles Wichtige für ${person.dat} notiert.`;
  if (art === "vertraege") return `Danke, das schaut sich ${person.nom} im Termin mit an.`;
  return a(an, `Damit ist alles Wichtige für ${person.dat} notiert.`, `Damit ist alles Wichtige für ${person.dat} notiert.`);
}

/** Knöpfe, die zu einer Nachricht von uns gehören (Adresse am Schluss, Komplettcheck, Ja/Nein-Angabe). Rein. */
export function knoepfeFuerText(text: string | null | undefined, folgefragen: readonly Folgefrage[] = []): Knopf[] | null {
  const t = text ?? "";
  if (EMAIL_BESTAETIGEN_RE.test(t)) return EMAIL_KNOEPFE;
  if (KALENDER_FRAGE_RE.test(t)) return KALENDER_KNOEPFE;
  if (KOMPLETTCHECK_RE.test(t)) return KOMPLETTCHECK_KNOEPFE;
  const fr = folgefragen.find((f) => f.knoepfe?.length && (t.includes(f.sie) || t.includes(f.du)));
  if (fr?.knoepfe) return fr.knoepfe.map((k) => ({ id: `folge:${fr.key}:${k.toLowerCase()}`, title: k }));
  return null;
}

/**
 * Satz der Buchungsnachricht (Ole, 17.11.2026 spät), zentral zum Feilen. [Person] = „Herr Kannapinn“. Ohne erfundene
 * Knappheit und ohne Frage.
 */
export const BUCHUNG_SATZ = {
  video: {
    sie: "[Person] hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.",
    du: "[Person] hält sich die Zeit nur für dich frei und bereitet deine Beiträge vor.",
  },
  phone: {
    sie: "[Person] hält sich die Zeit nur für Sie frei, ruft Sie an und bereitet Ihre Beiträge vor.",
    du: "[Person] hält sich die Zeit nur für dich frei, ruft dich an und bereitet deine Beiträge vor.",
  },
  onsite: {
    sie: "[Person] hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.",
    du: "[Person] hält sich die Zeit nur für dich frei und bereitet deine Beiträge vor.",
  },
} as const;

/**
 * Buchungsnachricht, kurz (Ole, 17.11.2026 spät, höchstens 3 Zeilen): „Ihr Videotermin ist gebucht: *Mittwoch, 18.11.
 * um 11 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.\nIhr Link: …“. Ohne
 * Frage, ohne E-Mail (die Adresse bestätigt der Lead am Schluss der Strecke), Telefontermin ohne Link.
 */
export function buchungsText(o: { an: Ansprache; start: Date; mode: TerminModus; meetUrl: string | null; person: VermittlerName; ort?: string | null }): string {
  const wann = `*${zeitLang(o.start)}*`;
  const satz = a(o.an, BUCHUNG_SATZ[o.mode].du, BUCHUNG_SATZ[o.mode].sie).split("[Person]").join(o.person.nom);
  const kopf =
    o.mode === "video"
      ? a(o.an, "Dein Videotermin ist gebucht:", "Ihr Videotermin ist gebucht:")
      : o.mode === "onsite"
        ? a(o.an, "Dein Termin vor Ort ist gebucht:", "Ihr Termin vor Ort ist gebucht:")
        : a(o.an, "Dein Telefontermin ist gebucht:", "Ihr Telefontermin ist gebucht:");
  const link =
    o.mode === "video" && o.meetUrl
      ? `\n${a(o.an, "Dein Link:", "Ihr Link:")} ${o.meetUrl}`
      : o.mode === "onsite" && o.ort
        ? `\nAdresse: ${o.ort}`
        : "";
  return `${kopf} ${wann}. ${satz}${link}`;
}

/**
 * Wunschzeit (Live-Test Ole, 17.11.2026: „Mittwoch um 16h“ ist frei, trotzdem kamen zwei Zeiten zur Auswahl): Nennt der
 * Lead Tag und Uhrzeit und ist sie frei, wird direkt gebucht. Nur bei belegter Zeit oder nur Tag/Tageszeit: zwei Zeiten.
 */
export const WUNSCHZEIT_REGEL =
  "Nennt der Lead eine konkrete Zeit (Tag und Uhrzeit, z. B. „Mittwoch um 16 Uhr“) und ist genau diese Zeit unter den freien Zeiten von get_available_slots: frag nicht noch einmal nach und biete keine zweite Zeit an, sondern buche sie direkt mit book_appointment (gleiche Regeln zur E-Mail-Adresse wie unten). Nur wenn sie belegt ist oder er nur einen Tag bzw. eine Tageszeit nennt: termin_vorschlagen mit erneut=true und den zwei nächstgelegenen freien start-Werten (bei belegter Zeit als einleitung kurz: „Um 16 Uhr ist leider schon belegt.“).";

/** Prompt-Block Terminvorschlag und Buchung (vor dem Termin). beispiel = terminVorschlagText mit Platzhaltern. */
export function terminRegeln(o: { an: Ansprache; person: VermittlerName; formate: TerminFormate; beispiel: string; emailBekannt: boolean }): string {
  return [
    "Terminvorschlag (sobald die Fragen vor dem Termin geklärt sind, hat Vorrang vor anderen Terminregeln):",
    "- Nutze termin_vorschlagen: Die App schickt den Vorschlag selbst, mit zwei freien Videozeiten als Knöpfe und „Andere Zeit“. Schreib dazu keinen eigenen Text und nenne keine Zeiten selbst. Kein Link, keine Buchungsseite.",
    `- So sieht der Vorschlag aus: „${o.beispiel}“`,
    "- Hat der Lead in seiner letzten Nachricht etwas gefragt, gib die kurze Antwort als einleitung mit (ein Satz, statt „Danke!“).",
    "- Keine Floskeln wie „das Gespräch vorbereiten“, keine Versprechen zu Preisen, Ersparnis oder Ergebnissen.",
    terminArtRegel(o.an, o.formate),
    "- Passt keine der beiden Zeiten („Andere Zeit“): frag kurz nach Wunschtag oder Tageszeit und hole dann mit get_available_slots freie Zeiten.",
    `- ${WUNSCHZEIT_REGEL}`,
    o.emailBekannt
      ? "- Wählt der Lead eine Zeit (Knopf oder Text): Die E-Mail-Adresse ist bekannt, frag nicht danach. Buche sofort mit book_appointment (modus video, außer bei einem erlaubten ausdrücklichen Wunsch, siehe Terminart) und genau dem start-Wert der gewählten Zeit."
      : "- Wählt der Lead eine Zeit (Knopf oder Text): Buche sofort mit book_appointment (modus video, außer bei einem erlaubten ausdrücklichen Wunsch, siehe Terminart) und genau dem start-Wert der gewählten Zeit, auch ohne E-Mail-Adresse. Frag vorher nicht danach: Die App fragt am Schluss selbst nach der Adresse für die Einladung.",
    "- Nach book_appointment schickt die App die Buchungsnachricht mit Link selbst und danach die nächste Frage. Schreib dazu nichts Eigenes.",
  ].join("\n");
}

/**
 * Prompt-Block nach der Buchung (Reihenfolge P2, Ole 17.11.2026): Komplettcheck, Angebotsfragen je eine Nachricht, bei
 * Komplettcheck „Ja“ Vertragsfrage, Schluss mit der Frage nach der E-Mail-Adresse (bestätigen bzw. freiwillig nennen).
 */
export function nachBuchungRegel(o: {
  an: Ansprache;
  person: VermittlerName;
  fragen: { text: string; feld: string }[];
  /** Frage nach der E-Mail-Adresse offen (Schluss ohne Adresse bzw. nach „Andere Adresse“) */
  emailOffen?: boolean;
  /** Schlussfrage „Stimmt die Adresse?“ offen */
  adresseBestaetigenOffen?: boolean;
  /** Komplettcheck-Frage schon gestellt (sonst schickt die App sie gleich selbst) */
  komplettcheckGestellt?: boolean;
  /** Komplettcheck-Frage schon gestellt, aber noch nicht beantwortet */
  komplettcheckOffen?: boolean;
  abschlussGesendet: boolean;
  /** Adresse bestätigt bzw. Termin zugesagt */
  zugesagt: boolean;
}): string {
  const lines = ["Nach der Buchung (der Termin steht):"];
  const gestellt = o.komplettcheckGestellt ?? true;
  if (o.emailOffen) {
    lines.push(
      "- Offen ist die Frage nach der E-Mail-Adresse für die Einladung mit Kalendereintrag. Nennt der Lead eine Adresse, nutze update_email. Möchte er keine angeben, ist das in Ordnung: kurz bestätigen (der Termin bleibt gebucht), keine weitere Frage.",
    );
  } else if (o.adresseBestaetigenOffen) {
    lines.push(
      "- Offen ist die Schlussfrage, ob die E-Mail-Adresse für die Einladung stimmt. Bestätigt der Lead (auch frei formuliert, z. B. „ja“, „passt“), nutze termin_zugesagt. Nennt er eine andere Adresse, nutze update_email. Schreib nichts dazu, die App antwortet selbst.",
    );
  } else if (!gestellt) {
    lines.push("- Die App schickt gleich selbst die nächste Frage. Beantworte nur kurz, was der Lead geschrieben hat, und stell keine eigene Frage.");
  } else if (o.komplettcheckOffen) {
    lines.push(
      `- Offen ist die Frage, ob ${o.person.nom} im Termin auch kurz über die übrigen Versicherungen schauen soll (Komplettcheck: wo der Lead vielleicht doppelt zahlt und sparen kann). Antwortet er darauf (ja oder nein, auch frei formuliert), nutze komplettcheck mit ja=true bzw. ja=false. Die App schickt dann die nächste Nachricht selbst: schreib nichts dazu.`,
    );
  } else if (o.fragen.length) {
    lines.push(
      `- Angebotsfragen, nur für die Beitragsberechnung, genau in dieser Reihenfolge, je eine eigene Nachricht, jede Antwort mit record_qualification festhalten: ${o.fragen.map((f, i) => `${i + 1}. „${f.text}“ (angaben.${f.feld})`).join(" ")}`,
      "- Was der Lead im Chat schon beantwortet hat, überspringst du. Frag nichts anderes: keine Selbstbeteiligung, Summen oder Tarife (legt der Vermittler im Termin fest), keine Tiere ohne Tierhalterhaftpflicht, nie Gesundheitsangaben.",
      "- Kommt die Antwort per Knopf („Ja“, „Nein“), ist sie die Antwort auf genau diese Frage.",
      "- Nach der Antwort auf die letzte Frage: festhalten und nichts weiter fragen. Die App schickt die nächste Nachricht selbst.",
    );
  } else if (!o.abschlussGesendet) {
    lines.push("- Alle Angaben fürs Angebot liegen vor. Die App schickt die nächsten Nachrichten (bei Komplettcheck die Frage nach den Verträgen, dann den Schluss mit der Frage nach der E-Mail-Adresse) selbst: stell keine weitere Frage.");
  } else {
    lines.push("- Alle Angaben fürs Angebot liegen vor: stell keine weiteren Fragen dazu.");
  }
  lines.push(
    o.zugesagt ? "- Die Adresse für die Einladung ist bestätigt: frag nicht mehr danach." : "- Frag nicht selbst nach der E-Mail-Adresse oder dem Kalendereintrag: Das macht die App am Schluss.",
    "- Nennt der Lead eine (andere) E-Mail-Adresse: nutze update_email, die Einladung geht dann (neu) raus.",
    `- ${o.person.nom} hält sich die Zeit nur für den Lead frei. Kommt etwas dazwischen, lieber verschieben als ausfallen lassen. Keine erfundene Knappheit.`,
    "- Nenne nie eine konkrete Dauer des Termins in Minuten (z. B. „45 Minuten“, „60 statt 30 Minuten“): Die Dauer passt die App nur im Kalender an.",
  );
  return lines.join("\n");
}
