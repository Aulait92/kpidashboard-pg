// E-Mails an den Lead (Bestätigung, Verschiebung, Absage, Erinnerung). Versand über den Lead-Mail-Baustein
// (lib/mail/lead-versand.ts, Ole 17.11.2026): Postfach des Beraters, wenn verbunden, sonst Resend von unserer
// Versanddomain mit „Vorname Nachname | Agentur“ und Antwort an den Berater. Signatur aus den Anbieterangaben.
//   Anhang: Kalenderdatei (ICS) + Buttons „Zum Kalender" / „Verschieben"; Bestätigung zusätzlich Erstinformation.
// Ohne Postfach und ohne BOOKING_EMAIL_FROM bzw. RESEND_API_KEY wird bewusst NICHT gesendet.
// Vermittler im Text wie im WhatsApp-Assistenten (vermittlerName): Sie „Herrn Kannapinn“, Du „Ole“, ohne Anrede der
// volle Name.

import { a, anredeZeile, asAnsprache, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import type { MailArt } from "@/lib/mail/kontakt-mail";
import type { LeadSignatur } from "@/lib/mail/lead-absender";
import { leadVersandKontext, sendeLeadMail, type LeadMailAnhang } from "@/lib/mail/lead-versand";
import { bereitlegenPunkte, komplettcheckMailSatz, vermittlerName, type VermittlerName } from "@/lib/whatsapp/gespraech";
import {
  buildIcs,
  customerEventById,
  googleCalendarUrl,
  type CustomerEvent,
} from "@/lib/calendar/add-to-calendar";
import { prisma } from "@/lib/prisma";

/** updated: gleicher Termin, neue Dauer (Komplettcheck auf 45 Min., lib/komplettcheck-dauer.ts) mit neuer Kalenderdatei */
export type LeadEmailKind = "booked" | "rescheduled" | "cancelled" | "reminder" | "updated";

/** Art im Kontaktverlauf (lib/mail/kontakt-mail.ts). */
const MAIL_ART: Record<LeadEmailKind, MailArt> = {
  booked: "terminbestaetigung",
  rescheduled: "terminverschiebung",
  cancelled: "terminabsage",
  reminder: "terminerinnerung",
  updated: "terminaenderung",
};

const TZ = "Europe/Berlin";
function when(d: Date): string {
  return `${new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d)} Uhr`;
}

/** „Mittwoch, 18. November“ (Berlin). */
function tagLang(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(d);
}

/** Uhrzeit kurz: „10 Uhr“, mit Minuten „10:30 Uhr“ (Berlin). */
export function uhrzeitKurz(d: Date): string {
  const p = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).formatToParts(d);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  const m = p.find((x) => x.type === "minute")?.value ?? "00";
  return m === "00" ? `${h} Uhr` : `${h}:${m} Uhr`;
}

const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Liegt der Termin (Berlin) am Tag nach `now`? */
export function istMorgen(start: Date, now: Date): boolean {
  const [y, m, d] = berlinTag(now).split("-").map(Number);
  return berlinTag(start) === new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
}

/**
 * Betreff der Erinnerung (Ole, 17.11.2026): „Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn“. Ist der Termin
 * nicht morgen, steht das Datum davor („Mittwoch, 18. November um 10:30 Uhr: …“).
 */
export function erinnerungsBetreff(o: { start: Date; now: Date; mode: "video" | "phone"; an: Ansprache; person: VermittlerName }): string {
  const tag = istMorgen(o.start, o.now) ? "Morgen" : tagLang(o.start);
  const art = o.mode === "video" ? "Videotermin" : "Telefontermin";
  return `${tag} um ${uhrzeitKurz(o.start)}: ${a(o.an, "Dein", "Ihr")} ${art} mit ${o.person.dat}`;
}

/** Hinweis unter dem Videolink (wie in der WhatsApp-Bestätigung). */
export const BROWSER_HINWEIS = "Der Link funktioniert direkt im Browser, ohne App.";

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Absatz als HTML, Adressen anklickbar. */
function absatzHtml(l: string): string {
  return esc(l).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#2563eb">${u}</a>`);
}

