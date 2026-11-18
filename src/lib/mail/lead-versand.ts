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
//
// BCC-Kopie (Paket M1, Ole 17.11.2026): Nur auf dem Resend-Weg und nur, wenn unter Einstellungen → Assistent an
// (Customer.mailAblauf, lib/mail/ablauf.ts), geht eine Kopie an die gewählte Adresse (Standard: die eigene). Die Kopie
// ist eine eigene Mail ohne Eintrag im Verlauf: Ein Zustellfehler der Kopie markiert nie die Mail an den Lead.
// Mit Postfach liegt die Mail ohnehin in „Gesendet“, dort keine Kopie.
//
// Antwortadresse (Paket M2, Ole 18.11.2026): Auf dem Resend-Weg mit Lead und eingeschaltetem MAIL_ANTWORT_EINGANG ist
// Reply-To <kurzname>.<leadcode>@antwort.dein-beratungstermin.de (lib/mail/antwort-adresse.ts); Antworten stehen dann im
// Verlauf und gehen weiter an den Vermittler (lib/mail/eingang.ts). Mit verbundenem Postfach (auch wenn es einmal
// scheitert) und bei ausgeschaltetem Schalter bleibt Reply-To die Adresse des Vermittlers.

import { prisma } from "@/lib/prisma";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { firmDisplayName } from "@/lib/advisor-name";
import { erstinfoDaten, type ErstinfoWeb } from "@/lib/erstinformation-shared";
import { ansprechpartner, type LeadAnsprechpartner } from "@/lib/lead-anrede";
import type { Salutation } from "@/lib/ansprache";
import type { MailProtokoll } from "@/lib/mail/kontakt-mail";
import { leadFromKopf, leadMailAdresse, leadSignatur, postfachSignatur, type LeadAbsenderDaten, type LeadSignatur } from "@/lib/mail/lead-absender";
import { bccEmpfaenger, leseMailAblauf } from "@/lib/mail/ablauf";

export type LeadVersandKontext = {
  customerId: string;
  leadId: string | null;
  /** Name, Agentur und Anbieterangaben für Anzeigename und Signatur */
  daten: LeadAbsenderDaten;
  /** Vermittler als Person für den Text („Herrn Kannapinn“, lib/whatsapp/gespraech.ts vermittlerName) */
  vermittler: { name: string | null; anrede: Salutation | null };
  /** Verbundenes Postfach, über das gesendet wird (null: Resend) */
  postfach: { userId: string; signatur: string | null } | null;
  /** Adresse des Vermittlers bzw. zuständigen Beraters (Reply-To ohne Antwortadresse, Ziel der Weiterleitung) */
  replyTo: string | undefined;
  /** Antwortadresse mit Eingang (nur Resend, nur ohne Postfach, nur mit Schalter); null = Reply-To ist replyTo */
  antwortAdresse?: string | null;
  /** BCC-Kopie an (nur Resend; null = aus) */
  kopieAn: string | null;
};

/**
 * Adresse für Antworten an den Vermittler (rein): wer selbst schreibt (außer Inhaber), sonst der zuständige Berater
 * (außer Inhaber), sonst die Berateradresse aus dem Assistenten, sonst der zuständige Inhaber, sonst der erste Inhaber.
 */
export function vermittlerAdresse(o: {
  schreiber?: { email: string; teamRole: string | null } | null;
  zustaendig?: { email: string; teamRole: string | null } | null;
  advisorEmail?: string | null;
  ersterInhaber?: string | null;
}): string | undefined {
  const v =
    (o.schreiber && o.schreiber.teamRole !== "owner" ? o.schreiber.email : null) ||
    (o.zustaendig && o.zustaendig.teamRole !== "owner" ? o.zustaendig.email : null) ||
    o.advisorEmail ||
    o.zustaendig?.email ||
    o.ersterInhaber ||
    undefined;
  return v?.trim() || undefined;
}

/** Versand über unsere Versanddomain eingerichtet (Schlüssel und Absenderadresse)? */
export function resendBereit(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.RESEND_API_KEY && !!leadMailAdresse(env);
}

