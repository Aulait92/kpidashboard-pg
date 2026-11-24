// Termin-Nachrichten per WhatsApp: Bestätigung direkt nach einer Buchung, Verschiebung und die drei Erinnerungen des
// Show-up-Pakets (Ole, 17.11.2026; Regeln und Texte in lib/showup.ts): Vortag (ca. 24 h vorher, mit Vortags-Mail),
// 1 Stunde vorher, 15 Minuten vorher (nur Video mit Link). Alle laufen über sendWhatsAppNotice (Freitext im
// 24h-Fenster, sonst freigegebene Vorlage; fehlt die neue Fassung, gilt die bisherige Vorlage).

import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { prisma } from "@/lib/prisma";
import { firstNameOf, neuePlatzhalter, NoTemplateError, sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { a, anredeZeile, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { advisorDisplayName } from "@/lib/advisor-name";
import { splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { WhatsAppKeinLeadError } from "@/lib/whatsapp/nur-leads";
import { terminNutzenSatz, vermittlerName, zeitKurz } from "@/lib/whatsapp/gespraech";
import { ERINNERUNG, erinnerungFaellig, gleichText, stundeText, terminArtWort, uhrKurz, vortagParams, vortagText } from "@/lib/showup";

/** Ansprache des Kunden (Sie/Du) für Texte an Leads. */
export async function anspracheOf(customerId: string): Promise<Ansprache> {
  // Ohne Datenbank (z. B. Unit-Tests) bzw. bei Fehlern: Standard „Sie“
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }).catch(() => null);
  return asAnsprache(c?.leadAddress);
}

const TZ = "Europe/Berlin";

export function formatWhenDE(d: Date): string {
  return `${new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d)} Uhr`;
}

function modeLabel(mode: string): string {
  return mode === "video" ? "Videocall" : mode === "onsite" ? "Termin vor Ort" : "Telefonat";
}

/** „Ihr Telefonat“ / „Ihren Videocall“ (akk = Akkusativ). */
function terminWort(mode: string, an: Ansprache, akk = false): string {
  if (mode === "onsite") return `${a(an, akk ? "deinen" : "dein", akk ? "Ihren" : "Ihr")} Termin vor Ort`;
  return mode === "video" ? `${a(an, akk ? "deinen" : "dein", akk ? "Ihren" : "Ihr")} Videocall` : `${a(an, "dein", "Ihr")} Telefonat`;
}

/** Verschieben per Chat (statt Link zur Verwaltungsseite). */
function chatHint(an: Ansprache): string {
  return a(an, "Falls etwas dazwischenkommt, antworte einfach hier, dann finden wir eine neue Zeit.", "Falls etwas dazwischenkommt, antworten Sie einfach hier, dann finden wir eine neue Zeit.");
}

function linkOrHint(mode: string, meetUrl: string | null, an: Ansprache = "du", ort?: string | null): string {
  if (mode === "onsite") return ort?.trim() ? `Adresse: ${ort.trim()}` : "Vor Ort in der Agentur.";
  return mode === "video" && meetUrl ? meetUrl : a(an, "Wir rufen dich an.", "Wir rufen Sie an.");
}

/** Kurzer Vorbereitungshinweis in der Bestätigung (wie in der Vorlage v4). */
function prepHint(an: Ansprache): string {
  return a(an, "Zur Vorbereitung: Leg dir gern deine bisherigen Unterlagen zum Thema bereit, falls vorhanden.", "Zur Vorbereitung: Legen Sie sich gern Ihre bisherigen Unterlagen zum Thema bereit, falls vorhanden.");
}

/**
 * Kfz (Ole, 22.11.2026): Die Bestätigung bittet gleich um die beiden Unterlagen, damit der Berater den Beitrag vorab
 * rechnen kann. Steht in der Vorlage im freien Feld {{4}} (keine neue Meta-Vorlage), ohne Zeilenumbruch.
 */
export function kfzUnterlagenSatz(an: Ansprache): string {
  return a(
    an,
    "Damit der Beitrag vorab gerechnet werden kann, schick bitte hier ein Foto von deinem Fahrzeugschein (Vorderseite) und von der letzten Rechnung deiner Kfz-Versicherung.",
    "Damit der Beitrag vorab gerechnet werden kann, schicken Sie bitte hier ein Foto von Ihrem Fahrzeugschein (Vorderseite) und von der letzten Rechnung Ihrer Kfz-Versicherung.",
  );
}

/** Bestätigung nach Buchung (z. B. über die Buchungsseite). */
export async function sendBookingConfirmation(opts: {
  customerId: string;
  to: string;
  name: string | null;
  leadId?: string | null;
  startsAt: Date;
  mode: string;
  meetUrl: string | null;
  /** Adresse bei Terminen vor Ort */
  ort?: string | null;
  /** Link zum Absagen/Verschieben: nur noch für E-Mail/Kalender; per WhatsApp wird im Chat verschoben. */
  manageUrl?: string | null;
}): Promise<void> {
  const an = await anspracheOf(opts.customerId);
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.to, name: opts.name });
  // Verschieben per Knopf „Termin verschieben“ (v4) bzw. per Chat (ältere Vorlagen: Satz im Parameter)
  const lead = opts.leadId ? await prisma.lead.findUnique({ where: { id: opts.leadId }, select: { source: true } }).catch(() => null) : null;
  const { istKfzProdukt } = await import("@/lib/whatsapp/produkt-fragen");
  const kfz = istKfzProdukt(lead?.source ?? "") ? kfzUnterlagenSatz(an) : null;
  const params = [firstNameOf(opts.name), formatWhenDE(opts.startsAt), modeLabel(opts.mode), [linkOrHint(opts.mode, opts.meetUrl, an, opts.ort), kfz].filter(Boolean).join(" ")];
  const legacyParams = [...params.slice(0, 3), `${params[3]} ${chatHint(an)}`];
  // „Guten Tag Frau Schneider, Ihr Videocall mit Herrn Kannapinn ist bestätigt: …“ (Nennungsregel, lib/vermittler-nennung.ts)
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  const text =
    `${anredeZeile(an, who.kontakt)} ${terminWort(opts.mode, an)} mit ${person.dat} ist bestätigt: ${params[1]}. ` +
    (opts.mode === "video" && opts.meetUrl
      ? `Hier der Link zum Videocall: ${opts.meetUrl}`
      : opts.mode === "onsite"
        ? linkOrHint("onsite", null, an, opts.ort)
      : a(an, `${person.nom} ruft dich zur vereinbarten Zeit an.`, `${person.nom} ruft Sie zur vereinbarten Zeit an.`)) +
    `\n\n${kfz ?? prepHint(an)} Bis dann! 🙂`;
  await sendWhatsAppNotice({
    customerId: opts.customerId,
    to: opts.to,
    purpose: "booking_confirmation",
    params,
    legacyParams,
    text,
    leadId: opts.leadId ?? null,
    contactName: opts.name,
    anrede: who.kontakt,
  });
}