export type LeadEmailOpts = {
  /** Vermittler im Text (vermittlerName); ohne: Name aus dem Termin */
  person?: VermittlerName;
  /** Jetzt (für „Morgen“ im Betreff der Erinnerung) */
  now?: Date;
  /** Öffentliche Erstinformation (nur Bestätigung) */
  erstinfoUrl?: string | null;
  /** Erstinformation liegt als PDF bei (nur Bestätigung) */
  erstinfoPdf?: boolean;
  /**
   * Vorbereitung (Vorlage „Termin: Vorbereitung“ auf „Automatisch“, M3): Bereitlegen-Liste (bereitlegenListe) und
   * Komplettcheck-Satz, nur in Bestätigung bzw. Einladung und Vortags-Mail. null = ohne Vorbereitungsteil.
   */
  vorbereitung?: Vorbereitung | null;
};

/** Vorbereitungsteil der Termin-Mails: Liste aus bereitlegenListe, Komplettcheck nur bei „Ja“. */
export type Vorbereitung = { bereitlegen: string[]; komplettcheck: boolean; familie: boolean };

/** Block „Vorbereitung“ (ohne Dauer in Minuten, Ole 17.11.2026): Komplettcheck-Satz, Einleitung und Punkte. */
export function vorbereitungBlock(v: Vorbereitung | null | undefined, an: Ansprache, person: { nom: string }): { saetze: string[]; punkte: string[] } | null {
  if (!v) return null;
  const punkte = bereitlegenPunkte(v.bereitlegen);
  const saetze = [
    ...(v.komplettcheck ? [komplettcheckMailSatz(an, person, v.familie)] : []),
    ...(punkte.length ? [a(an, "Leg dir zum Termin bitte bereit:", "Legen Sie sich zum Termin bitte bereit:")] : []),
  ];
  if (!saetze.length) return null;
  return { saetze, punkte };
}