/**
 * Absender für Mails an einen Lead (bzw. ohne Lead an einen Endkunden des Kunden) ermitteln. `who` aus
 * ansprechpartner(), wenn schon geladen.
 */
export async function leadVersandKontext(
  customerId: string,
  opts: {
    leadId?: string | null;
    who?: LeadAnsprechpartner;
    /** Login, der die Mail selbst schreibt (Dialog): sein Postfach zuerst, Antworten an ihn */
    schreiber?: string | null;
    /** Nur lesen (Vorschau, Anzeige): keine Erstinformation anlegen, ohne Datensatz kein Link */
    nurLesen?: boolean;
  } = {},
): Promise<LeadVersandKontext> {
  const leadId = opts.leadId ?? null;
  const [who, lead, customer, record, owners, schreiber] = await Promise.all([
    opts.who ?? ansprechpartner({ customerId, leadId }),
    leadId
      ? prisma.lead
          .findUnique({ where: { id: leadId }, select: { assignedUserId: true, assignedUser: { select: { email: true, teamRole: true, customerId: true } } } })
          .catch(() => null)
      : null,
    prisma.customer
      .findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true, mailAblauf: true, onboarding: { select: { websiteInfo: true } }, agentConfig: { select: { advisorEmail: true } } } })
      .catch(() => null),
    prisma.erstinformation.findUnique({ where: { customerId }, select: { name: true, firma: true, anschrift: true, telefon: true } })
      .catch(() => null),
    prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } }).catch(() => []),
    opts.schreiber
      ? prisma.user.findFirst({ where: { id: opts.schreiber, customerId }, select: { id: true, email: true, teamRole: true } }).catch(() => null)
      : null,
  ]);
  const web = (customer?.onboarding?.websiteInfo ?? undefined) as ErstinfoWeb | undefined;
  const d = erstinfoDaten(record, web, { name: customer?.name, vermittlerTyp: customer?.vermittlerTyp });
  const firm = firmDisplayName(customer?.name);
  // Person: zuständiger Berater bzw. Name laut Anbieterangaben (wie der Assistent), sonst der Beratername bzw. die Agentur
  const name = who.vermittler.name || who.advisor || d.name || firm;
  const agentur = d.firma || firm || null;

  let erstinfoUrl: string | null = null;
  try {
    if (opts.nurLesen) {
      const e = await prisma.erstinformation.findUnique({ where: { customerId }, select: { token: true } });
      if (e?.token) erstinfoUrl = (await import("@/lib/public-url")).publicUrlOr(`/erstinformation/${e.token}`);
    } else {
      const { erstinfoUrlFor } = await import("@/lib/erstinformation");
      erstinfoUrl = await erstinfoUrlFor(customerId);
    }
  } catch (err) {
    console.error("[lead-versand] Erstinformation", err instanceof Error ? err.message : err);
  }

  // Team: der zuständige Berater (nur sein Postfach, Antworten an ihn); ohne Zuteilung die Inhaber
  const assigned = lead?.assignedUserId && lead.assignedUser?.customerId === customerId ? lead.assignedUserId : null;
  // Selbst geschrieben (Dialog): nur das eigene Postfach, sonst unsere Versanddomain mit Antwort an den Schreiber
  const kandidaten = schreiber ? [schreiber.id] : assigned ? [assigned] : owners.map((o) => o.id);
  const conns = kandidaten.length
    ? await prisma.mailConnection
        .findMany({ where: { userId: { in: kandidaten }, customerId, status: "ok" }, select: { userId: true, user: { select: { mailSignature: true } } } })
        .catch(() => [])
    : [];
  const conn = kandidaten.map((id) => conns.find((c) => c.userId === id)).find(Boolean) ?? null;
  const replyTo = vermittlerAdresse({
    schreiber,
    zustaendig: assigned && lead?.assignedUser ? { email: lead.assignedUser.email, teamRole: lead.assignedUser.teamRole } : null,
    advisorEmail: customer?.agentConfig?.advisorEmail,
    ersterInhaber: owners[0]?.email,
  });
  // Antwortadresse mit Eingang (M2): nur ohne Postfach, mit Lead und eingeschaltetem Schalter
  let antwort: string | null = null;
  if (!conn && leadId) {
    const { antwortEingangAn, antwortAdresseFuer } = await import("@/lib/mail/antwort-adresse");
    if (antwortEingangAn()) antwort = await antwortAdresseFuer(leadId, { speichern: !opts.nurLesen }).catch(() => null);
  }

  return {
    customerId,
    leadId,
    daten: { name, agentur, anschrift: d.anschrift || null, telefon: d.telefon || null, erstinfoUrl },
    vermittler: who.vermittler,
    postfach: conn ? { userId: conn.userId, signatur: conn.user.mailSignature ?? null } : null,
    replyTo,
    antwortAdresse: antwort,
    // Kopie an die gewählte Adresse, sonst an die eigene (Schreiber, sonst Antwortadresse)
    kopieAn: bccEmpfaenger(leseMailAblauf(customer?.mailAblauf), schreiber?.email ?? replyTo ?? null),
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
  o: { to: string; inhalt: (signatur: LeadSignatur) => LeadMailInhalt; attachments?: LeadMailAnhang[]; protokoll: MailProtokoll; /** keine BCC-Kopie */ ohneKopie?: boolean },
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
  const from = leadFromKopf(k.daten.name, k.daten.agentur, adresse);
  const attachments = o.attachments?.length ? { attachments: o.attachments.map((a) => ({ filename: a.fileName, content: a.data, contentType: a.contentType })) } : {};
  const subject = ohneGedankenstriche(m.subject);
  const text = ohneGedankenstriche(m.text);
  const html = m.html ? ohneGedankenstriche(m.html) : null;
  // Antwortadresse nur, wenn kein Postfach verbunden ist (auch nicht, wenn es gerade gescheitert ist)
  const replyTo = (!k.postfach && k.antwortAdresse) || k.replyTo;
  const res = await sendeKontaktMailResend(
    apiKey,
    { from, to: o.to, ...(replyTo ? { replyTo } : {}), subject, text, ...(html ? { html } : {}), ...attachments },
    o.protokoll,
  );
  // Testumgebung (MAIL_NUR_AN): gilt wie bisher als erledigt, im Verlauf steht „nicht versendet“
  if (!res.ok && !res.blocked) return { sent: false, reason: res.error };
  if (res.ok && k.kopieAn && !o.ohneKopie) await sendeKopie(apiKey, { from, an: k.kopieAn, lead: o.to, subject, text, html, attachments });
  return { sent: true, via: "resend" };
}

