// Ein Versandweg für alle automatischen E-Mails an Leads und Endkunden (Ole, 17.11.2026, Paket P0
// „Lead-Mail-Baustein“): Terminbestätigung, Verschiebung, Absage, Erinnerung (lib/calendar/lead-email.ts),
// „Kein WhatsApp“ (lib/whatsapp/kein-whatsapp.ts) und Einwilligungs-Mails im Bestand (lib/bestand/einwilligung-server.ts).
//
//   1. Postfach verbunden: Versand aus dem Postfach des zuständigen Beraters (Team) bzw. eines Inhabers (ohne
//      Zuteilung). Signatur: User.mailSignature, sonst die Signatur aus den Anbieterangaben.
//   2. Sonst bzw. wenn das Postfach scheitert: Resend von unserer Versanddomain (BOOKING_EMAIL_FROM bzw.
//      LEAD_EMAIL_FROM) mit Anzeigename „Vorname Nachname | Agentur“ und Antwort an den Berater. Signatur aus den
//      Anbieterangaben (Name, Agentur, Anschrift, Telefon, Erstinformation). Ohne Adresse oder Schlüssel wird bewusst
//      nicht gesendet (keine fremde Domain im Absender).
// Beide Wege protokollieren im Kontaktverlauf (lib/mail/kontakt-mail.ts). Keine Gedankenstriche (ohneGedankenstriche).

import { prisma } from "@/lib/prisma";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { firmDisplayName } from "@/lib/advisor-name";
import { erstinfoDaten, type ErstinfoWeb } from "@/lib/erstinformation-shared";
import { ansprechpartner, type LeadAnsprechpartner } from "@/lib/lead-anrede";
import type { Salutation } from "@/lib/ansprache";
import type { MailProtokoll } from "@/lib/mail/kontakt-mail";
import { leadFromKopf, leadMailAdresse, leadSignatur, postfachSignatur, type LeadAbsenderDaten, type LeadSignatur } from "@/lib/mail/lead-absender";

export type LeadVersandKontext = {
  customerId: string;
  leadId: string | null;
  /** Name, Agentur und Anbieterangaben für Anzeigename und Signatur */
  daten: LeadAbsenderDaten;
  /** Vermittler als Person für den Text („Herrn Kannapinn“, lib/whatsapp/gespraech.ts vermittlerName) */
  vermittler: { name: string | null; anrede: Salutation | null };
  /** Verbundenes Postfach, über das gesendet wird (null: Resend) */
  postfach: { userId: string; signatur: string | null } | null;
  /** Antwort an (nur Resend) */
  replyTo: string | undefined;
};

/**
 * Absender für Mails an einen Lead (bzw. ohne Lead an einen Endkunden des Kunden) ermitteln. `who` aus
 * ansprechpartner(), wenn schon geladen.
 */
