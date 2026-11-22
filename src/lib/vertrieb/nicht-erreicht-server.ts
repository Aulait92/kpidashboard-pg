// Versand nach „Nicht erreicht“ im Vertriebs-CRM (Ole, 22.11.2026): E-Mail (Angebots-Mailweg, Antwort an Ole) und
// WhatsApp von der Support-Nummer, beide mit persönlichem Buchungslink. Regeln und Texte: lib/vertrieb/nicht-erreicht.ts.

import { prisma } from "@/lib/prisma";
import { sendCustomerMail } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { anredeName } from "@/lib/ansprache";
import { sendeVorlageAnKontakt } from "@/lib/angebot-zahlungserinnerung-server";
import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { whatsappErlaubtStand } from "@/lib/vertrieb/bonus-erinnerung-server";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import {
  NE_MAIL_AKTIVITAET,
  NE_TEMPLATE_BODY,
  NE_TEMPLATE_NAME,
  NE_WA_AKTIVITAET,
  istWarm,
  nichtErreichtMail,
  nichtErreichtStopp,
} from "@/lib/vertrieb/nicht-erreicht";

export type NichtErreichtErgebnis = { mail: "sent" | string; whatsapp: "sent" | string } | { stopp: string };

/** Nach dem Ergebnis „Nicht erreicht“ (Anruf): Mail und WhatsApp senden, wenn die Regeln es erlauben. Wirft nicht. */
export async function nachNichtErreicht(contactId: string, now = new Date()): Promise<NichtErreichtErgebnis> {
  try {
    const c = await prisma.salesContact.findUnique({
      where: { id: contactId },
      select: { id: true, email: true, name: true, salutation: true, firstName: true, lastName: true, customerSource: true, art17GeloeschtAt: true },
    });
    if (!c) return { stopp: "kein Kontakt" };
    const [gesperrt, inbound, termin, angebot, mailIn, waIn, waErlaubt, letzte] = await Promise.all([
      kontaktGesperrt(contactId),
      prisma.salesInboundLead.findFirst({ where: { contactId }, select: { id: true } }),
      prisma.salesMeeting.findFirst({ where: { contactId }, select: { id: true } }),
      prisma.offer.findFirst({ where: { salesContactId: contactId, isTest: false }, select: { id: true } }),
      prisma.salesEmail.findFirst({ where: { contactId, direction: "IN", isAutoReply: false }, select: { id: true } }),
      prisma.message.findFirst({ where: { direction: "inbound", conversation: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: contactId } }, select: { id: true } }),
      whatsappErlaubtStand(contactId),
      prisma.salesActivity.findFirst({
        where: { contactId, outcome: { in: [NE_MAIL_AKTIVITAET, NE_WA_AKTIVITAET] } },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
    ]);
    const warm = istWarm({ inbound: !!inbound, termin: !!termin, angebot: !!angebot, antwort: !!mailIn || !!waIn, whatsappErlaubt: waErlaubt.erlaubt, source: c.customerSource });
    const stopp = nichtErreichtStopp({ gesperrt: gesperrt || !!c.art17GeloeschtAt, warm, letzteNachricht: letzte?.occurredAt ?? null }, now);
    if (stopp) return { stopp };

    const { loadFollowupSettings } = await import("@/lib/vertrieb/followup");
    const { publicSalesBookingUrl, vertriebsLinkFuerKontakt } = await import("@/lib/vertrieb/buchung");
    // Eingestellter Buchungslink (Follow-up-Einstellungen), sonst unsere Buchungsseite; persönlich, wenn online buchbar
    const eingestellt = (await loadFollowupSettings()).bookingUrl?.trim() || publicSalesBookingUrl();
    const buchungslink = await vertriebsLinkFuerKontakt(eingestellt, contactId).catch(() => eingestellt);

    // E-Mail
    let mail = "keine_adresse";
    if (c.email && !c.email.endsWith("@kontakt.invalid")) {
      const text = nichtErreichtMail({ buchungslink });
      const anrede = anredeName("sie", { salutation: c.salutation, firstName: c.firstName, lastName: c.lastName, fullName: null });
      const r = await sendCustomerMail({
        to: c.email,
        subject: text.subject,
        greeting: anrede ? `Guten Tag ${anrede},` : "Guten Tag,",
        paragraphs: text.paragraphs,
        ...(text.button ? { button: text.button } : {}),
      });
      mail = r.ok ? "sent" : "failed";
      await prisma.salesActivity.create({
        data: { contactId, type: "EMAIL", outcome: r.ok ? NE_MAIL_AKTIVITAET : "Nicht erreicht: E-Mail fehlgeschlagen", note: r.ok ? `An ${c.email}, Betreff: ${text.subject}` : r.error },
      });
    }

    // WhatsApp: nur mit Buchungslink (Pflichtfeld der Vorlage), Mobilnummer und freigegebener Vorlage
    let whatsapp = "kein_buchungslink";
    if (buchungslink) {
      whatsapp = await sendeVorlageAnKontakt({
        salesContactId: contactId,
        contactName: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name,
        du: false,
        vorlage: async () => {
          const { supportVorlagenNutzbar } = await import("@/lib/vertrieb/termin-whatsapp");
          return (await supportVorlagenNutzbar())(NE_TEMPLATE_NAME, 2) ? { name: NE_TEMPLATE_NAME, body: NE_TEMPLATE_BODY } : null;
        },
        params: (anrede) => [anrede, buchungslink],
        activity: NE_WA_AKTIVITAET,
        logRef: { dealId: null, salesContactId: contactId },
        errorLabel: "nicht-erreicht-whatsapp",
        now,
      });
    }
    return { mail, whatsapp };
  } catch (err) {
    reportError(err, "nicht-erreicht", { contact: contactId });
    return { stopp: "Fehler" };
  }
}

/** Kurzer Satz fürs Fenster nach dem Speichern bzw. den Verlauf. */
export function ergebnisText(r: NichtErreichtErgebnis): string | null {
  if ("stopp" in r) {
    if (r.stopp === "Kaltkontakt") return "Keine Nachricht: Kaltkontakt ohne Einwilligung.";
    if (r.stopp === "schon gesendet") return "Keine Nachricht: in den letzten 7 Tagen schon gesendet.";
    if (r.stopp === "gesperrt") return "Keine Nachricht: Kontakt gesperrt.";
    return null;
  }
  const teile = [r.mail === "sent" ? "E-Mail" : null, r.whatsapp === "sent" ? "WhatsApp" : null].filter(Boolean);
  const mailGrund = r.mail === "failed" ? "E-Mail fehlgeschlagen" : r.mail === "keine_adresse" ? "keine E-Mail-Adresse" : null;
  const waGrund: Record<string, string> = {
    festnetz: "WhatsApp nicht möglich (Festnetz)",
    no_phone: "WhatsApp nicht möglich (keine Nummer)",
    no_template: "WhatsApp wartet auf Freigabe der Vorlage bei Meta",
    no_account: "WhatsApp nicht verbunden",
    opted_out: "WhatsApp abgemeldet",
    kein_buchungslink: "WhatsApp braucht einen Buchungslink",
  };
  const extra = [mailGrund, r.whatsapp !== "sent" ? waGrund[r.whatsapp] : null].filter(Boolean).join(", ");
  const haupt = teile.length ? `${teile.join(" und ")} gesendet.` : "Keine Nachricht gesendet.";
  return extra ? `${haupt} ${extra[0].toUpperCase()}${extra.slice(1)}.` : haupt;
}