/**
 * Termin wurde vom Berater-Team verschoben (z. B. wegen Abwesenheit): neue
 * Zeit + Link, um selbst eine andere Zeit zu wählen. Ohne Grund.
 */
export async function sendRescheduleNotice(opts: {
  customerId: string;
  to: string;
  name: string | null;
  leadId?: string | null;
  startsAt: Date;
  mode: string;
  meetUrl: string | null;
  manageUrl: string | null;
}): Promise<void> {
  const an = await anspracheOf(opts.customerId);
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.to, name: opts.name });
  const change = a(an, "Passt dir die Zeit nicht? Antworte einfach hier, dann finden wir eine andere.", "Passt Ihnen die Zeit nicht? Antworten Sie einfach hier, dann finden wir eine andere.");
  // v4: Frage „Passt die neue Zeit?“ mit Knöpfen „Ja, passt“/„Bitte verschieben“; ältere Vorlagen mit Satz im Parameter
  const params = [firstNameOf(opts.name), formatWhenDE(opts.startsAt), modeLabel(opts.mode), linkOrHint(opts.mode, opts.meetUrl, an)];
  const legacyParams = [...params.slice(0, 3), `${params[3]} ${change}`];
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  const text =
    `${anredeZeile(an, who.kontakt)} wir mussten ${a(an, "deinen", "Ihren")} Termin mit ${person.dat} leider verschieben. Neue Zeit: ${params[1]} (${params[2]}).` +
    `\n\n${a(an, "Danke für dein Verständnis! Passt dir die neue Zeit?", "Danke für Ihr Verständnis! Passt Ihnen die neue Zeit?")}`;
  const send = (purpose: "reschedule" | "booking_confirmation") =>
    sendWhatsAppNotice({
      customerId: opts.customerId,
      to: opts.to,
      purpose,
      params,
      legacyParams,
      text,
      // Rückfall Bestätigungs-Vorlage: Knopf „Termin verschieben“ passt auch zum Freitext
      textButtons: purpose === "reschedule" ? undefined : [],
      leadId: opts.leadId ?? null,
      contactName: opts.name,
      anrede: who.kontakt,
    });
  // Außerhalb des 24h-Fensters: Vorlage „Termin verschoben“. Solange sie bei Meta
  // noch nicht freigegeben ist, die Bestätigungs-Vorlage mit der neuen Zeit.
  try {
    await send("reschedule");
  } catch (err) {
    if (!(err instanceof NoTemplateError)) throw err;
    await send("booking_confirmation");
  }
}

