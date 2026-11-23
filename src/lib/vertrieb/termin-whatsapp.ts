// WhatsApp für Vertriebstermine von der Support-Nummer (Ole, 15./16.11.2026), Sie-Form:
// Bestätigung nach der Buchung (Calendly und eigene Buchungsseite /termin) sowie Erinnerung
// 24 Stunden und 1 Stunde vorher (runSalesWhatsAppReminders). Läuft erst, wenn die Support-Nummer
// verbunden und die jeweilige Vorlage von Meta freigegeben ist; Einreichen und Freigabe-Abgleich im
// WhatsApp-Cron (syncSupportTemplates).
// Fassung 2 (Ole, 17.11.2026): persönlich mit Ole Kannapinn als Absender, Varianten je Thema und Terminart.
// Fassung 1 läuft weiter, bis die passende Variante bei Meta freigegeben ist (waehleTerminVorlage).

import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { direktNachBestaetigung, erinnerungsFenster, vorlaufOk } from "@/lib/vertrieb/termin-erinnerungen";
import { decryptSecret } from "@/lib/encryption";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { addDaysYmd, berlinYmd } from "@/lib/absence";
import { anredeName } from "@/lib/ansprache";
import { createTemplate, listTemplates, sendTemplate, type CreateTemplateInput } from "@/lib/whatsapp/dialog360";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { findRemote, mapRemoteStatus, metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { renderTemplate } from "@/lib/whatsapp/templates";
import {
  ZAHLUNG_TEMPLATE_BODY_DU,
  ZAHLUNG_TEMPLATE_BODY_DU_V2,
  ZAHLUNG_TEMPLATE_BODY_SIE,
  ZAHLUNG_TEMPLATE_BODY_SIE_V2,
  ZAHLUNG_TEMPLATE_DU,
  ZAHLUNG_TEMPLATE_DU_V2,
  ZAHLUNG_TEMPLATE_EXAMPLES,
  ZAHLUNG_TEMPLATE_PURPOSE,
  ZAHLUNG_TEMPLATE_SIE,
  ZAHLUNG_TEMPLATE_SIE_V2,
} from "@/lib/angebot-zahlungserinnerung";
import { BONUS_TEMPLATE_PURPOSE, BONUS_VORLAGEN } from "@/lib/vertrieb/bonus-erinnerung";
import {
  NE_TEMPLATE_BODY,
  NE_TEMPLATE_BODY_B,
  NE_TEMPLATE_BODY_B_DU,
  NE_TEMPLATE_BODY_DU,
  NE_TEMPLATE_EXAMPLES,
  NE_TEMPLATE_EXAMPLES_DU,
  NE_TEMPLATE_NAME,
  NE_TEMPLATE_NAME_B,
  NE_TEMPLATE_NAME_B_DU,
  NE_TEMPLATE_NAME_DU,
  NE_TEMPLATE_PURPOSE,
} from "@/lib/vertrieb/nicht-erreicht";

export const TERMIN_TEMPLATE_NAME = "pg_vertrieb_termin_v1";
export const TERMIN_TEMPLATE_PURPOSE = "vertrieb_termin";
const LANGUAGE = "de";

export const TERMIN_TEMPLATE_BODY =
  "Guten Tag {{1}}, vielen Dank für Ihre Terminbuchung bei performancegrowth. Ihr Termin: {{2}} um {{3}} Uhr, {{4}}. " +
  "Zum Verschieben oder Absagen nutzen Sie bitte diesen Link: {{5}} Bei Fragen antworten Sie einfach auf diese Nachricht. " +
  "Viele Grüße, Ihr Team von performancegrowth";

export const TERMIN_TEMPLATE_EXAMPLES = [
  "Max Mustermann",
  "Dienstag, 18. November",
  "14:30",
  "per Video, den Link finden Sie in Ihrer Bestätigungsmail",
  "https://calendly.com/reschedulings/abc",
];

// Erinnerungen (Ole, 16.11.2026): 24 Stunden und 1 Stunde vorher, für die eigene Buchungsseite und Calendly.
export const ERINNERUNG_TEMPLATE_NAME = "pg_vertrieb_erinnerung_v1";
export const ERINNERUNG_TEMPLATE_BODY =
  "Guten Tag {{1}}, kurze Erinnerung an Ihren Termin mit performancegrowth: {{2}} um {{3}} Uhr, {{4}}. " +
  "Zum Verschieben oder Absagen nutzen Sie bitte diesen Link: {{5}} Viele Grüße, Ihr Team von performancegrowth";
export const ERINNERUNG_TEMPLATE_EXAMPLES = TERMIN_TEMPLATE_EXAMPLES;

export const GLEICH_TEMPLATE_NAME = "pg_vertrieb_gleich_v1";
export const GLEICH_TEMPLATE_BODY =
  "Guten Tag {{1}}, in einer Stunde beginnt Ihr Termin mit performancegrowth: heute um {{2}} Uhr, {{3}}. " +
  "Falls etwas dazwischenkommt, verschieben Sie den Termin bitte hier: {{4}} Viele Grüße, Ihr Team von performancegrowth";
export const GLEICH_TEMPLATE_EXAMPLES = ["Max Mustermann", "14:30", "per Video: https://meet.google.com/abc-defg-hij", "https://app.performancegrowth.de/termin/verwalten/abc"];

// ─── Fassung 2 (Ole, 17.11.2026): persönlich von Ole Kannapinn ─────────
// Je Terminart Varianten nach Thema (Meta-Leads-Call bzw. Entscheidungs-Call) und Art (Video mit Link als Parameter,
// Video mit Link in der Kalendereinladung, Telefon). Der Nutzen-Satz steht fest im Text: als Parameter wäre er für
// UTILITY zu werblich.
const NUTZEN = "wie Sie mit exklusiven Leads planbar neue Kundentermine bekommen";
const OLE = "Ole Kannapinn";

export type TerminArtKey = "termin" | "erinnerung" | "gleich";
export type Thema = "leads" | "entscheidung";
/** link: Video mit Link als Parameter; video: Link steht in der Kalendereinladung; telefon: Ole ruft an. */
export type Modus = "video" | "link" | "telefon";
type Param = "anrede" | "datum" | "zeit" | "art" | "videolink" | "link" | "linkV1";

type SupportTemplate = { name: string; body: string; examples: string[]; purpose: string };
export type TerminVorlage = SupportTemplate & { art: TerminArtKey; version: 1 | 2; thema: Thema | null; modus: Modus | null; params: Param[] };

const BEISPIEL: Record<Param, string> = {
  anrede: "Herr Mustermann",
  datum: "Dienstag, 18. November",
  zeit: "14:30",
  art: "per Video, den Link finden Sie in Ihrer Bestätigungsmail",
  videolink: "https://meet.google.com/abc-defg-hij",
  link: "https://app.performancegrowth.de/termin/verwalten/abc",
  linkV1: "https://calendly.com/reschedulings/abc",
};
const PURPOSE: Record<TerminArtKey, string> = { termin: TERMIN_TEMPLATE_PURPOSE, erinnerung: "vertrieb_erinnerung", gleich: "vertrieb_gleich" };

function v2(name: string, art: TerminArtKey, thema: Thema | null, modus: Modus, params: Param[], body: string): TerminVorlage {
  return { name, body, examples: params.map((p) => BEISPIEL[p]), purpose: PURPOSE[art], art, version: 2, thema, modus, params };
}

function bestaetigungText(thema: Thema, modus: Modus): string {
  const kanal = modus === "telefon" ? "am Telefon" : "per Video";
  const was =
    thema === "leads" ? `Wir sprechen am {{2}} um {{3}} Uhr ${kanal} darüber, ${NUTZEN}.` : `Am {{2}} um {{3}} Uhr besprechen wir ${kanal} Ihre offenen Fragen zum Angebot.`;
  const wie = modus === "telefon" ? "Ich rufe Sie an." : modus === "link" ? "Ihr Link zum Gespräch: {{4}}" : "Ihren Link finden Sie in der Kalendereinladung.";
  const n = modus === "link" ? 5 : 4;
  return `Guten Tag {{1}}, danke für Ihre Buchung! ${was} ${wie} Falls etwas dazwischenkommt: {{${n}}} Ich freue mich auf Sie! Viele Grüße, ${OLE}`;
}

function erinnerungText(thema: Thema, modus: "video" | "telefon"): string {
  const was =
    thema === "leads"
      ? modus === "telefon"
        ? `rufe ich Sie an und wir sprechen darüber, ${NUTZEN}.`
        : `sprechen wir per Video darüber, ${NUTZEN}.`
      : modus === "telefon"
        ? "rufe ich Sie an und wir besprechen Ihre offenen Fragen zum Angebot."
        : "besprechen wir per Video Ihre offenen Fragen zum Angebot.";
  return `Guten Tag {{1}}, morgen um {{2}} Uhr ${was} Ich freue mich darauf! Falls etwas dazwischenkommt: {{3}} Viele Grüße, ${OLE}`;
}

const T = ["anrede", "datum", "zeit", "link"] as Param[];
const T_LINK = ["anrede", "datum", "zeit", "videolink", "link"] as Param[];
const E = ["anrede", "zeit", "link"] as Param[];

/** Alle Vorlagen für Vertriebstermine, Fassung 1 (Team) und Fassung 2 (Ole persönlich). */
export const TERMIN_VORLAGEN: TerminVorlage[] = [
  { name: TERMIN_TEMPLATE_NAME, body: TERMIN_TEMPLATE_BODY, examples: TERMIN_TEMPLATE_EXAMPLES, purpose: TERMIN_TEMPLATE_PURPOSE, art: "termin", version: 1, thema: null, modus: null, params: ["anrede", "datum", "zeit", "art", "linkV1"] },
  { name: ERINNERUNG_TEMPLATE_NAME, body: ERINNERUNG_TEMPLATE_BODY, examples: ERINNERUNG_TEMPLATE_EXAMPLES, purpose: PURPOSE.erinnerung, art: "erinnerung", version: 1, thema: null, modus: null, params: ["anrede", "datum", "zeit", "art", "linkV1"] },
  { name: GLEICH_TEMPLATE_NAME, body: GLEICH_TEMPLATE_BODY, examples: GLEICH_TEMPLATE_EXAMPLES, purpose: PURPOSE.gleich, art: "gleich", version: 1, thema: null, modus: null, params: ["anrede", "zeit", "art", "linkV1"] },
  v2("pg_vertrieb_termin_v2", "termin", "leads", "video", T, bestaetigungText("leads", "video")),
  v2("pg_vertrieb_termin_link_v2", "termin", "leads", "link", T_LINK, bestaetigungText("leads", "link")),
  v2("pg_vertrieb_termin_tel_v2", "termin", "leads", "telefon", T, bestaetigungText("leads", "telefon")),
  v2("pg_vertrieb_termin_ent_v2", "termin", "entscheidung", "video", T, bestaetigungText("entscheidung", "video")),
  v2("pg_vertrieb_termin_ent_link_v2", "termin", "entscheidung", "link", T_LINK, bestaetigungText("entscheidung", "link")),
  v2("pg_vertrieb_termin_ent_tel_v2", "termin", "entscheidung", "telefon", T, bestaetigungText("entscheidung", "telefon")),
  v2("pg_vertrieb_erinnerung_v2", "erinnerung", "leads", "video", E, erinnerungText("leads", "video")),
  v2("pg_vertrieb_erinnerung_tel_v2", "erinnerung", "leads", "telefon", E, erinnerungText("leads", "telefon")),
  v2("pg_vertrieb_erinnerung_ent_v2", "erinnerung", "entscheidung", "video", E, erinnerungText("entscheidung", "video")),
  v2("pg_vertrieb_erinnerung_ent_tel_v2", "erinnerung", "entscheidung", "telefon", E, erinnerungText("entscheidung", "telefon")),
  v2(
    "pg_vertrieb_gleich_v2",
    "gleich",
    null,
    "video",
    E,
    `Guten Tag {{1}}, in einer Stunde sehen wir uns per Video, um {{2}} Uhr. Den Link finden Sie in Ihrer Kalendereinladung. Falls etwas dazwischenkommt: {{3}} Bis gleich, ${OLE}`,
  ),
  v2(
    "pg_vertrieb_gleich_link_v2",
    "gleich",
    null,
    "link",
    ["anrede", "zeit", "videolink", "link"],
    `Guten Tag {{1}}, in einer Stunde sehen wir uns per Video, um {{2}} Uhr. Ihr Link zum Gespräch: {{3}} Falls etwas dazwischenkommt: {{4}} Bis gleich, ${OLE}`,
  ),
  v2("pg_vertrieb_gleich_tel_v2", "gleich", null, "telefon", E, `Guten Tag {{1}}, in einer Stunde, um {{2}} Uhr, rufe ich Sie an. Falls etwas dazwischenkommt: {{3}} Bis gleich, ${OLE}`),
];

/** Alle Vorlagen der Support-Nummer (Einreichung im WhatsApp-Cron). */
export const SUPPORT_TEMPLATES: SupportTemplate[] = [
  ...TERMIN_VORLAGEN.map(({ name, body, examples, purpose }) => ({ name, body, examples, purpose })),
  // Zahlungserinnerung zum Angebot (lib/angebot-zahlungserinnerung.ts), Sie und Du, Fassung 1 (Team) und 2 (Ole)
  { name: ZAHLUNG_TEMPLATE_SIE, body: ZAHLUNG_TEMPLATE_BODY_SIE, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
  { name: ZAHLUNG_TEMPLATE_DU, body: ZAHLUNG_TEMPLATE_BODY_DU, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
  { name: ZAHLUNG_TEMPLATE_SIE_V2, body: ZAHLUNG_TEMPLATE_BODY_SIE_V2, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
  { name: ZAHLUNG_TEMPLATE_DU_V2, body: ZAHLUNG_TEMPLATE_BODY_DU_V2, examples: ZAHLUNG_TEMPLATE_EXAMPLES, purpose: ZAHLUNG_TEMPLATE_PURPOSE },
  // Erinnerung am letzten Tag des Abschlussbonus (lib/vertrieb/bonus-erinnerung.ts), Sie/Du, mit bzw. ohne „später zahlen“
  ...BONUS_VORLAGEN.map(({ name, body, examples, purpose }) => ({ name, body, examples: [...examples], purpose })),
  // Nach dem Anruf-Ergebnis „Nicht erreicht“ mit Buchungslink (lib/vertrieb/nicht-erreicht.ts)
  { name: NE_TEMPLATE_NAME, body: NE_TEMPLATE_BODY, examples: NE_TEMPLATE_EXAMPLES, purpose: NE_TEMPLATE_PURPOSE },
  // Fassung B des A/B-Tests (A/B-Test-Labor 22.11.2026): Entweder-oder-Frage statt offener Bitte
  { name: NE_TEMPLATE_NAME_B, body: NE_TEMPLATE_BODY_B, examples: NE_TEMPLATE_EXAMPLES, purpose: NE_TEMPLATE_PURPOSE },
  // Du-Form beider Fassungen (Ole 23.11.2026: Du/Sie im Fenster „Eintragen“ wählbar)
  { name: NE_TEMPLATE_NAME_DU, body: NE_TEMPLATE_BODY_DU, examples: NE_TEMPLATE_EXAMPLES_DU, purpose: NE_TEMPLATE_PURPOSE },
  { name: NE_TEMPLATE_NAME_B_DU, body: NE_TEMPLATE_BODY_B_DU, examples: NE_TEMPLATE_EXAMPLES_DU, purpose: NE_TEMPLATE_PURPOSE },
];

export function supportTemplateRequest(t: SupportTemplate): CreateTemplateInput {
  return {
    name: t.name,
    category: "UTILITY",
    language: LANGUAGE,
    components: [{ type: "BODY", text: t.body, example: { body_text: [t.examples] } }],
  };
}

export function terminTemplateRequest(): CreateTemplateInput {
  return {
    name: TERMIN_TEMPLATE_NAME,
    category: "UTILITY",
    language: LANGUAGE,
    components: [{ type: "BODY", text: TERMIN_TEMPLATE_BODY, example: { body_text: [TERMIN_TEMPLATE_EXAMPLES] } }],
  };
}

const TZ = "Europe/Berlin";

/** Art des Termins aus dem Calendly-Ort (Video, Telefon, vor Ort). Ohne Zeilenumbrüche (Meta). */
export function terminArt(loc: { type?: string | null; location?: string | null; join_url?: string | null } | null | undefined): string {
  const type = (loc?.type ?? "").toLowerCase();
  if (type === "outbound_call") return "telefonisch, wir rufen Sie an";
  if (type === "inbound_call") return loc?.location ? `telefonisch unter ${loc.location}` : "telefonisch";
  if (type === "physical" || type === "in_person_meeting") return loc?.location ? `vor Ort: ${loc.location}` : "vor Ort";
  if (/zoom|google|teams|webex|conference|video|gotomeeting/.test(type) || loc?.join_url) {
    return loc?.join_url ? `per Video: ${loc.join_url}` : "per Video, den Link finden Sie in Ihrer Bestätigungsmail";
  }
  if (loc?.location) return loc.location;
  return "die Details finden Sie in Ihrer Bestätigungsmail";
}

/** Meta lehnt Parameter mit Zeilenumbruch, Tab oder mehr als 4 Leerzeichen ab. */
const clean = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-";

export function terminParams(opts: {
  name: string | null;
  startAt: Date;
  loc: Parameters<typeof terminArt>[0];
  rescheduleUrl: string | null;
}): string[] {
  const date = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(opts.startAt);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(opts.startAt);
  return [
    clean(opts.name?.trim() || "und herzlich willkommen"),
    clean(date),
    clean(time),
    clean(terminArt(opts.loc)),
    clean(opts.rescheduleUrl || "über den Link in Ihrer Bestätigungsmail"),
  ].map((v) => v.slice(0, 300));
}

/** Freigabe je Vorlage (version 2 nur, solange Meta sie nicht als MARKETING eingestuft hat). */
export type Nutzbar = (name: string, version: 1 | 2) => boolean;

/**
 * Vorlage für einen Termin wählen: passende Variante der Fassung 2 (bei „Video mit Link“ ersatzweise die ohne Link),
 * sonst Fassung 1. Die 24-Stunden-Erinnerung der Fassung 2 sagt „morgen“: nur, wenn der Termin morgen ist.
 * null: keine passende Vorlage freigegeben.
 */
export function waehleTerminVorlage(art: TerminArtKey, ctx: { thema: Thema; modus: Modus | null; morgen?: boolean }, nutzbar: Nutzbar): TerminVorlage | null {
  const modi: Modus[] = !ctx.modus ? [] : ctx.modus === "link" ? (art === "erinnerung" ? ["video"] : ["link", "video"]) : [ctx.modus];
  if (art !== "erinnerung" || ctx.morgen) {
    for (const modus of modi) {
      const v = TERMIN_VORLAGEN.find((x) => x.version === 2 && x.art === art && x.modus === modus && (x.thema === null || x.thema === ctx.thema));
      if (v && nutzbar(v.name, 2)) return v;
    }
  }
  const v1 = TERMIN_VORLAGEN.find((x) => x.version === 1 && x.art === art)!;
  return nutzbar(v1.name, 1) ? v1 : null;
}

/** Entscheidungs-Call (Termintyp „entscheidung“ = DECISION_BOOKING_TYPE in lib/vertrieb/buchung.ts), sonst Meta-Leads-Call. */
export function terminThema(m: { title?: string | null; bookingType?: { slug: string } | null }): Thema {
  return m.bookingType?.slug === "entscheidung" || /entscheid/i.test(m.title ?? "") ? "entscheidung" : "leads";
}

/**
 * Video mit Link, Video (Link in der Einladung) oder Telefon. null bei vor Ort, „Kontakt ruft an“ und Unbekanntem
 * (dann Fassung 1 mit der allgemeinen Beschreibung). Die eigene Buchungsseite speichert „Videocall“ bzw. „Telefon“,
 * Calendly den Ort bzw. die Art (bei „wir rufen an“ steht dort die Nummer des Kontakts).
 */
export function terminModus(o: { joinUrl?: string | null; locType?: string | null; location?: string | null }): Modus | null {
  if (o.joinUrl) return "link";
  const t = (o.locType ?? "").toLowerCase();
  const l = (o.location ?? "").trim();
  if (t === "inbound_call" || t === "physical" || t === "in_person_meeting") return null;
  if (t === "outbound_call" || /^telefon/i.test(t) || /^telefon/i.test(l) || /^\+?[\d\s()/.-]{6,}$/.test(l)) return "telefon";
  if (/zoom|google|teams|webex|conference|video|gotomeeting/i.test(`${t} ${l}`)) return "video";
  return null;
}

/**
 * Anrede für {{1}} (Sie-Form): „Herr Mustermann“ nur bei bekannter Anrede, sonst Vor- und Nachname (nie geraten).
 * Hat jemand anderes gebucht als der Kontakt (Nachname passt nicht), zählt der Name aus der Buchung.
 */
export function terminAnrede(
  contact: { salutation?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined,
  inviteeName: string | null | undefined,
): string | null {
  const inv = (inviteeName ?? "").replace(/\s+/g, " ").trim();
  const last = contact?.lastName?.trim() ?? "";
  const same = !inv || !last || inv.toLowerCase().includes(last.toLowerCase());
  const k = same ? { salutation: contact?.salutation, firstName: contact?.firstName, lastName: contact?.lastName, fullName: inv } : { fullName: inv };
  return anredeName("sie", k) || inv || [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() || null;
}

/** Parameter einer Vorlage in ihrer Reihenfolge (ohne Zeilenumbrüche, je höchstens 300 Zeichen). */
export function vorlageParams(
  v: Pick<TerminVorlage, "params">,
  o: { anrede: string | null; startAt: Date; loc: Parameters<typeof terminArt>[0]; videolink: string | null; link: string | null },
): string[] {
  const [anrede, datum, zeit, art, linkV1] = terminParams({ name: o.anrede, startAt: o.startAt, loc: o.loc, rescheduleUrl: o.link });
  const werte: Record<Param, string> = { anrede, datum, zeit, art, linkV1, videolink: o.videolink ?? "", link: o.link || "antworten Sie einfach kurz auf diese Nachricht." };
  return v.params.map((p) => clean(werte[p]).slice(0, 300));
}

/**
 * Telefonnummer aus Calendly: SMS-Erinnerungsnummer, dann Fragen (Telefon/Handy/WhatsApp), dann die Nummer aus dem
 * Ort bei „wir rufen Sie an“ (outbound_call), dann Kontakt.
 */
export function bookingPhone(
  inv: { text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[] },
  contactPhone: string | null,
  loc?: { type?: string | null; location?: string | null } | null,
): string | null {
  const fromQa = (inv.questions_and_answers ?? []).find((qa) => /telefon|handy|mobil|whatsapp|phone|rufnummer/i.test(qa.question) && /\d{5,}/.test(qa.answer.replace(/\D/g, "")))?.answer;
  const fromLoc = loc?.type === "outbound_call" ? loc.location : null;
  for (const raw of [inv.text_reminder_number, fromQa, fromLoc, contactPhone]) {
    const p = raw ? normalizePhone(raw) : null;
    if (p) return p;
  }
  return null;
}

type SupportAccount = { id: string; apiKeyEnc: string };

async function supportAccount(): Promise<SupportAccount | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { id: true, status: true, apiKeyEnc: true } });
  return acc?.status === "connected" && acc.apiKeyEnc ? { id: acc.id, apiKeyEnc: acc.apiKeyEnc } : null;
}

async function templateApproved(name: string): Promise<boolean> {
  const tpl = await prisma.messageTemplate.findUnique({
    where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name, language: LANGUAGE } },
    select: { status: true },
  });
  return tpl?.status === "approved";
}

/** Freigabestand aller Vorlagen der Support-Nummer: Fassung 1 freigegeben, Fassung 2 freigegeben und nicht MARKETING. */
export async function supportVorlagenNutzbar(): Promise<Nutzbar> {
  const rows = await prisma.messageTemplate.findMany({
    where: { customerId: SUPPORT_CUSTOMER_ID, language: LANGUAGE, name: { in: SUPPORT_TEMPLATES.map((t) => t.name) } },
    select: { name: true, status: true, category: true },
  });
  const map = new Map(rows.map((r) => [r.name, r]));
  return (name, version) => {
    const r = map.get(name);
    return r?.status === "approved" && (version === 1 || (r.category ?? "").toLowerCase() !== "marketing");
  };
}

type SendOutcome = "sent" | "no_account" | "no_template" | "opted_out" | "gesperrt" | "festnetz";

/**
 * Vorlage von der Support-Nummer an einen Vertriebskontakt senden und im Support-Chat sowie im
 * Verlauf des Kontakts vermerken. Wirft bei API-Fehlern.
 */
async function sendSupportTemplate(opts: {
  contactId: string;
  phone: string;
  name: string | null;
  template: { name: string; body: string; purpose?: string };
  params: string[];
  activity: string;
  now: Date;
}): Promise<SendOutcome> {
  // Feste Sperrliste im Vertrieb (lib/vertrieb/sperrliste.ts)
  if (await kontaktGesperrt(opts.contactId)) return "gesperrt";
  // Festnetznummern haben kein WhatsApp (Ole, 20.11.2026: Erinnerung an +49 5426 … schlug fehl): nicht senden
  const { istFestnetz } = await import("@/lib/mail-strecke/server");
  if (await istFestnetz(opts.phone)) return "festnetz";
  const acc = await supportAccount();
  if (!acc) return "no_account";
  if (!(await templateApproved(opts.template.name))) return "no_template";
  // „STOPP“ geschrieben: keine Nachrichten mehr an diese Nummer (lib/whatsapp/stopp.ts)
  const prior = await prisma.conversation.findUnique({
    where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: opts.phone } },
    select: { optedOutAt: true },
  });
  if (prior?.optedOutAt) return "opted_out";
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const res = await sendTemplate(apiKey, opts.phone, opts.template.name, LANGUAGE, [{ type: "body", parameters: opts.params.map((text) => ({ type: "text", text })) }]);
  // Ab hier ist gesendet: Fehler beim Vermerken nur melden, nie werfen (sonst würde eine Erinnerung erneut gesendet)
  await vermerkeVersand(acc, opts, res.messageId).catch((err) => reportError(err, "vertrieb-termin-whatsapp-vermerk", { contact: opts.contactId }));
  return "sent";
}