export function content(kind: LeadEmailKind, ev: CustomerEvent, kontakt: AnredeKontakt | string, an: Ansprache = "sie", opts: LeadEmailOpts = {}) {
  const w = when(ev.start);
  const person = opts.person ?? { nom: ev.advisorName, dat: ev.advisorName };
  const art = ev.mode === "video" ? "Videoberatung" : "telefonische Beratung";
  // Anrede je Ansprache des Kunden (Ole, 14.11.2026): „Guten Tag Frau Schneider,“ (bzw. voller Name / „Guten Tag,“), Du „Hallo Julia,“
  const hi = anredeZeile(an, typeof kontakt === "string" ? { fullName: kontakt } : kontakt);
  const how =
    ev.mode === "video"
      ? ev.videoUrl
        ? [`Hier der Link zum Videocall: ${ev.videoUrl}`, BROWSER_HINWEIS]
        : [a(an, "Den Link zum Videocall bekommst du rechtzeitig vor dem Termin.", "Den Link zum Videocall bekommen Sie rechtzeitig vor dem Termin.")]
      : [a(an, `${person.nom} ruft dich zur vereinbarten Zeit an.`, `${person.nom} ruft Sie zur vereinbarten Zeit an.`)];
  const dein = a(an, "Dein", "Ihr");
  const vb = vorbereitungBlock(opts.vorbereitung, an, person);
  const r = inhalt();
  // Reihenfolge in der Mail: lines, Vorbereitung, nach (z. B. Erstinformation), dann Kalender-Knöpfe
  return { ...r, vorbereitung: r.vorbereitung ?? null, nach: r.nach ?? [] };

  function inhalt(): { subject: string; lines: string[]; calendar: boolean; vorbereitung?: ReturnType<typeof vorbereitungBlock>; nach?: string[] } {
    switch (kind) {
      case "booked": {
        const url = opts.erstinfoUrl?.trim();
        const erstinfo = opts.erstinfoPdf
          ? [erstinfoMailZeile(an, person.dat), ...(url ? [a(an, `Die Erstinformation findest du auch online: ${url}`, `Die Erstinformation finden Sie auch online: ${url}`)] : [])]
          : url
            ? [
                a(
                  an,
                  `Die Erstinformation zu ${person.dat} als Versicherungsvermittler findest du hier: ${url}`,
                  `Die Erstinformation zu ${person.dat} als Versicherungsvermittler finden Sie hier: ${url}`,
                ),
              ]
            : [];
        return {
          subject: `${dein} Termin mit ${person.dat}: ${w}`,
          lines: [hi, `vielen Dank! ${a(an, "Deine", "Ihre")} ${art} mit ${person.dat} ist gebucht: ${w}.`, ...how],
          calendar: true,
          vorbereitung: vb,
          nach: erstinfo,
        };
      }
      case "rescheduled":
        return {
          subject: `Neuer Termin mit ${person.dat}: ${w}`,
          lines: [hi, `${a(an, "dein", "Ihr")} Termin mit ${person.dat} wurde verschoben. Neue Zeit: ${w}.`, ...how],
          calendar: true,
        };
      case "reminder":
        return {
          subject: erinnerungsBetreff({ start: ev.start, now: opts.now ?? new Date(), mode: ev.mode, an, person }),
          lines: [hi, `kurze Erinnerung an ${a(an, "deine", "Ihre")} ${art} mit ${person.dat}: ${w}.`, ...how],
          calendar: true,
          vorbereitung: vb,
        };
      case "updated": {
        // Ohne Dauer (Ole, 17.11.2026 spät): die längere Zeit steht nur in der Kalenderdatei
        return {
          subject: `${dein} Termin mit ${person.dat}: aktualisierter Kalendereintrag`,
          lines: [
            hi,
            a(
              an,
              `damit ${person.nom} im Termin auch deine übrigen Verträge mit dir durchsehen kann, haben wir den Kalendereintrag aktualisiert. Die Uhrzeit bleibt: ${w}.`,
              `damit ${person.nom} im Termin auch Ihre übrigen Verträge mit Ihnen durchsehen kann, haben wir den Kalendereintrag aktualisiert. Die Uhrzeit bleibt: ${w}.`,
            ),
            a(an, "Den aktualisierten Kalendereintrag findest du unten.", "Den aktualisierten Kalendereintrag finden Sie unten."),
            ...how,
          ],
          calendar: true,
        };
      }
      case "cancelled":
        return {
          subject: `Abgesagt: ${dein} Termin mit ${person.dat} am ${w}`,
          lines: [
            hi,
            `${a(an, "dein", "Ihr")} Termin am ${w} wurde abgesagt.`,
            a(
              an,
              "Wenn du einen neuen Termin möchtest, antworte einfach auf diese E-Mail oder melde dich per WhatsApp.",
              "Wenn Sie einen neuen Termin möchten, antworten Sie einfach auf diese E-Mail oder melden Sie sich per WhatsApp.",
            ),
          ],
          calendar: false,
        };
    }
  }
}

/** Text und HTML der Termin-Mail mit Signatur (rein). */
export function leadEmailBody(c: ReturnType<typeof content>, ev: CustomerEvent, sig: LeadSignatur): { text: string; html: string } {
  const icsUrl = `${new URL(ev.manageUrl).origin}/book/manage/${ev.token}/ics`;
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;${
      primary ? "background:#2563eb;color:#ffffff" : "border:1px solid #d6dde8;color:#0b1220"
    }">${esc(label)}</a>`;
  const html = `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220;font-size:15px;line-height:1.5">
  ${c.lines.map((l) => `<p style="margin:0 0 14px">${absatzHtml(l)}</p>`).join("")}
  ${
    c.vorbereitung
      ? `${c.vorbereitung.saetze.map((l) => `<p style="margin:0 0 8px">${absatzHtml(l)}</p>`).join("")}${
          c.vorbereitung.punkte.length ? `<ul style="margin:0 0 14px;padding-left:20px;list-style-type:disc">${c.vorbereitung.punkte.map((p) => `<li style="margin:0 0 4px">${esc(p)}</li>`).join("")}</ul>` : ""
        }`
      : ""
  }
  ${c.nach.map((l) => `<p style="margin:0 0 14px">${absatzHtml(l)}</p>`).join("")}
  ${
    c.calendar
      ? `<p style="margin:18px 0 6px;font-size:13px;color:#6b7a96">Zum Kalender hinzufügen</p>
  ${btn(icsUrl, "iPhone / Outlook", true)}${btn(googleCalendarUrl(ev), "Google Kalender")}
  <p style="margin:18px 0 6px;font-size:13px;color:#6b7a96">Passt es doch nicht?</p>
  ${btn(ev.manageUrl, "Termin verschieben oder absagen")}`
      : ""
  }
  ${sig.html}
</div>`;
  const text = [
    ...c.lines,
    ...(c.vorbereitung ? [...c.vorbereitung.saetze, ...c.vorbereitung.punkte.map((p) => `• ${p}`)] : []),
    ...c.nach,
    ...(c.calendar ? ["", `Zum Kalender hinzufügen: ${icsUrl}`, `Verschieben oder absagen: ${ev.manageUrl}`] : []),
    "",
    sig.text,
  ].join("\n");
  return { text, html };
}