export async function leadVersandKontext(customerId: string, opts: { leadId?: string | null; who?: LeadAnsprechpartner } = {}): Promise<LeadVersandKontext> {
  const leadId = opts.leadId ?? null;
  const [who, lead, customer, record, owners] = await Promise.all([
    opts.who ?? ansprechpartner({ customerId, leadId }),
    leadId
      ? prisma.lead
          .findUnique({ where: { id: leadId }, select: { assignedUserId: true, assignedUser: { select: { email: true, teamRole: true, customerId: true } } } })
          .catch(() => null)
      : null,
    prisma.customer
      .findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true, onboarding: { select: { websiteInfo: true } }, agentConfig: { select: { advisorEmail: true } } } })
      .catch(() => null),
    prisma.erstinformation.findUnique({ where: { customerId }, select: { name: true, firma: true, anschrift: true, telefon: true } })
      .catch(() => null),
    prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } }).catch(() => []),
  ]);
  const web = (customer?.onboarding?.websiteInfo ?? undefined) as ErstinfoWeb | undefined;
  const d = erstinfoDaten(record, web, { name: customer?.name, vermittlerTyp: customer?.vermittlerTyp });
  const firm = firmDisplayName(customer?.name);
  // Person: zuständiger Berater bzw. Name laut Anbieterangaben (wie der Assistent), sonst der Beratername bzw. die Agentur
  const name = who.vermittler.name || who.advisor || d.name || firm;
  const agentur = d.firma || firm || null;

  let erstinfoUrl: string | null = null;
  try {
    const { erstinfoUrlFor } = await import("@/lib/erstinformation");
    erstinfoUrl = await erstinfoUrlFor(customerId);
  } catch (err) {
    console.error("[lead-versand] Erstinformation", err instanceof Error ? err.message : err);
  }

  // Team: der zuständige Berater (nur sein Postfach, Antworten an ihn); ohne Zuteilung die Inhaber
  const assigned = lead?.assignedUserId && lead.assignedUser?.customerId === customerId ? lead.assignedUserId : null;
  const kandidaten = assigned ? [assigned] : owners.map((o) => o.id);
  const conns = kandidaten.length
    ? await prisma.mailConnection
        .findMany({ where: { userId: { in: kandidaten }, customerId, status: "ok" }, select: { userId: true, user: { select: { mailSignature: true } } } })
        .catch(() => [])
    : [];
  const conn = kandidaten.map((id) => conns.find((c) => c.userId === id)).find(Boolean) ?? null;
  const replyTo =
    (assigned && lead?.assignedUser?.teamRole !== "owner" ? lead?.assignedUser?.email : null) ||
    customer?.agentConfig?.advisorEmail ||
    (assigned ? lead?.assignedUser?.email : null) ||
    owners[0]?.email ||
    undefined;

  return {
    customerId,
    leadId,
    daten: { name, agentur, anschrift: d.anschrift || null, telefon: d.telefon || null, erstinfoUrl },
    vermittler: who.vermittler,
    postfach: conn ? { userId: conn.userId, signatur: conn.user.mailSignature ?? null } : null,
    replyTo: replyTo?.trim() || undefined,
  };
}

export type LeadMailInhalt = { subject: string; text: string; html?: string };
export type LeadMailAnhang = { fileName: string; contentType: string; data: Buffer };
export type LeadMailErgebnis = { sent: true; via: "postfach" | "resend" } | { sent: false; reason: string };

/**
 * Mail an einen Lead bzw. Endkunden senden: erst Postfach, sonst Resend (siehe Kopf). `inhalt` bekommt die Signatur
 * des jeweiligen Wegs und liefert Betreff, Text und optional HTML. Wirft nicht.
 */
export async function sendeLeadMail(
  k: LeadVersandKontext,
  o: { to: string; inhalt: (signatur: LeadSignatur) => LeadMailInhalt; attachments?: LeadMailAnhang[]; protokoll: MailProtokoll },
): Promise<LeadMailErgebnis> {
  const standard = leadSignatur(k.daten);
  if (k.postfach) {
    const m = o.inhalt(postfachSignatur(k.postfach.signatur) ?? standard);
    try {
      const { sendViaPostfach } = await import("@/lib/mail/postfach");
      const res = await sendViaPostfach(k.postfach.userId, { to: o.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(o.attachments?.length ? { attachments: o.attachments } : {}) }, o.protokoll);
      if (res.ok) return { sent: true, via: "postfach" };
      console.error("[lead-versand] Postfach", res.raw ?? res.error);
    } catch (err) {
      console.error("[lead-versand] Postfach", err instanceof Error ? err.message : err);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adresse = leadMailAdresse();
  if (!apiKey || !adresse) return { sent: false, reason: "not_configured" };
  const m = o.inhalt(standard);
  const { sendeKontaktMailResend } = await import("@/lib/mail/kontakt-mail");
  const res = await sendeKontaktMailResend(
    apiKey,
    {
      from: leadFromKopf(k.daten.name, k.daten.agentur, adresse),
      to: o.to,
      ...(k.replyTo ? { replyTo: k.replyTo } : {}),
      subject: ohneGedankenstriche(m.subject),
      text: ohneGedankenstriche(m.text),
      ...(m.html ? { html: ohneGedankenstriche(m.html) } : {}),
      ...(o.attachments?.length ? { attachments: o.attachments.map((a) => ({ filename: a.fileName, content: a.data, contentType: a.contentType })) } : {}),
    },
    o.protokoll,
  );
  // Testumgebung (MAIL_NUR_AN): gilt wie bisher als erledigt, im Verlauf steht „nicht versendet“
  if (!res.ok && !res.blocked) return { sent: false, reason: res.error };
  return { sent: true, via: "resend" };
}