async function vermerkeVersand(
  acc: SupportAccount,
  opts: { contactId: string; phone: string; name: string | null; template: { name: string; body: string; purpose?: string }; params: string[]; activity: string; now: Date },
  messageId: string | null,
): Promise<void> {
  const conv = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: opts.phone } },
    create: {
      customerId: SUPPORT_CUSTOMER_ID,
      whatsAppAccountId: acc.id,
      contactPhone: opts.phone,
      contactName: opts.name,
      botActive: false,
      status: "open",
      lastMessageAt: opts.now,
      salesContactId: opts.contactId,
      contactMatchedAt: opts.now,
    },
    update: { lastMessageAt: opts.now },
    select: { id: true, contactLinkManual: true, salesContactId: true, linkedCustomerId: true },
  });
  if (!conv.contactLinkManual && !conv.salesContactId && !conv.linkedCustomerId) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { salesContactId: opts.contactId, contactMatchedAt: opts.now } });
  }
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "outbound",
      kind: "template",
      body: renderTemplate(opts.template.body, opts.params),
      waMessageId: messageId,
      status: "sent",
      sentBy: "system",
      pricingCategory: "utility",
      // Zweck (vertrieb_termin, vertrieb_erinnerung, vertrieb_gleich): bei Zustellfehler SMS-Ersatz (lib/sms/ersatz.ts)
      purpose: opts.template.purpose ?? null,
    },
  });
  await prisma.salesActivity.create({ data: { contactId: opts.contactId, type: "TERMIN", outcome: opts.activity, note: null } }).catch(() => {});
}