/** Kopie für den Vermittler (eigene Mail, nicht im Verlauf, Fehler nur im Log). Antworten auf die Kopie gehen an den Lead. */
export function kopieInhalt(o: { lead: string; subject: string; text: string; html: string | null }): { subject: string; text: string; html: string | null } {
  const zeile = `Kopie Ihrer E-Mail an ${o.lead}`;
  return {
    subject: `Kopie: ${o.subject}`,
    text: `${zeile}\n\n${o.text}`,
    html: o.html ? `<p style="margin:0 0 12px;font-size:12px;color:#6b7a96">${zeile.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>${o.html}` : null,
  };
}

async function sendeKopie(
  apiKey: string,
  o: { from: string; an: string; lead: string; subject: string; text: string; html: string | null; attachments: { attachments?: { filename: string; content: Buffer; contentType: string }[] } },
): Promise<void> {
  try {
    const { mailClient } = await import("@/lib/mail-guard");
    const c = kopieInhalt(o);
    const sent = await mailClient(apiKey).emails.send({ from: o.from, to: o.an, replyTo: o.lead, subject: c.subject, text: c.text, ...(c.html ? { html: c.html } : {}), ...o.attachments });
    if (sent?.error) console.error("[lead-versand] Kopie", sent.error.message ?? "send_failed");
  } catch (err) {
    console.error("[lead-versand] Kopie", err instanceof Error ? err.message : err);
  }
}
