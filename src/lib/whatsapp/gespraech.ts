// Termin-Strecke des WhatsApp-Assistenten (Ole, 17.11.2026), reine Textbausteine, testbar ohne LLM:
//   1. Terminvorschlag: Nutzen für den Kunden (gut abgesichert, aus den bekannten Angaben), der Vermittler als Person
//      („Herr Kannapinn zeigt Ihnen …“), genau zwei konkrete Videozeiten, kein Link, kein Telefon (Kundeneinstellung
//      „nur Video“, AgentConfig.videoOnly).
//   2. Buchungsnachricht: Termin fett, Videolink, „Herr Kannapinn reserviert diese Zeit nur für Sie.“ Ohne Frage, wenn
//      danach noch Angebotsfragen folgen (lib/preise/rechner-angaben.ts folgefragen), sonst gleich mit Abschluss.
//   3. Abschluss: Angaben notiert, was zum Termin bereitliegen soll, E-Mail mit Kalendereintrag, und als einzige
//      Bestätigungsfrage ganz am Schluss: „Haben Sie sich den Termin schon im Kalender eingetragen?“ (ja = zugesagt).
// Keine Gedankenstriche, kurze Sätze, keine Versprechen.

import { a, type Ansprache, type Salutation } from "@/lib/ansprache";
import { vornameAus } from "@/lib/advisor-name";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import type { RechnerSparte } from "@/lib/preise/rechner-angaben";

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

/** „Haftpflicht- und Hausratversicherung“, „Haftpflichtversicherung“, „Haftpflicht-, Hausrat- und Unfallversicherung“. */
export function versicherungWort(interesse: string | null): string {
  const t = (interesse ?? "").replace(/tierhalter-?\s*haftpflicht/gi, "");
  const w = SPARTE_WORT.filter(([re]) => re.test(t)).map(([, x]) => x);
  if (!w.length) return "Absicherung";
  if (w.length === 1) return `${w[0]}versicherung`;
  return `${w.slice(0, -2).map((x) => `${x}-, `).join("")}${w.at(-2)}- und ${w.at(-1)}versicherung`;
}

/**
 * Ein Satz zum Ziel des Kunden (gut abgesichert), aus den bekannten Angaben abgeleitet. Keine Versprechen, keine
 * Preise, nichts zur Eignung eines Tarifs.
 */
export function nutzenSatz(source: string | null | undefined, formular: Form, an: Ansprache): string {
  const p = outreachProdukt(source);
  const purpose = p?.purpose ?? null;
  if (purpose === "outreach_tkv") {
    const name = wert(formular, /tiername|name des tieres/i);
    const tier = name ?? a(an, `dein${p?.tier === "katze" ? "e Katze" : p?.tier === "hund" ? " Hund" : p?.tier === "pferd" ? " Pferd" : " Tier"}`, `Ihr${p?.tier === "katze" ? "e Katze" : p?.tier === "hund" ? " Hund" : p?.tier === "pferd" ? " Pferd" : " Tier"}`);
    return `Damit ${tier} bei Tierarztkosten gut abgesichert ist, kommt es auf den passenden Schutz an.`;
  }
  if (purpose === "outreach_pkv") {
    const lange = wert(formular, /wie lange in pkv/i);
    const privat = /privat/i.test(wert(formular, /gesetzlich oder privat/i) ?? "");
    if (privat && lange && /10|zehn/.test(lange)) return a(an, "Nach über 10 Jahren in der privaten Krankenversicherung lohnt sich ein Blick auf deinen Tarif.", "Nach über 10 Jahren in der privaten Krankenversicherung lohnt sich ein Blick auf Ihren Tarif.");
    if (privat) return a(an, "Ein regelmäßiger Blick auf deinen Tarif ist sinnvoll.", "Ein regelmäßiger Blick auf Ihren Tarif ist sinnvoll.");
    return a(an, "Damit du auch langfristig gut abgesichert bist, kommt es auf den passenden Tarif an.", "Damit Sie auch langfristig gut abgesichert sind, kommt es auf den passenden Tarif an.");
  }
  if (purpose === "outreach_zahn") return a(an, "Damit du beim Zahnarzt gut abgesichert bist, kommt es auf den passenden Tarif an.", "Damit Sie beim Zahnarzt gut abgesichert sind, kommt es auf den passenden Tarif an.");
  if (purpose === "outreach_privatschutz") {
    const interesse = wert(formular, /versicherungsinteresse/i) ?? source ?? null;
    const leben = (wert(formular, /lebenssituation|familienstand/i) ?? "").toLowerCase();
    const vers = versicherungWort(interesse);
    const eine = vers === "Absicherung" ? "eine gute Absicherung" : `eine gute ${vers}`;
    if (/kind|familie/.test(leben)) return `Gerade mit Kindern ist ${eine} wichtig, damit ${a(an, "deine", "Ihre")} Familie im Ernstfall gut abgesichert ist.`;
    if (/paar|partner|verheiratet|zu zweit/.test(leben)) return `Zu zweit ist ${eine} wichtig, damit ${a(an, "ihr beide", "Sie beide")} im Ernstfall gut abgesichert ${a(an, "seid", "sind")}.`;
    return `${eine.charAt(0).toUpperCase()}${eine.slice(1)} ist wichtig, damit ${a(an, "du", "Sie")} im Ernstfall gut abgesichert ${a(an, "bist", "sind")}.`;
  }
  return a(an, "Damit du gut abgesichert bist, kommt es auf den passenden Schutz an.", "Damit Sie gut abgesichert sind, kommt es auf den passenden Schutz an.");
}