const CONTACT_SELECT = { phone: true, firstName: true, lastName: true, salutation: true } as const;

/**
 * Bestätigung für einen neu gebuchten Vertriebstermin senden und am Termin vermerken.
 * Wirft nie; Ergebnis steht in SalesMeeting.waConfirmStatus.
 */
export async function sendTerminConfirmation(
  meetingId: string,
  inv: { text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[]; name?: string | null; reschedule_url?: string | null },
  loc: Parameters<typeof terminArt>[0],
  now = new Date(),
): Promise<string> {
  const mark = async (status: string, error: string | null = null) => {
    await prisma.salesMeeting.update({ where: { id: meetingId }, data: { waConfirmStatus: status, waConfirmAt: now, waConfirmError: error?.slice(0, 300) ?? null } }).catch(() => {});
    return status;
  };
  try {
    const m = await prisma.salesMeeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        startAt: true,
        title: true,
        joinUrl: true,
        location: true,
        inviteeName: true,
        inviteePhone: true,
        waConfirmStatus: true,
        contactId: true,
        bookingType: { select: { slug: true } },
        contact: { select: CONTACT_SELECT },
      },
    });
    if (!m) return "missing";
    if (m.waConfirmStatus === "sent") return "sent";
    if (m.startAt.getTime() <= now.getTime()) return await mark("past");
    // Nummer aus der Buchung vor der Hauptnummer des Kontakts (dieselbe Nummer für Bestätigung und Erinnerungen)
    const phone = bookingPhone(inv, (m.inviteePhone ? normalizePhone(m.inviteePhone) : null) ?? m.contact.phone, loc);
    if (!phone) return await mark("no_phone");
    // Nummer am Kontakt merken, damit Support-Chats ihn erkennen; am Termin für die Erinnerungen
    if (!m.contact.phone) await prisma.salesContact.update({ where: { id: m.contactId }, data: { phone: `+${phone}` } }).catch(() => {});
    if (!m.inviteePhone) await prisma.salesMeeting.update({ where: { id: m.id }, data: { inviteePhone: `+${phone}` } }).catch(() => {});
    const anrede = terminAnrede(m.contact, inv.name ?? m.inviteeName);
    const videolink = loc?.join_url ?? m.joinUrl;
    const modus = terminModus({ joinUrl: videolink, locType: loc?.type, location: loc?.location ?? m.location });
    const v = waehleTerminVorlage("termin", { thema: terminThema(m), modus }, await supportVorlagenNutzbar());
    if (!v) return await mark((await supportAccount()) ? "no_template" : "no_account");
    const params = vorlageParams(v, { anrede, startAt: m.startAt, loc, videolink, link: inv.reschedule_url ?? null });
    const out = await sendSupportTemplate({
      contactId: m.contactId,
      phone,
      // Name im Support-Chat: voller Name wie gebucht
      name: inv.name?.trim() || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || anrede,
      template: v,
      params,
      activity: "Terminbestätigung per WhatsApp gesendet",
      now,
    });
    return await mark(out);
  } catch (err) {
    reportError(err, "vertrieb-termin-whatsapp", { meeting: meetingId });
    return await mark("failed", err instanceof Error ? err.message : String(err));
  }
}