/** WhatsApp der Vortags-Erinnerung vom Vermittler übersprungen (nur intern, wie „kein Lead“ behandelt). */
class UebersprungenError extends Error {}

export type ReminderResult = { candidates: number; sent: number; errors: string[] };

/** „Gleich ist es so weit“: etwa so lange vor dem Termin (Ole, 15.11.2026: kurz vorher nachfragen, ob alles passt). */
export const SOON_MS = ERINNERUNG.stundeVorMs;

type TerminZeile = {
  id: string;
  customerId: string;
  conversationId: string | null;
  leadId: string | null;
  mode: string;
  startsAt: Date;
  createdAt: Date;
  meetUrl: string | null;
  ort: string | null;
  komplettcheck: boolean | null;
  reminderSentAt: Date | null;
  rescheduleRequestedAt: Date | null;
  status: string;
  erinnerungenUebersprungen: string[];
};

const terminSelect = {
  id: true,
  customerId: true,
  conversationId: true,
  leadId: true,
  mode: true,
  startsAt: true,
  createdAt: true,
  meetUrl: true,
  ort: true,
  komplettcheck: true,
  reminderSentAt: true,
  rescheduleRequestedAt: true,
  status: true,
  erinnerungenUebersprungen: true,
} as const;

/**
 * Nächste Nachrichten (Paket P6): nicht alle genannten Erinnerungen übersprungen und der Kontakt nicht pausiert („Alle
 * pausieren“, Lead.nachrichtenPausiertAt). Termine ohne Lead laufen wie bisher.
 */
export function nichtAngehalten(arten: string[]) {
  return {
    AND: [{ NOT: { erinnerungenUebersprungen: { hasEvery: arten } } }, { OR: [{ leadId: null }, { lead: { is: { nachrichtenPausiertAt: null } } }] }],
  };
}

function formAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

/** Alles für die Texte einer Erinnerung: Nummer, Ansprache, Anrede, Vermittler („Herr Kannapinn“), Angaben. */
async function erinnerungsKontext(appt: TerminZeile) {
  if (!appt.conversationId) return null;
  const conv = await prisma.conversation.findUnique({
    where: { id: appt.conversationId },
    select: { contactPhone: true, contactName: true, optedOutAt: true, qualificationData: true },
  });
  if (!conv?.contactPhone) return null;
  const [an, lead, customer] = await Promise.all([
    anspracheOf(appt.customerId),
    appt.leadId ? prisma.lead.findUnique({ where: { id: appt.leadId }, select: { source: true, formData: true, name: true, tkvUmfang: true } }).catch(() => null) : null,
    prisma.customer.findUnique({ where: { id: appt.customerId }, select: { name: true } }).catch(() => null),
  ]);
  const who = await ansprechpartner({ customerId: appt.customerId, leadId: appt.leadId, phone: conv.contactPhone, name: lead?.name ?? conv.contactName });
  // Vermittler wie im Assistenten (Ole, 17.11.2026): „Herr Kannapinn“, Du „Ole“; Team: der zuständige Berater
  const fallback = who.advisor || advisorDisplayName(customer?.name) || a(an, "dein Berater", "Ihr Berater");
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback });
  const formular = splitHealthAnswers(formAnswers(lead?.formData)).normal;
  return { conv, an, who, person, source: lead?.source ?? null, tkvUmfang: lead?.tkvUmfang ?? null, formular, angaben: conv.qualificationData, hi: anredeZeile(an, who.kontakt), optedOut: !!conv.optedOutAt };
}

