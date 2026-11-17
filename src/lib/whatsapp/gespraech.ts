// Termin-Strecke des WhatsApp-Assistenten (Ole, 17.11.2026), reine Textbausteine, testbar ohne LLM:
//   1. Terminvorschlag (von der App, Werkzeug termin_vorschlagen): ein Satz Nutzen, konkret aus den bekannten Angaben
//      („In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und
//      worauf Sie achten sollten.“), genau zwei Videozeiten als Knöpfe plus „Andere Zeit“ (Payload slot:<ISO>).
//   2. Buchungsnachricht: Termin fett, Videolink, verbindlicher Absatz (BUCHUNG_VERBINDLICH), ohne Frage.
//   3. Angebotsfragen nach der Rechner-Tabelle (lib/preise/rechner-angaben.ts), Ja/Nein-Angaben mit Knöpfen.
//   4. Komplettcheck (Knöpfe „Ja, gern“ / „Nein, danke“); bei „Ja“ die Frage nach bestehenden Verträgen
//      (lib/whatsapp/vorvertraege.ts), Kennzeichen am Termin (Appointment.komplettcheck).
//   5. Abschluss: höchstens 3 Punkte zum Bereitlegen, E-Mail mit Kalendereintrag und als einzige Bestätigungsfrage ganz
//      am Schluss die Kalenderfrage (Knöpfe „Ja“ / „Mache ich gleich“ → zugesagt).
// Ablauf und Versand: lib/whatsapp/termin-strecke.ts. Keine Gedankenstriche, kurze Sätze, keine Versprechen.

import { a, type Ansprache, type Salutation } from "@/lib/ansprache";
import { vornameAus } from "@/lib/advisor-name";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { angabenFuerSparte, type AngabenQuelle, type Folgefrage, type RechnerSparte } from "@/lib/preise/rechner-angaben";
import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";

/** Der Vermittler gegenüber Leads: nom „Herr Kannapinn“, dat „Herrn Kannapinn“ (mit, von), Du „Ole“. */
export type VermittlerName = { nom: string; dat: string };

/**
 * Vermittler als Person (Ole, 17.11.2026): Sie „Herr/Frau Nachname“ mit Anrede aus den Anbieterangaben, ohne Anrede
 * Vor- und Nachname; Du der Vorname. Der Agenturname (fallback) nur, wenn kein Personenname bekannt ist.
 */
export function vermittlerName(an: Ansprache, opts: { name?: string | null; anrede?: Salutation | null; fallback: string }): VermittlerName {
  const name = (opts.name ?? "").replace(/\s+/g, " ").trim();
  const words = name.split(" ").filter(Boolean);
  const person = words.length >= 2 && !!vornameAus(name);
  if (an === "du") {
    const v = vornameAus(name);
    const n = v ?? opts.fallback;
    return { nom: n, dat: n };
  }
  if (!person) return { nom: opts.fallback, dat: opts.fallback };
  if (opts.anrede) {
    const last = words.at(-1)!;
    return { nom: `${opts.anrede} ${last}`, dat: `${opts.anrede === "Herr" ? "Herrn" : "Frau"} ${last}` };
  }
  return { nom: name, dat: name };
}

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
export function terminNutzenSatz(o: { source: string | null | undefined; formular: Form; angaben?: unknown; an: Ansprache; person: VermittlerName; video?: boolean }): string {
  const { an, person } = o;
  const p = outreachProdukt(o.source);
  const purpose = p?.purpose ?? null;
  const art = o.video === false ? "In einem kurzen Termin" : "In einem kurzen Videotermin";
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
}): string {
  const frage = a(o.an, `Passt dir ${o.zeiten[0]} oder ${o.zeiten[1]}?`, `Passt Ihnen ${o.zeiten[0]} oder ${o.zeiten[1]}?`);
  const einleitung = o.einleitung?.replace(/\s+/g, " ").trim() || (o.dank === false || o.erneut ? null : "Danke!");
  const nutzen = o.erneut ? null : terminNutzenSatz({ source: o.source, formular: o.formular, angaben: o.angaben, an: o.an, person: o.person, video: o.video });
  return [einleitung, nutzen, frage].filter(Boolean).join(" ");
}