/** Mail an den Lead senden. Gibt zurück, ob gesendet wurde (und warum nicht). */
export async function sendLeadEmail(
  appointmentId: string,
  kind: LeadEmailKind,
  opts: { now?: Date } = {},
): Promise<{ sent: boolean; reason?: string }> {
  const res = await sendLeadEmailInner(appointmentId, kind, opts.now ?? new Date());
  // Nur Termin-ID + Ergebnis loggen, keine E-Mail-Adresse (DSGVO).
  console.log(
    `[lead email] ${kind} ${appointmentId}: ${res.sent ? "gesendet" : `nicht gesendet (${res.reason})`}`,
  );
  // Die Adresse steht am Termin (einladungAn), nicht im Ergebnis
  return res.sent ? { sent: true } : { sent: false, reason: res.reason };
}

async function sendLeadEmailInner(
  appointmentId: string,
  kind: LeadEmailKind,
  now: Date,
): Promise<{ sent: boolean; reason?: string; to?: string }> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      customerId: true,
      conversationId: true,
      leadId: true,
      customer: { select: { leadAddress: true, mailAblauf: true } },
    },
  });
  if (!appt) return { sent: false, reason: "not_found" };
  // Ohne Chat (Mail-Strecke, Lead ohne WhatsApp, lib/mail-strecke): Adresse und Name vom Lead
  if (!appt.conversationId && !appt.leadId) return { sent: false, reason: "no_conversation" };
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: appt.conversationId },
        select: { contactEmail: true, contactName: true, contactPhone: true, leadId: true },
      })
    : await prisma.lead
        .findUnique({ where: { id: appt.leadId! }, select: { email: true, name: true, phone: true, id: true } })
        .then((l) => (l ? { contactEmail: l.email, contactName: l.name, contactPhone: l.phone ?? "", leadId: l.id } : null));
  const to = conv?.contactEmail?.trim();
  if (!to) return { sent: false, reason: "no_email" };
  const ev = await customerEventById(appointmentId);
  if (!ev) return { sent: false, reason: "not_found" };

  const leadId = appt.leadId ?? conv?.leadId ?? null;
  const who = await ansprechpartner({ customerId: appt.customerId, leadId, phone: conv?.contactPhone, name: conv?.contactName });
  const an = asAnsprache(appt.customer?.leadAddress);
  const k = await leadVersandKontext(appt.customerId, { leadId, who });
  const person = vermittlerName(an, { name: k.vermittler.name, anrede: k.vermittler.anrede, fallback: ev.advisorName });
  // Erstinformation als PDF-Anhang an der Terminbestätigung (§ 16 VersVermV: dauerhafter Datenträger; bucht der
  // Lead selbst, ist das oft der erste Kontakt). Nur vollständige Erstinformationen (lib/erstinformation.ts).
  // Dazu immer der Link zur Erstinformation (Ole, 17.11.2026).
  const erstinfo = kind === "booked" ? await erstinfoAnhang(appt.customerId) : null;
  const vorbereitung = await vorbereitungFuer(kind, appt, appointmentId, now);
  const c = content(kind, ev, who.kontakt, an, { person, now, erstinfoUrl: kind === "booked" ? k.daten.erstinfoUrl : null, erstinfoPdf: !!erstinfo, vorbereitung });

  const attachments: LeadMailAnhang[] = [
    ...(c.calendar ? [{ fileName: "termin.ics", data: Buffer.from(buildIcs(ev), "utf8"), contentType: "text/calendar; charset=utf-8" }] : []),
    ...(erstinfo ? [{ fileName: erstinfo.fileName, data: Buffer.from(erstinfo.bytes), contentType: "application/pdf" }] : []),
  ];
  // Versand und Eintrag im Verlauf des Leads (automatisch, mit Zustellstatus)
  const res = await sendeLeadMail(k, {
    to,
    inhalt: (sig) => ({ subject: c.subject, ...leadEmailBody(c, ev, sig) }),
    attachments,
    protokoll: { customerId: appt.customerId, leadId, art: MAIL_ART[kind] },
  });
  if (!res.sent) {
    if (res.reason !== "not_configured") console.error("[lead email]", kind, res.reason);
    return { sent: false, reason: res.reason };
  }
  // Einladung mit Kalendereintrag (lib/calendar/einladung.ts): gesendet am (einmal) und an welche Adresse
  if (c.calendar && kind !== "reminder") {
    await prisma.appointment.updateMany({ where: { id: appointmentId, einladungAt: null }, data: { einladungAt: now } });
    await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAn: to } }).catch(() => null);
  }
  return { sent: true, to };
}