/**
 * Erinnerungs-Vorlage: Platzhalter je Version der gewählten Vorlage. Ab v5 (Show-up-Paket, freigegeben 17.11.2026):
 * Wann, Nutzen, Zugang (vortagParams). Bis Meta v5 für den Kunden freigegeben hat, die bisherige v4 mit Datum/Uhrzeit,
 * Art, Link bzw. Hinweis; noch ältere bzw. von Hand angelegte Fassungen mit dem Satz zum Verschieben im letzten Parameter.
 */
function erinnerungsParams(version: number, o: { v5: () => string[]; v4: string[]; aelter: string[] }): string[] {
  if (neuePlatzhalter("reminder", version)) return o.v5();
  return version >= 4 ? o.v4 : o.aelter;
}

/**
 * 1 Stunde vorher (Ole, 17.11.2026): „In einer Stunde ist Ihr Videotermin mit Herrn Kannapinn. Passt bei Ihnen alles?
 * Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.“ mit „Ja, passt“ / „Bitte verschieben“, ohne Link.
 * Nicht, wenn weniger als 2 h vorher gebucht, nach „Bitte verschieben“ oder die Erinnerung gerade erst rausging.
 * Vorlage (Fenster zu): „Kurz vor dem Termin“ v5 (Terminart, Vermittler im Dativ); bis Meta sie für den Kunden
 * freigegeben hat, die bisherige v4 mit ihren Platzhaltern; ist gar keine freigegeben, die Erinnerungs-Vorlage.
 */
export async function runSoonReminders(now = new Date()): Promise<ReminderResult> {
  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      soonReminderSentAt: null,
      customer: { dormantSince: null },
      conversationId: { not: null },
      startsAt: { gt: new Date(now.getTime() + 10 * 60 * 1000), lte: new Date(now.getTime() + SOON_MS) },
      ...nichtAngehalten(["stunde"]),
    },
    select: terminSelect,
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  const result: ReminderResult = { candidates: due.length, sent: 0, errors: [] };
  for (const appt of due) {
    const justReminded = !!appt.reminderSentAt && now.getTime() - appt.reminderSentAt.getTime() < 90 * 60 * 1000;
    if (erinnerungFaellig("stunde", appt, now) !== "senden" || justReminded) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: now } });
      continue;
    }
    const k = await erinnerungsKontext(appt);
    if (!k || k.optedOut) continue;
    const uhr = `${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(appt.startsAt)} Uhr`;
    // Bisherige Vorlage v4: Uhrzeit, Art, Link bzw. Hinweis
    const alt = [firstNameOf(k.conv.contactName), uhr, modeLabel(appt.mode), linkOrHint(appt.mode, appt.meetUrl, k.an, appt.ort)];
    const text = stundeText({ an: k.an, hi: k.hi, mode: appt.mode, person: k.person });
    const neu = [alt[0], terminArtWort(appt.mode), k.person.dat];
    // Rückfall Erinnerungs-Vorlage: v4 Datum/Uhrzeit, Art, Link bzw. Hinweis; ab v5 wie am Vortag mit „heute um …“
    const remParams = [alt[0], formatWhenDE(appt.startsAt), alt[2], alt[3]];
    const remAelter = [...remParams.slice(0, 3), `${remParams[3]} ${chatHint(k.an)}`];
    const remV5 = () => {
      const nutzen = terminNutzenSatz({ source: k.source, formular: k.formular, angaben: k.angaben, an: k.an, person: k.person, video: appt.mode === "video", tkvUmfang: k.tkvUmfang });
      return [alt[0], ...vortagParams({ an: k.an, hi: k.hi, wann: zeitKurz(appt.startsAt, now), nutzen, komplettcheck: appt.komplettcheck === true, mode: appt.mode, meetUrl: appt.meetUrl, ort: appt.ort, person: k.person })];
    };
    const send = (purpose: "reminder_soon" | "reminder") =>
      sendWhatsAppNotice({
        customerId: appt.customerId,
        to: k.conv.contactPhone,
        purpose,
        params: purpose === "reminder" ? remParams : alt,
        paramsFor: ({ version }) =>
          purpose === "reminder_soon"
            ? neuePlatzhalter("reminder_soon", version)
              ? neu
              : alt
            : erinnerungsParams(version, { v5: remV5, v4: remParams, aelter: remAelter }),
        text,
        leadId: appt.leadId,
        contactName: k.conv.contactName,
        anrede: k.who.kontakt,
      });
    try {
      // Solange „Kurz vor dem Termin“ bei Meta nicht freigegeben ist: die normale Erinnerungs-Vorlage
      try {
        await send("reminder_soon");
      } catch (err) {
        if (!(err instanceof NoTemplateError)) throw err;
        await send("reminder");
      }
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: new Date() } });
      result.sent++;
    } catch (err) {
      if (!(err instanceof WhatsAppKeinLeadError)) result.errors.push(`${appt.id} (kurz vorher): ${err instanceof Error ? err.message : String(err)}`);
      // nicht endlos erneut versuchen
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: new Date() } });
    }
  }
  return result;
}