/** Nachfassen 2 Std. nach einem unbeantworteten Terminvorschlag (lib/lead-sequences.ts, mit denselben Knöpfen). */
export function terminNachfassText(an: Ansprache, person: VermittlerName, zeiten: [string, string], video = true): string {
  const art = video ? "den Videotermin" : "den Termin";
  return a(an, `Kurze Nachfrage: Passt dir ${zeiten[0]} oder ${zeiten[1]} für ${art} mit ${person.dat}?`, `Kurze Nachfrage: Passt Ihnen ${zeiten[0]} oder ${zeiten[1]} für ${art} mit ${person.dat}?`);
}

/** Höchstens so viele Punkte in der Bereitlegen-Liste (Ole, 17.11.2026). */
export const MAX_BEREITLEGEN = 3;

/**
 * Was der Lead zum Termin bereitlegen soll: höchstens 3 Punkte je Produkt, die wichtigsten, nichts doppelt zu bereits
 * Erfragtem (Ole, 17.11.2026). Die bisherigen Policen stehen oben (TKV: nach der Chipnummer), die IBAN zuletzt.
 */
export function bereitlegenListe(
  source: string | null | undefined,
  sparten: readonly RechnerSparte[],
  an: Ansprache,
  opts: { quelle?: AngabenQuelle; komplettcheck?: boolean } = {},
): string[] {
  const purpose = outreachProdukt(source)?.purpose;
  const iban = a(an, "deine IBAN, falls du direkt abschließen möchtest", "Ihre IBAN, falls Sie direkt abschließen möchten");
  const policen = opts.komplettcheck
    ? a(an, "deine bisherigen Policen, gern auch von deinen anderen Verträgen", "Ihre bisherigen Policen, gern auch von Ihren anderen Verträgen")
    : a(an, "deine bisherigen Policen, falls vorhanden", "Ihre bisherigen Policen, falls vorhanden");
  if (purpose === "outreach_tkv") return opts.komplettcheck ? [policen, a(an, "die Chipnummer deines Tieres", "die Chipnummer Ihres Tieres"), iban] : [a(an, "die Chipnummer deines Tieres", "die Chipnummer Ihres Tieres"), policen, iban];
  if (purpose === "outreach_pkv") return [...(opts.komplettcheck ? [policen] : []), a(an, "deine aktuelle Police mit dem letzten Beitragsschreiben", "Ihre aktuelle Police mit dem letzten Beitragsschreiben"), iban];
  if (purpose === "outreach_zahn") return opts.komplettcheck ? [policen, iban] : [iban];
  if (purpose !== "outreach_privatschutz" && !sparten.length) return opts.komplettcheck ? [policen] : [];
  const quelle = opts.quelle ?? { formular: [], angaben: null };
  const unbekannt = (sparte: RechnerSparte, key: string) => !angabenFuerSparte(quelle, sparte).find((x) => x.key === key)?.wert;
  const familie = istFamilie(quelle.formular, quelle.angaben);
  const extra = [
    ...(sparten.includes("hausrat") && unbekannt("hausrat", "wohnflaeche") ? [a(an, "die Wohnfläche deiner Wohnung", "die Wohnfläche Ihrer Wohnung")] : []),
    ...(sparten.includes("unfall") && familie ? ["die Geburtsdaten aller Personen, die mitversichert werden sollen"] : []),
    ...(sparten.some((s) => s.startsWith("tierhalter")) ? ["die Chipnummer jedes Tieres"] : []),
  ];
  return [policen, ...extra.slice(0, MAX_BEREITLEGEN - 2), iban];
}

/** Die einzige Bestätigungsfrage, ganz am Schluss der Termin-Strecke (Knöpfe „Ja“ / „Mache ich gleich“). */
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
 * „Ja, gern“ / „Nein, danke“. Bei Familie „Sie und Ihre Familie“.
 */