/**
 * Vorbereitungsteil (M3, Ole 18.11.2026): nur in Bestätigung bzw. Einladung und Vortags-Mail, nur wenn die Vorlage
 * „Termin: Vorbereitung“ auf „Automatisch“ steht (Customer.mailAblauf). „Aus“ bzw. „Ein Tipp“ lassen nur diesen Teil weg,
 * die Bestätigung und die Erinnerung selbst bleiben. Fehler hier verhindern den Versand nie.
 */
async function vorbereitungFuer(
  kind: LeadEmailKind,
  appt: { conversationId: string | null; leadId?: string | null; customer: { mailAblauf: unknown } | null },
  appointmentId: string,
  now: Date,
): Promise<Vorbereitung | null> {
  if (kind !== "booked" && kind !== "reminder") return null;
  if (leseMailAblauf(appt.customer?.mailAblauf).stufen.termin_vorbereitung !== "auto") return null;
  if (!appt.conversationId) {
    // Termin über die Mail-Strecke (ohne Chat): Bereitlegen aus Formular und Angaben der Seite
    if (!appt.leadId) return null;
    return import("@/lib/mail-strecke/server")
      .then((m) => m.vorbereitungOhneChat(appt.leadId!, appointmentId))
      .catch(() => null);
  }
  try {
    const { bereitlegenFuerTermin } = await import("@/lib/whatsapp/termin-strecke");
    const v = await bereitlegenFuerTermin(appt.conversationId, appointmentId, now);
    return v ? { bereitlegen: v.liste, komplettcheck: v.komplettcheck, familie: v.familie } : null;
  } catch (err) {
    console.error("[lead email] Vorbereitung", err instanceof Error ? err.message.slice(0, 160) : err);
    return null;
  }
}

/** Satz zum Anhang mit der Erstinformation (beide Fassungen, ohne Gedankenstriche). */
export function erstinfoMailZeile(an: Ansprache, advisor: string): string {
  return a(
    an,
    `Im Anhang findest du die Erstinformation zu ${advisor} als Versicherungsvermittler (PDF).`,
    `Im Anhang finden Sie die Erstinformation zu ${advisor} als Versicherungsvermittler (PDF).`,
  );
}

async function erstinfoAnhang(customerId: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  try {
    const { erstinfoBereit, erstinfoDokument } = await import("@/lib/erstinformation");
    if (!(await erstinfoBereit(customerId))) return null;
    return await erstinfoDokument({ customerId });
  } catch (err) {
    console.error("[lead email] Erstinformation", err instanceof Error ? err.message : err);
    return null;
  }
}