/**
 * 15 Minuten vorher, nur Videotermine mit Link (Ole, 17.11.2026): „Gleich geht es los: Herr Kannapinn ist um 10 Uhr für
 * Sie im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: <Link>. Bis gleich!“ mit „Bitte
 * verschieben“. Im 24-h-Fenster Freitext, sonst die Vorlage „reminder_start“ (v5, eingereicht ab 17.11.2026); ohne
 * freigegebene Vorlage entfällt sie (wie bisher, als es keine 15-Min.-Erinnerung gab).
 */
export async function runStartReminders(now = new Date()): Promise<ReminderResult> {
  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      mode: "video",
      meetUrl: { not: null },
      startReminderSentAt: null,
      customer: { dormantSince: null },
      conversationId: { not: null },
      startsAt: { gt: now, lte: new Date(now.getTime() + ERINNERUNG.gleichVorMs) },
      ...nichtAngehalten(["gleich"]),
    },
    select: terminSelect,
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  const result: ReminderResult = { candidates: due.length, sent: 0, errors: [] };
  for (const appt of due) {
    // Beansprucht (nie doppelt, auch bei parallelen Läufen)
    const claimed = await prisma.appointment.updateMany({ where: { id: appt.id, startReminderSentAt: null }, data: { startReminderSentAt: now } });
    if (!claimed.count || erinnerungFaellig("gleich", appt, now) !== "senden" || !appt.meetUrl) continue;
    const k = await erinnerungsKontext(appt);
    if (!k || k.optedOut) continue;
    try {
      await sendWhatsAppNotice({
        customerId: appt.customerId,
        to: k.conv.contactPhone,
        purpose: "reminder_start",
        params: [firstNameOf(k.conv.contactName), k.person.nom, uhrKurz(appt.startsAt), appt.meetUrl],
        text: gleichText({ an: k.an, hi: k.hi, person: k.person, startsAt: appt.startsAt, meetUrl: appt.meetUrl }),
        leadId: appt.leadId,
        contactName: k.conv.contactName,
        anrede: k.who.kontakt,
      });
      result.sent++;
    } catch (err) {
      if (!(err instanceof WhatsAppKeinLeadError) && !(err instanceof NoTemplateError)) result.errors.push(`${appt.id} (15 Min.): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

/**
 * Vortags-Erinnerung (ca. 24 h vorher, nur bei mindestens 26 h Vorlauf; Ole, 17.11.2026): Nutzensatz aus den Angaben,
 * bei Komplettcheck der Satz zu den Verträgen, Zugang, „Passt es weiterhin?“ mit „Ja, passt“ / „Bitte verschieben“.
 * Dazu die Vortags-Mail (lib/calendar/lead-email.ts). Kürzer gebucht: keine Vortags-Erinnerung, dafür die 1-h-Erinnerung.
 */
export async function runReminders(now = new Date()): Promise<ReminderResult> {
  const due = await prisma.appointment
    .findMany({
      where: {
        status: "booked",
        reminderSentAt: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + ERINNERUNG.vortagVorMs) },
        customer: { dormantSince: null },
        // Nächste Nachrichten (P6): WhatsApp und Mail einzeln überspringbar
        ...nichtAngehalten(["vortag", "vortag_mail"]),
      },
      select: terminSelect,
      orderBy: { startsAt: "asc" },
      take: 200,
    })
    .then((rows) => rows.filter((a) => erinnerungFaellig("vortag", a, now) === "senden"));

  const result: ReminderResult = { candidates: due.length, sent: 0, errors: [] };
  for (const appt of due) {
    const k = await erinnerungsKontext(appt);
    if (!k) continue;
    const nutzen = terminNutzenSatz({ source: k.source, formular: k.formular, angaben: k.angaben, an: k.an, person: k.person, video: appt.mode === "video", tkvUmfang: k.tkvUmfang });
    // Policen-Erinnerung im Nutzensatz (P2: höchstens 2 insgesamt, Schluss bei der ersten Police oder „habe keine“)
    const policen = await import("@/lib/whatsapp/termin-strecke").then((m) => m.policenVortagSatzFuer(appt, k.an, { person: k.person })).catch(() => null);
    const eingabe = { an: k.an, hi: k.hi, wann: zeitKurz(appt.startsAt, now), nutzen, komplettcheck: appt.komplettcheck === true, mode: appt.mode, meetUrl: appt.meetUrl, ort: appt.ort, person: k.person, policen };
    // Bisherige Vorlage v4: Datum/Uhrzeit, Art, Link bzw. Hinweis (ältere mit Satz im Parameter)
    const params = [firstNameOf(k.conv.contactName), formatWhenDE(appt.startsAt), modeLabel(appt.mode), linkOrHint(appt.mode, appt.meetUrl, k.an, appt.ort)];
    const legacyParams = [...params.slice(0, 3), `${params[3]} ${chatHint(k.an)}`];
    // WhatsApp + E-Mail; als erledigt gilt die Erinnerung, sobald EIN Kanal
    // zugestellt hat (sonst nächster Cron-Lauf erneut, ohne Doppel-Mails).
    let delivered = false;
    // Vom Vermittler übersprungen (P6): diesen Kanal auslassen, die Erinnerung gilt dann als erledigt
    const waAus = appt.erinnerungenUebersprungen.includes("vortag");
    const mailAus = appt.erinnerungenUebersprungen.includes("vortag_mail");
    // Kein Lead zugeordnet (Allowlist, lib/whatsapp/nur-leads.ts): keine WhatsApp; als erledigt markieren, sonst Dauerschleife
    let keinLead = false;
    try {
      if (waAus) throw new UebersprungenError();
      await sendWhatsAppNotice({
        customerId: appt.customerId,
        to: k.conv.contactPhone,
        purpose: "reminder",
        params,
        legacyParams,
        paramsFor: ({ version }) => erinnerungsParams(version, { v5: () => [params[0], ...vortagParams(eingabe)], v4: params, aelter: legacyParams }),
        text: vortagText(eingabe),
        leadId: appt.leadId,
        contactName: k.conv.contactName,
        anrede: k.who.kontakt,
      });
      delivered = true;
    } catch (err) {
      if (err instanceof WhatsAppKeinLeadError || err instanceof UebersprungenError) keinLead = true;
      else result.errors.push(`${appt.id} (WhatsApp): ${err instanceof Error ? err.message : String(err)}`);
    }
    const mail = mailAus ? { sent: false } : await sendLeadEmail(appt.id, "reminder", { now }).catch(() => ({ sent: false }));
    if (mail.sent) delivered = true;
    if (delivered || keinLead) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      if (policen && delivered && appt.conversationId) {
        const { merke, STRECKE } = await import("@/lib/whatsapp/termin-strecke");
        await merke(appt.conversationId, STRECKE.policenErinnerung, { appointmentId: appt.id, art: "vortag" }).catch(() => null);
      }
      result.sent++;
    }
  }
  return result;
}