export const KOMPLETTCHECK_TEXT = {
  sie: "Danke! Soll [Person] im Termin auch kurz schauen, ob Sie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
  sieFamilie: "Danke! Soll [Person] im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.",
  du: "Danke! Soll [Person] im Termin auch kurz schauen, ob du insgesamt gut abgesichert bist und wo du vielleicht etwas sparen kannst? Das dauert nur ein paar Minuten länger.",
  duFamilie: "Danke! Soll [Person] im Termin auch kurz schauen, ob du und deine Familie insgesamt gut abgesichert seid und wo ihr vielleicht etwas sparen könnt? Das dauert nur ein paar Minuten länger.",
} as const;

/** Komplettcheck-Frage (KOMPLETTCHECK_TEXT) für Ansprache und Lebenssituation. */
export function komplettcheckFrage(an: Ansprache, person: VermittlerName, familie: boolean): string {
  const t = an === "du" ? (familie ? KOMPLETTCHECK_TEXT.duFamilie : KOMPLETTCHECK_TEXT.du) : familie ? KOMPLETTCHECK_TEXT.sieFamilie : KOMPLETTCHECK_TEXT.sie;
  return t.split("[Person]").join(person.nom);
}

/** Erkennt die Komplettcheck-Frage in einer Nachricht von uns. */
export const KOMPLETTCHECK_RE = /im Termin auch kurz schauen, ob .+ insgesamt gut abgesichert/;

/** Knöpfe zum Komplettcheck (Payload, damit „Nein, danke“ nicht als „kein Bedarf“ gilt). */
export const KOMPLETTCHECK_KNOEPFE: Knopf[] = [
  { id: "komplettcheck:ja", title: "Ja, gern" },
  { id: "komplettcheck:nein", title: "Nein, danke" },
];

/** Nach „Ja, gern“: Frage nach den bestehenden Verträgen (eigene Nachricht, ohne Knöpfe). */
export function vertragsFrage(an: Ansprache, familie: boolean): string {
  const wer = familie
    ? a(an, "Welche Versicherungen habt ihr als Familie heute schon?", "Welche Versicherungen haben Sie und Ihre Familie heute schon?")
    : a(an, "Welche Versicherungen hast du heute schon?", "Welche Versicherungen haben Sie heute schon?");
  return `Super! ${wer} Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Gesellschaft.`;
}

/** Erkennt die Vertragsfrage in einer Nachricht von uns. */
export const VERTRAGSFRAGE_RE = /Welche Versicherungen ha(ben|st|bt) .*heute schon\?/;

/**
 * Abschluss: „Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert. Bitte legen Sie zum Termin bereit:
 * … Die Einladung mit Kalendereintrag habe ich Ihnen an … geschickt. *Haben Sie sich den Termin schon im Kalender
 * eingetragen?*“ (Knöpfe „Ja“ / „Mache ich gleich“). einleitung ersetzt den ersten Satz (nach dem Komplettcheck).
 */
export function abschlussText(o: { an: Ansprache; person: VermittlerName; bereitlegen: string[]; email: string | null; nachFragen: boolean; einleitung?: string | null }): string {
  const teile: string[] = [];
  if (o.einleitung) teile.push(o.einleitung);
  else if (o.nachFragen) teile.push(`Danke, damit sind alle wichtigen Angaben für ${o.person.dat} notiert.`);
  if (o.bereitlegen.length) teile.push(`${a(o.an, "Bitte leg zum Termin bereit:", "Bitte legen Sie zum Termin bereit:")}\n${o.bereitlegen.slice(0, MAX_BEREITLEGEN).map((x) => `• ${x}`).join("\n")}`);
  const mail = o.email ? a(o.an, `Die Einladung mit Kalendereintrag habe ich dir an ${o.email} geschickt.`, `Die Einladung mit Kalendereintrag habe ich Ihnen an ${o.email} geschickt.`) : "";
  teile.push([mail, kalenderFrage(o.an)].filter(Boolean).join(" "));
  return teile.join("\n\n");
}