// ─── Erinnerungen 24 Stunden und 1 Stunde vorher ────────────────────────

/** Ort des Termins für die Erinnerung (Videolink bzw. Art), wie bei der Bestätigung. */
function meetingLoc(m: { joinUrl: string | null; location: string | null }): Parameters<typeof terminArt>[0] {
  if (m.joinUrl) return { type: "video", join_url: m.joinUrl };
  if (m.location && /video/i.test(m.location)) return { type: "video" };
  // „Telefon“ (eigene Buchungsseite) bzw. Nummer (Calendly „wir rufen an“): wie in der Bestätigung
  if (terminModus({ locType: m.location, location: m.location }) === "telefon") return { type: "outbound_call" };
  return m.location ? { type: m.location, location: null } : null;
}

/** Link zum Verschieben: eigene Buchungsseite (Token) oder Calendly. */
function rescheduleLink(m: { manageToken: string | null; rescheduleUrl: string | null }, manageUrl: (token: string) => string): string | null {
  return m.manageToken ? manageUrl(m.manageToken) : m.rescheduleUrl;
}

type ErinnerungsTermin = {
  title: string;
  startAt: Date;
  joinUrl: string | null;
  location: string | null;
  manageToken: string | null;
  rescheduleUrl: string | null;
  inviteeName: string | null;
  inviteePhone: string | null;
  bookingType: { slug: string } | null;
  contact: { phone: string | null; firstName: string | null; lastName: string | null; salutation: string | null };
};