/** „Herr Kannapinn zeigt Ihnen in einem kurzen Videotermin, welcher Schutz zu Ihnen passt.“ */
export function zeigeSatz(source: string | null | undefined, an: Ansprache, person: VermittlerName, video = true): string {
  const purpose = outreachProdukt(source)?.purpose;
  const was = purpose === "outreach_pkv" || purpose === "outreach_zahn" ? "Tarif" : "Schutz";
  const art = video ? "in einem kurzen Videotermin" : "in einem kurzen Termin";
  return a(an, `${person.nom} zeigt dir ${art}, welcher ${was} zu dir passt.`, `${person.nom} zeigt Ihnen ${art}, welcher ${was} zu Ihnen passt.`);
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

/**
 * Terminvorschlag (Ole, 17.11.2026): „Danke! Gerade mit Kindern … Herr Kannapinn zeigt Ihnen in einem kurzen
 * Videotermin, welcher Schutz zu Ihnen passt. Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr?“
 */
export function terminVorschlagText(o: {
  an: Ansprache;
  source: string | null | undefined;
  formular: Form;
  person: VermittlerName;
  zeiten: [string, string];
  dank?: boolean;
  video?: boolean;
}): string {
  const frage = a(o.an, `Passt dir ${o.zeiten[0]} oder ${o.zeiten[1]}?`, `Passt Ihnen ${o.zeiten[0]} oder ${o.zeiten[1]}?`);
  return [o.dank === false ? null : "Danke!", nutzenSatz(o.source, o.formular, o.an), zeigeSatz(o.source, o.an, o.person, o.video !== false), frage].filter(Boolean).join(" ");
}

/** Was der Lead zum Termin bereitlegen soll (Ole, 15.11.2026, beibehalten), je Produkt und gewählten Sparten. */
export function bereitlegenListe(source: string | null | undefined, sparten: readonly RechnerSparte[], an: Ansprache): string[] {
  const purpose = outreachProdukt(source)?.purpose;
  const iban = a(an, "deine IBAN, falls du direkt abschließen möchtest", "Ihre IBAN, falls Sie direkt abschließen möchten");
  if (purpose === "outreach_tkv") return [a(an, "die Chipnummer deines Tieres", "die Chipnummer Ihres Tieres"), a(an, "deine bisherige Police, falls vorhanden", "Ihre bisherige Police, falls vorhanden"), iban];
  if (purpose === "outreach_pkv") return [a(an, "deine aktuelle Police mit dem letzten Beitragsschreiben", "Ihre aktuelle Police mit dem letzten Beitragsschreiben"), iban];
  if (purpose === "outreach_zahn") return [iban];
  if (purpose !== "outreach_privatschutz" && !sparten.length) return [];
  return [
    a(an, "deine bisherigen Policen, falls vorhanden", "Ihre bisherigen Policen, falls vorhanden"),
    "die Geburtsdaten aller Personen, die mitversichert werden sollen",
    iban,
    ...(sparten.includes("hausrat") ? ["bei Hausrat: die Wohnfläche und den ungefähren Wert von Fahrrädern bzw. E-Bikes"] : []),
    ...(sparten.includes("wohngebaeude") ? ["bei Wohngebäude: die bisherige Gebäudepolice, Baujahr und Wohnfläche"] : []),
    ...(sparten.some((s) => s.startsWith("tierhalter")) ? ["bei Tieren: die Chipnummer jedes Tieres"] : []),
  ];
}

/** Die einzige Bestätigungsfrage, ganz am Schluss der Termin-Strecke. */
export function kalenderFrage(an: Ansprache): string {
  return a(an, "*Hast du dir den Termin schon im Kalender eingetragen?*", "*Haben Sie sich den Termin schon im Kalender eingetragen?*");
}

/** Erkennt die Kalenderfrage in einer Nachricht von uns. */
export const KALENDER_FRAGE_RE = /den Termin schon im Kalender eingetragen\?/;

/**
 * Abschluss: „Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert. Bitte legen Sie zum Termin bereit:
 * … Die Einladung mit Kalendereintrag habe ich Ihnen an … geschickt. *Haben Sie sich den Termin schon im Kalender
 * eingetragen?*“
 */
export function abschlussText(o: { an: Ansprache; person: VermittlerName; bereitlegen: string[]; email: string | null; nachFragen: boolean }): string {
  const teile: string[] = [];
  if (o.nachFragen) teile.push(`Danke, damit sind alle wichtigen Angaben für ${o.person.dat} notiert.`);
  if (o.bereitlegen.length) teile.push(`${a(o.an, "Bitte leg zum Termin bereit:", "Bitte legen Sie zum Termin bereit:")}\n${o.bereitlegen.map((x) => `• ${x}`).join("\n")}`);
  const mail = o.email ? a(o.an, `Die Einladung mit Kalendereintrag habe ich dir an ${o.email} geschickt.`, `Die Einladung mit Kalendereintrag habe ich Ihnen an ${o.email} geschickt.`) : "";
  teile.push([mail, kalenderFrage(o.an)].filter(Boolean).join(" "));
  return teile.join("\n\n");
}

/**
 * Buchungsnachricht: „Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 10 Uhr*. Hier ist Ihr Link: … Herr Kannapinn
 * reserviert diese Zeit nur für Sie.“ Mit abschluss (keine Angebotsfragen offen) gleich mit der Kalenderfrage am Ende.
 */
export function buchungsText(o: { an: Ansprache; start: Date; mode: "video" | "phone"; meetUrl: string | null; person: VermittlerName; abschluss?: string | null }): string {
  const wann = `*${zeitLang(o.start)}*`;
  const kopf =
    o.mode === "video"
      ? `${a(o.an, "Dein Videotermin ist gebucht:", "Ihr Videotermin ist gebucht:")} ${wann}.${o.meetUrl ? `\n${a(o.an, "Hier ist dein Link:", "Hier ist Ihr Link:")} ${o.meetUrl}` : ""}`
      : `${a(o.an, "Dein Telefontermin ist gebucht:", "Ihr Telefontermin ist gebucht:")} ${wann}. ${a(o.an, `${o.person.nom} ruft dich auf dieser Nummer an.`, `${o.person.nom} ruft Sie auf dieser Nummer an.`)}`;
  const reserviert = a(o.an, `${o.person.nom} reserviert diese Zeit nur für dich.`, `${o.person.nom} reserviert diese Zeit nur für Sie.`);
  return [`${kopf}\n${reserviert}`, o.abschluss].filter(Boolean).join("\n\n");
}

/** Prompt-Block Terminvorschlag und Buchung (vor dem Termin). beispiel = terminVorschlagText mit Platzhaltern. */
export function terminRegeln(o: { an: Ansprache; person: VermittlerName; videoOnly: boolean; beispiel: string; emailBekannt: boolean }): string {
  return [
    "Terminvorschlag (sobald die Fragen vor dem Termin geklärt sind, hat Vorrang vor anderen Terminregeln):",
    "- Hole frische Zeiten mit get_available_slots und schlage genau zwei konkrete Zeiten vor, so geschrieben wie in der Liste (z. B. „heute um 16 Uhr“, „morgen um 10 Uhr“). Kein Link, keine Buchungsseite.",
    `- Aufbau in kurzen Sätzen: kurzer Dank, ein Satz zum Ziel des Leads (gut abgesichert, abgeleitet aus seinen Angaben), dann was ${o.person.nom} im Termin zeigt, dann die zwei Zeiten als eine Frage. Zum Beispiel: „${o.beispiel}“`,
    "- Keine Floskeln wie „das Gespräch vorbereiten“, keine Versprechen zu Preisen, Ersparnis oder Ergebnissen.",
    o.videoOnly
      ? "- Nur Videotermine: Biete ausschließlich Video an und erwähne Telefon nicht. Nur wenn der Lead Video ausdrücklich ablehnt oder nicht kann, buche einen Telefontermin (modus phone)."
      : "- Biete die Zeiten als Videotermin an (Video zuerst). Möchte der Lead lieber telefonieren, buche Telefon.",
    "- Passt keine der beiden Zeiten: frag nach Wunschtag oder Tageszeit und schlag dann zwei neue Zeiten vor.",
    o.emailBekannt
      ? "- Wählt der Lead eine Zeit: Die E-Mail-Adresse ist bekannt, frag nicht danach. Buche sofort mit book_appointment (modus video)."
      : "- Wählt der Lead eine Zeit: frag in einer eigenen Nachricht nach seiner E-Mail-Adresse für die Einladung mit Kalendereintrag, dann buche mit book_appointment (modus video). Möchte er keine angeben, buche ohne.",
    "- Nach book_appointment schickt die App die Buchungsnachricht mit Link selbst und danach die erste Angebotsfrage. Schreib dazu nichts Eigenes.",
  ].join("\n");
}

/** Prompt-Block nach der Buchung: Angebotsfragen je eine Nachricht, Abschluss mit Kalenderfrage, Zusage. */
export function nachBuchungRegel(o: {
  an: Ansprache;
  person: VermittlerName;
  fragen: { text: string; feld: string }[];
  abschluss: string;
  abschlussGesendet: boolean;
  zugesagt: boolean;
}): string {
  const lines = ["Nach der Buchung (der Termin steht):"];
  if (o.fragen.length) {
    lines.push(
      `- Angebotsfragen, nur für die Beitragsberechnung, genau in dieser Reihenfolge, je eine eigene Nachricht, jede Antwort mit record_qualification festhalten: ${o.fragen.map((f, i) => `${i + 1}. „${f.text}“ (angaben.${f.feld})`).join(" ")}`,
      "- Was der Lead im Chat schon beantwortet hat, überspringst du. Frag nichts anderes: keine Selbstbeteiligung, Summen, Lebensbereiche oder Tarife (legt der Vermittler im Termin fest), keine Tiere ohne Tierhalterhaftpflicht, nie Gesundheitsangaben.",
      `- Nach der Antwort auf die letzte Frage schickst du genau diese Abschlussnachricht:\n„${o.abschluss}“`,
    );
  } else if (!o.abschlussGesendet) {
    lines.push(`- Alle Angaben fürs Angebot liegen vor. Schick jetzt genau diese Abschlussnachricht (keine weitere Frage):\n„${o.abschluss}“`);
  } else {
    lines.push("- Alle Angaben fürs Angebot liegen vor: stell keine weiteren Fragen dazu.");
  }
  lines.push(
    o.zugesagt
      ? "- Der Lead hat den Termin schon im Kalender (zugesagt): frag nicht mehr danach."
      : `- Antwortet der Lead auf die Kalenderfrage mit ja (sinngemäß, auch „erledigt“, „hab ich“): nutze termin_zugesagt und bedank dich kurz. Mit nein: bitte ihn freundlich, es gleich zu tun, die Einladung mit Kalendereintrag ${a(o.an, "hast du", "haben Sie")} per E-Mail.`,
    "- Nennt der Lead eine andere E-Mail-Adresse: nutze update_email, die Einladung geht dann neu raus.",
    `- ${o.person.nom} reserviert die Zeit nur für den Lead. Kommt etwas dazwischen, lieber verschieben als ausfallen lassen. Keine erfundene Knappheit.`,
  );
  return lines.join("\n");
}