/** Erster Satz des Abschlusses nach dem Komplettcheck: „Nein, danke“, Verträge genannt bzw. keine Antwort. */
export function abschlussEinleitung(an: Ansprache, person: VermittlerName, art: "komplett_nein" | "vertraege" | "ohne_antwort"): string {
  if (art === "komplett_nein") return `Alles klar, damit ist alles Wichtige für ${person.dat} notiert.`;
  if (art === "vertraege") return `Danke, das schaut sich ${person.nom} im Termin mit an.`;
  return a(an, `Damit ist alles Wichtige für ${person.dat} notiert.`, `Damit ist alles Wichtige für ${person.dat} notiert.`);
}

/** Knöpfe, die zu einer Nachricht von uns gehören (Kalenderfrage, Komplettcheck, Ja/Nein-Angabe). Rein. */
export function knoepfeFuerText(text: string | null | undefined, folgefragen: readonly Folgefrage[] = []): Knopf[] | null {
  const t = text ?? "";
  if (KALENDER_FRAGE_RE.test(t)) return KALENDER_KNOEPFE;
  if (KOMPLETTCHECK_RE.test(t)) return KOMPLETTCHECK_KNOEPFE;
  const fr = folgefragen.find((f) => f.knoepfe?.length && (t.includes(f.sie) || t.includes(f.du)));
  if (fr?.knoepfe) return fr.knoepfe.map((k) => ({ id: `folge:${fr.key}:${k.toLowerCase()}`, title: k }));
  return null;
}

/**
 * Verbindlichkeits-Absatz der Buchungsnachricht (Ole, 17.11.2026), zentral zum Feilen. [Person] = „Herr Kannapinn“.
 * Ohne erfundene Knappheit und ohne Frage: die einzige Frage bleibt die Kalenderfrage am Schluss der Strecke.
 */
export const BUCHUNG_VERBINDLICH = {
  video: {
    sie: "[Person] hält sich diese Zeit nur für Sie frei und bereitet Ihre Beiträge vorab vor. Bitte seien Sie pünktlich dabei, der Link funktioniert direkt im Handy-Browser. Falls doch etwas dazwischenkommt, schreiben Sie mir einfach hier, dann finden wir eine neue Zeit.",
    du: "[Person] hält sich diese Zeit nur für dich frei und bereitet deine Beiträge vorab vor. Bitte sei pünktlich dabei, der Link funktioniert direkt im Handy-Browser. Falls doch etwas dazwischenkommt, schreib mir einfach hier, dann finden wir eine neue Zeit.",
  },
  phone: {
    sie: "[Person] hält sich diese Zeit nur für Sie frei und bereitet Ihre Beiträge vorab vor. Falls doch etwas dazwischenkommt, schreiben Sie mir einfach hier, dann finden wir eine neue Zeit.",
    du: "[Person] hält sich diese Zeit nur für dich frei und bereitet deine Beiträge vorab vor. Falls doch etwas dazwischenkommt, schreib mir einfach hier, dann finden wir eine neue Zeit.",
  },
} as const;

/**
 * Buchungsnachricht (Ole, 17.11.2026): „Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*.\nHier ist Ihr Link:
 * …\n\nHerr Kannapinn hält sich diese Zeit nur für Sie frei …“ (BUCHUNG_VERBINDLICH). Ohne Frage; mit abschluss gleich
 * mit Bereitlegen und Kalenderfrage am Ende.
 */
export function buchungsText(o: { an: Ansprache; start: Date; mode: "video" | "phone"; meetUrl: string | null; person: VermittlerName; abschluss?: string | null; email?: string | null }): string {
  const wann = `*${zeitLang(o.start)}*`;
  const kopf =
    o.mode === "video"
      ? `${a(o.an, "Dein Videotermin ist gebucht:", "Ihr Videotermin ist gebucht:")} ${wann}.${o.meetUrl ? `\n${a(o.an, "Hier ist dein Link:", "Hier ist Ihr Link:")} ${o.meetUrl}` : ""}`
      : `${a(o.an, "Dein Telefontermin ist gebucht:", "Ihr Telefontermin ist gebucht:")} ${wann}. ${a(o.an, `${o.person.nom} ruft dich auf dieser Nummer an.`, `${o.person.nom} ruft Sie auf dieser Nummer an.`)}`;
  const t = BUCHUNG_VERBINDLICH[o.mode === "video" && o.meetUrl ? "video" : "phone"];
  const verbindlich = a(o.an, t.du, t.sie).split("[Person]").join(o.person.nom);
  // Adresse der Einladung gleich nennen (Live-Test Ole, 17.11.2026), ohne zweite Frage: Korrektur per Antwort (update_email)
  const mail = o.email ? einladungAnText(o.an, o.email) : null;
  return [mail ? `${kopf}\n${mail}` : kopf, verbindlich, o.abschluss].filter(Boolean).join("\n\n");
}