/**
 * WhatsApp-Terminerinnerung (24 Stunden bzw. 1 Stunde): Vorlage, Parameter und Nummer, gemeinsam für Versand und
 * Vorschau. null: keine passende Vorlage freigegeben.
 */
export function terminErinnerungInhalt(
  m: ErinnerungsTermin,
  art: "erinnerung" | "gleich",
  now: Date,
  nutzbar: Nutzbar,
  manageUrl: (token: string) => string,
): { vorlage: TerminVorlage; params: string[]; phone: string | null; anrede: string | null } | null {
  const modus = terminModus({ joinUrl: m.joinUrl, locType: m.location, location: m.location });
  const vorlage = waehleTerminVorlage(art, { thema: terminThema(m), modus, morgen: berlinYmd(m.startAt) === addDaysYmd(berlinYmd(now), 1) }, nutzbar);
  if (!vorlage) return null;
  // Dieselbe Nummer wie die Bestätigung: Nummer aus der Buchung vor der Hauptnummer des Kontakts
  const phone = [m.inviteePhone, m.contact.phone].map((p) => (p ? normalizePhone(p) : null)).find(Boolean) ?? null;
  const anrede = terminAnrede(m.contact, m.inviteeName);
  const params = vorlageParams(vorlage, { anrede, startAt: m.startAt, loc: meetingLoc(m), videolink: m.joinUrl, link: rescheduleLink(m, manageUrl) });
  return { vorlage, params, phone, anrede };
}

export type WaReminderResult = { day: number; soon: number; skipped: number; errors: number; retry: number };

/** Höchstens so viele Versuche je Erinnerung bei Sendefehlern (je Cron-Lauf einer, solange im Fenster). */
export const MAX_REMINDER_TRIES = 3;

/**
 * Zeitpunkt der ursprünglichen Buchung: bei verschobenen Terminen (rescheduledFromId) der erste Termin der Kette.
 * Daran wird gemessen, ob „im Voraus gebucht“ (Erinnerungsfenster), nicht am Zeitpunkt des Verschiebens.
 */
export async function urspruenglichGebucht(m: { createdAt: Date; rescheduledFromId: string | null }): Promise<Date> {
  let at = m.createdAt;
  let prev = m.rescheduledFromId;
  for (let i = 0; prev && i < 10; i++) {
    const p = await prisma.salesMeeting.findUnique({ where: { id: prev }, select: { createdAt: true, rescheduledFromId: true } });
    if (!p) break;
    at = p.createdAt;
    prev = p.rescheduledFromId;
  }
  return at;
}

/**
 * WhatsApp-Erinnerungen von der Support-Nummer für geplante Vertriebstermine (eigene Buchungsseite und
 * Calendly). 24 Stunden vorher nur, wenn mehr als 26 Stunden im Voraus gebucht; 1 Stunde vorher nur, wenn
 * mindestens 3 Stunden im Voraus gebucht (bei verschobenen Terminen gemessen an der ursprünglichen Buchung).
 * Die 24-Stunden-Erinnerung entfällt, wenn die Bestätigung keine 2 Stunden her ist (z. B. kurz vorher verschoben).
 * Jede Art höchstens einmal je Termin (waReminderAt, waSoonAt); Ergebnis in waReminderStatus bzw. waSoonStatus.
 * Sendefehler: Markierung zurück, der nächste Lauf versucht es erneut (höchstens MAX_REMINDER_TRIES, nur im Fenster).
 * Solange die Nummer nicht verbunden bzw. keine passende Vorlage freigegeben ist, wird nichts gesendet
 * und nichts markiert.
 */