/** „Die Einladung mit Kalendereintrag ist an … unterwegs. Falls die Adresse nicht stimmt, schreiben Sie mir einfach die richtige.“ */
export function einladungAnText(an: Ansprache, email: string): string {
  return a(
    an,
    `Die Einladung mit Kalendereintrag ist an ${email} unterwegs. Falls die Adresse nicht stimmt, schreib mir einfach die richtige.`,
    `Die Einladung mit Kalendereintrag ist an ${email} unterwegs. Falls die Adresse nicht stimmt, schreiben Sie mir einfach die richtige.`,
  );
}

/**
 * Wunschzeit (Live-Test Ole, 17.11.2026: „Mittwoch um 16h“ ist frei, trotzdem kamen zwei Zeiten zur Auswahl): Nennt der
 * Lead Tag und Uhrzeit und ist sie frei, wird direkt gebucht. Nur bei belegter Zeit oder nur Tag/Tageszeit: zwei Zeiten.
 */
export const WUNSCHZEIT_REGEL =
  "Nennt der Lead eine konkrete Zeit (Tag und Uhrzeit, z. B. „Mittwoch um 16 Uhr“) und ist genau diese Zeit unter den freien Zeiten von get_available_slots: frag nicht noch einmal nach und biete keine zweite Zeit an, sondern buche sie direkt mit book_appointment (gleiche Regeln zur E-Mail-Adresse wie unten). Nur wenn sie belegt ist oder er nur einen Tag bzw. eine Tageszeit nennt: termin_vorschlagen mit erneut=true und den zwei nächstgelegenen freien start-Werten (bei belegter Zeit als einleitung kurz: „Um 16 Uhr ist leider schon belegt.“).";

/** Prompt-Block Terminvorschlag und Buchung (vor dem Termin). beispiel = terminVorschlagText mit Platzhaltern. */
export function terminRegeln(o: { an: Ansprache; person: VermittlerName; videoOnly: boolean; beispiel: string; emailBekannt: boolean }): string {
  return [
    "Terminvorschlag (sobald die Fragen vor dem Termin geklärt sind, hat Vorrang vor anderen Terminregeln):",
    "- Nutze termin_vorschlagen: Die App schickt den Vorschlag selbst, mit zwei freien Videozeiten als Knöpfe und „Andere Zeit“. Schreib dazu keinen eigenen Text und nenne keine Zeiten selbst. Kein Link, keine Buchungsseite.",
    `- So sieht der Vorschlag aus: „${o.beispiel}“`,
    "- Hat der Lead in seiner letzten Nachricht etwas gefragt, gib die kurze Antwort als einleitung mit (ein Satz, statt „Danke!“).",
    "- Keine Floskeln wie „das Gespräch vorbereiten“, keine Versprechen zu Preisen, Ersparnis oder Ergebnissen.",
    o.videoOnly
      ? "- Nur Videotermine: Biete ausschließlich Video an und erwähne Telefon nicht. Nur wenn der Lead Video ausdrücklich ablehnt oder nicht kann, buche einen Telefontermin (modus phone)."
      : "- Biete die Zeiten als Videotermin an (Video zuerst). Möchte der Lead lieber telefonieren, buche Telefon.",
    "- Passt keine der beiden Zeiten („Andere Zeit“): frag kurz nach Wunschtag oder Tageszeit und hole dann mit get_available_slots freie Zeiten.",
    `- ${WUNSCHZEIT_REGEL}`,
    o.emailBekannt
      ? "- Wählt der Lead eine Zeit (Knopf oder Text): Die E-Mail-Adresse ist bekannt, frag nicht danach. Buche sofort mit book_appointment (modus video) und genau dem start-Wert der gewählten Zeit."
      : "- Wählt der Lead eine Zeit (Knopf oder Text): frag in einer eigenen Nachricht nach seiner E-Mail-Adresse für die Einladung mit Kalendereintrag, dann buche mit book_appointment (modus video) und genau dem start-Wert der gewählten Zeit. Möchte er keine angeben, buche ohne.",
    "- Nach book_appointment schickt die App die Buchungsnachricht mit Link selbst und danach die erste Angebotsfrage. Schreib dazu nichts Eigenes.",
  ].join("\n");
}