export async function runSalesWhatsAppReminders(now = new Date(), manageUrl: (token: string) => string): Promise<WaReminderResult> {
  const result: WaReminderResult = { day: 0, soon: 0, skipped: 0, errors: 0, retry: 0 };
  if (!(await supportAccount())) return result;
  const nutzbar = await supportVorlagenNutzbar();
  // Zeitregeln gemeinsam mit E-Mail-Versand und Übersicht „Geplante Nachrichten“ (lib/vertrieb/termin-erinnerungen.ts)
  const kinds = [
    { field: "waReminderAt", status: "waReminderStatus", error: "waReminderError", tries: "waReminderTries", art: "erinnerung", plan: "tag", key: "day" },
    { field: "waSoonAt", status: "waSoonStatus", error: "waSoonError", tries: "waSoonTries", art: "gleich", plan: "gleich", key: "soon" },
  ] as const;
  for (const k of kinds) {
    if (!TERMIN_VORLAGEN.some((v) => v.art === k.art && nutzbar(v.name, v.version))) continue;
    const due = await prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", [k.field]: null, startAt: erinnerungsFenster(k.plan, now) },
      select: {
        id: true,
        title: true,
        startAt: true,
        createdAt: true,
        rescheduledFromId: true,
        waConfirmAt: true,
        waConfirmStatus: true,
        waReminderTries: true,
        waSoonTries: true,
        joinUrl: true,
        location: true,
        manageToken: true,
        rescheduleUrl: true,
        inviteeName: true,
        inviteePhone: true,
        contactId: true,
        bookingType: { select: { slug: true } },
        contact: { select: CONTACT_SELECT },
      },
      orderBy: { startAt: "asc" },
      take: 100,
    });
    for (const m of due) {
      const inhalt = terminErinnerungInhalt(m, k.art, now, nutzbar, manageUrl);
      // Keine passende Vorlage freigegeben: nicht markieren, der nächste Lauf versucht es wieder
      if (!inhalt) {
        result.skipped++;
        continue;
      }
      // Markierung zuerst: parallel laufende Crons senden nie doppelt
      const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, [k.field]: null }, data: { [k.field]: now, [k.tries]: { increment: 1 } } });
      if (!claimed.count) continue;
      const setStatus = (status: string, error: string | null = null) =>
        prisma.salesMeeting.update({ where: { id: m.id }, data: { [k.status]: status, [k.error]: error?.slice(0, 300) ?? null } }).catch(() => {});
      const skip = async (status: string) => {
        result.skipped++;
        await setStatus(status);
      };
      if (!vorlaufOk(k.plan, "whatsapp", { startAt: m.startAt, gebucht: m.createdAt, urspruenglich: await urspruenglichGebucht(m) })) {
        await skip("kurzfristig");
        continue;
      }
      // Gerade erst bestätigt (z. B. kurz vorher verschoben): keine 24-Stunden-Erinnerung direkt hinterher
      if (k.key === "day" && direktNachBestaetigung({ status: m.waConfirmStatus, at: m.waConfirmAt }, now)) {
        await skip("nach_bestaetigung");
        continue;
      }
      const { vorlage: v, params, phone, anrede } = inhalt;
      if (!phone) {
        await skip("no_phone");
        continue;
      }
      try {
        const out = await sendSupportTemplate({
          contactId: m.contactId,
          phone,
          name: m.inviteeName?.trim() || [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || anrede,
          template: v,
          params,
          activity: k.key === "day" ? "Terminerinnerung (24 Stunden) per WhatsApp gesendet" : "Terminerinnerung (1 Stunde) per WhatsApp gesendet",
          now,
        });
        if (out === "sent") result[k.key]++;
        else result.skipped++;
        await setStatus(out);
      } catch (err) {
        result.errors++;
        reportError(err, "vertrieb-termin-erinnerung", { meeting: m.id, kind: k.key });
        const tries = m[k.tries] + 1;
        await setStatus("failed", err instanceof Error ? err.message : String(err));
        // Nächster Cron-Lauf versucht es erneut, solange der Termin im Fenster liegt
        if (tries < MAX_REMINDER_TRIES) {
          await prisma.salesMeeting.updateMany({ where: { id: m.id, [k.field]: now }, data: { [k.field]: null } });
          result.retry++;
        }
      }
    }
  }
  return result;
}