/** Prompt-Block nach der Buchung: Angebotsfragen je eine Nachricht, Komplettcheck, Abschluss mit Kalenderfrage, Zusage. */
export function nachBuchungRegel(o: {
  an: Ansprache;
  person: VermittlerName;
  fragen: { text: string; feld: string }[];
  /** Komplettcheck-Frage schon gestellt, aber noch nicht beantwortet */
  komplettcheckOffen?: boolean;
  abschlussGesendet: boolean;
  zugesagt: boolean;
}): string {
  const lines = ["Nach der Buchung (der Termin steht):"];
  if (o.fragen.length) {
    lines.push(
      `- Angebotsfragen, nur für die Beitragsberechnung, genau in dieser Reihenfolge, je eine eigene Nachricht, jede Antwort mit record_qualification festhalten: ${o.fragen.map((f, i) => `${i + 1}. „${f.text}“ (angaben.${f.feld})`).join(" ")}`,
      "- Was der Lead im Chat schon beantwortet hat, überspringst du. Frag nichts anderes: keine Selbstbeteiligung, Summen, Lebensbereiche oder Tarife (legt der Vermittler im Termin fest), keine Tiere ohne Tierhalterhaftpflicht, nie Gesundheitsangaben.",
      "- Kommt die Antwort per Knopf („Ja“, „Nein“), ist sie die Antwort auf genau diese Frage.",
      "- Nach der Antwort auf die letzte Frage: festhalten und nichts weiter fragen. Die App schickt die nächste Nachricht selbst.",
    );
  } else if (o.komplettcheckOffen) {
    lines.push(
      `- Offen ist die Frage, ob ${o.person.nom} im Termin auch schauen soll, ob der Lead insgesamt gut abgesichert ist. Antwortet er darauf (ja oder nein, auch frei formuliert), nutze komplettcheck mit ja=true bzw. ja=false. Die App schickt dann die nächste Nachricht selbst: schreib nichts dazu.`,
    );
  } else if (!o.abschlussGesendet) {
    lines.push("- Alle Angaben fürs Angebot liegen vor. Die App schickt die Abschlussnachricht mit der Kalenderfrage selbst: stell keine weitere Frage.");
  } else {
    lines.push("- Alle Angaben fürs Angebot liegen vor: stell keine weiteren Fragen dazu.");
  }
  lines.push(
    o.zugesagt
      ? "- Der Lead hat den Termin schon im Kalender (zugesagt): frag nicht mehr danach."
      : `- Antwortet der Lead auf die Kalenderfrage mit ja (sinngemäß, auch „erledigt“, „hab ich“, „mache ich gleich“): nutze termin_zugesagt und bedank dich kurz. Mit nein: bitte ihn freundlich, es gleich zu tun, die Einladung mit Kalendereintrag ${a(o.an, "hast du", "haben Sie")} per E-Mail.`,
    "- Nennt der Lead eine andere E-Mail-Adresse: nutze update_email, die Einladung geht dann neu raus.",
    `- ${o.person.nom} hält sich die Zeit nur für den Lead frei. Kommt etwas dazwischen, lieber verschieben als ausfallen lassen. Keine erfundene Knappheit.`,
  );
  return lines.join("\n");
}