// ─── Vorlagen einreichen und Freigabe nachziehen ─────────────────────────

const CHECK_PENDING_MS = 30 * 60 * 1000;
const CHECK_IDLE_MS = 6 * 60 * 60 * 1000;

const LABEL: Record<string, string> = {
  [TERMIN_TEMPLATE_PURPOSE]: "Terminbestätigung",
  vertrieb_erinnerung: "Terminerinnerung",
  vertrieb_gleich: "Termin gleich",
  [ZAHLUNG_TEMPLATE_PURPOSE]: "Zahlungserinnerung",
  [BONUS_TEMPLATE_PURPOSE]: "Bonus-Erinnerung",
  [NE_TEMPLATE_PURPOSE]: "Nicht erreicht",
};

/**
 * Im WhatsApp-Cron: Vorlagen der Support-Nummer einreichen bzw. Status abgleichen (gedrosselt).
 * `status` = Stand der Terminbestätigung, `statuses` = Stand je Vorlage. Ein Fehler bei einer Vorlage
 * (z. B. Einreichen abgelehnt) hält die anderen nicht auf; er wird gemeldet und steht als „error“ in `statuses`.
 */
export async function syncSupportTemplates(now = new Date(), opts: { force?: boolean } = {}): Promise<{ status: string; statuses: Record<string, string> } | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { status: true, apiKeyEnc: true, templatesCheckedAt: true } });
  if (acc?.status !== "connected" || !acc.apiKeyEnc) return null;
  const locals = await prisma.messageTemplate.findMany({
    where: { customerId: SUPPORT_CUSTOMER_ID, language: LANGUAGE, name: { in: SUPPORT_TEMPLATES.map((t) => t.name) } },
    select: { name: true, status: true },
  });
  const localStatus = new Map(locals.map((l) => [l.name, l.status]));
  const allApproved = SUPPORT_TEMPLATES.every((t) => localStatus.get(t.name) === "approved");
  const age = acc.templatesCheckedAt ? now.getTime() - acc.templatesCheckedAt.getTime() : Infinity;
  if (!opts.force && age < (allApproved ? CHECK_IDLE_MS : CHECK_PENDING_MS)) return null;
  for (const t of SUPPORT_TEMPLATES) {
    const problems = metaTemplateProblems(t.body, t.examples);
    if (problems.length) throw new Error(`Vorlage ${t.name} ungültig: ${problems.join(", ")}`);
  }
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const remoteList = await listTemplates(apiKey);
  const statuses: Record<string, string> = {};
  for (const t of SUPPORT_TEMPLATES) {
    try {
      let remote = findRemote(remoteList, t.name);
      let submittedAt: Date | null = null;
      if (!remote) {
        remote = await createTemplate(apiKey, supportTemplateRequest(t));
        submittedAt = now;
      }
      const status = mapRemoteStatus(remote.status);
      // Kategorie von Meta (stuft Meta eine UTILITY-Vorlage als MARKETING ein, wird Fassung 2 nicht genutzt)
      const category = (remote.category ?? "utility").toLowerCase();
      statuses[t.name] = status;
      await prisma.messageTemplate.upsert({
        where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: t.name, language: LANGUAGE } },
        create: {
          customerId: SUPPORT_CUSTOMER_ID,
          name: t.name,
          language: LANGUAGE,
          purpose: t.purpose,
          category,
          status,
          body: t.body,
          auto: true,
          submittedAt,
          rejectionReason: status === "rejected" ? remote.rejectedReason : null,
        },
        update: { status, category, rejectionReason: status === "rejected" ? remote.rejectedReason : null, ...(submittedAt ? { submittedAt } : {}) },
      });
      if (status === "rejected" && localStatus.get(t.name) !== "rejected") {
        const { sendToAdmins } = await import("@/lib/push");
        await sendToAdmins({
          title: `WhatsApp-Vorlage ${LABEL[t.purpose] ?? t.name} abgelehnt`,
          body: `${t.name}: ${(remote.rejectedReason ?? "Grund unbekannt").slice(0, 100)}`,
          url: "/admin/neu/einstellungen/whatsapp",
          tag: `tpl:support-${t.name}`,
        }).catch(() => {});
      }
    } catch (err) {
      statuses[t.name] = "error";
      reportError(err, "support-vorlage", { template: t.name });
    }
  }
  await prisma.whatsAppAccount.update({ where: { customerId: SUPPORT_CUSTOMER_ID }, data: { templatesCheckedAt: now } });
  return { status: statuses[TERMIN_TEMPLATE_NAME] ?? "pending", statuses };
}
