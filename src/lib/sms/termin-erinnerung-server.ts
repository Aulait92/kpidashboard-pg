// SMS-Ersatz für WhatsApp-Terminerinnerungen an Leads, Datenbank-Teil (Ole, 25.11.2026; Text und Regeln in
// lib/sms/termin-erinnerung.ts). Aufruf aus dem Status-Webhook (lib/whatsapp/kein-whatsapp.ts handleFailedStatus):
// Kommt eine Erinnerung (reminder, reminder_soon, reminder_start) mit „nicht zustellbar“ zurück, geht genau einmal je
// Erinnerung (Message.smsAt) eine kurze SMS über seven.io (lib/sms/seven.ts) an den Lead.
//
// Rechtsgrundlage wie die bestehende SMS-Strecke (docs/recht/2026-11-22-sms-ohne-whatsapp.md, Nachtrag in
// docs/recht/2026-11-25-sms-terminerinnerung.md): reine Service-Nachricht zum Termin, den der Lead selbst gebucht hat
// (Art. 6 Abs. 1 lit. b DSGVO), keine Werbung, ersetzt nur den Kanal, der nicht ankam. Deshalb wie dort: nur an
// Handynummern, nicht bei Daten-Sperre (Betroffenenrechte), nicht bei Abmeldung der Nummer (Sperrliste) oder von
// WhatsApp („STOPP“, 131050), nicht für reine Pay-per-Lead-Kunden, nicht für ruhende bzw. gelöschte Kunden, nicht für
// gelöschte Leads, nur solange der Termin gebucht ist und noch bevorsteht. Ohne SEVEN_API_KEY geht nichts raus.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import type { Zustellfehler } from "@/lib/whatsapp/zustellfehler";
import { istTerminErinnerung, smsBeiZustellfehler, terminErinnerungSmsText, terminSmsFuerVerlauf } from "@/lib/sms/termin-erinnerung";

export type TerminSmsErgebnis = "sent" | "failed" | "blocked" | "no_key" | "skipped" | "already" | "kein_termin" | "keine_handynummer" | "gesperrt" | "pay_per_lead";

/** Nach „failed“ einer Terminerinnerung im Status-Webhook. Wirft nie. */
export async function terminSmsErsatz(waMessageId: string, fehler: Pick<Zustellfehler, "code" | "title">, now = new Date()): Promise<TerminSmsErgebnis> {
  try {
    if (!smsBeiZustellfehler(fehler)) return "skipped";
    const msg = await prisma.message.findUnique({
      where: { waMessageId },
      select: {
        id: true,
        direction: true,
        purpose: true,
        smsAt: true,
        createdAt: true,
        conversation: { select: { id: true, customerId: true, leadId: true, contactPhone: true, contactName: true, optedOutAt: true } },
      },
    });
    if (!msg || msg.direction !== "outbound" || !istTerminErinnerung(msg.purpose)) return "skipped";
    const conv = msg.conversation;
    if (!conv.leadId || conv.customerId === SUPPORT_CUSTOMER_ID) return "skipped";
    if (msg.smsAt) return "already";
    if (conv.optedOutAt) return "gesperrt";
    const customer = await prisma.customer.findUnique({
      where: { id: conv.customerId },
      select: { leadAddress: true, dormantSince: true, dataDeletedAt: true, archived: true },
    });
    if (!customer || customer.dormantSince || customer.dataDeletedAt || customer.archived) return "skipped";
    if (await prisma.customer.count({ where: { id: conv.customerId, ...NUR_PPL_WHERE } })) return "pay_per_lead";
    const lead = await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { id: true, name: true, phone: true, email: true, erasedAt: true } });
    if (!lead || lead.erasedAt) return "skipped";
    // Der Termin, an den erinnert wurde: nächster gebuchter, noch nicht begonnener Termin des Leads bzw. Chats
    const termin = await prisma.appointment.findFirst({
      where: { customerId: conv.customerId, status: "booked", startsAt: { gt: now }, OR: [{ leadId: lead.id }, { conversationId: conv.id }] },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, mode: true, ort: true, meetUrl: true, manageToken: true },
    });
    if (!termin) return "kein_termin";
    const phone = conv.contactPhone || lead.phone;
    const { istMobil } = await import("@/lib/telefon-typ");
    if (!phone || !(await istMobil(phone))) return "keine_handynummer";
    const { sperreFuer } = await import("@/lib/dsgvo/server");
    if (await sperreFuer(conv.customerId, { email: lead.email, phone })) return "gesperrt";
    const { optOutHash } = await import("@/lib/bestand/links");
    if (await prisma.bestandOptOut.count({ where: { customerId: conv.customerId, kind: "phone", hash: optOutHash("phone", phone), scope: "all" } })) return "gesperrt";
    const { sendSms, smsAktiv } = await import("@/lib/sms/seven");
    if (!smsAktiv()) return "no_key";
    // Genau einmal je Erinnerung, auch wenn Meta „failed“ wiederholt
    const claim = await prisma.message.updateMany({ where: { id: msg.id, smsAt: null }, data: { smsAt: now } });
    if (!claim.count) return "already";

    const [{ asAnsprache, anredeZeile }, { ansprechpartner }, { vermittlerName }, { manageUrlFor }, { smsAbsenderFuer }] = await Promise.all([
      import("@/lib/ansprache"),
      import("@/lib/lead-anrede"),
      import("@/lib/vermittler-nennung"),
      import("@/lib/public-url"),
      import("@/lib/mail-strecke/texte"),
    ]);
    const an = asAnsprache(customer.leadAddress);
    const who = await ansprechpartner({ customerId: conv.customerId, leadId: lead.id, phone, name: lead.name ?? conv.contactName });
    const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
    const verwalten = termin.manageToken ? manageUrlFor(termin.manageToken) : null;
    const video = termin.mode === "video" && termin.meetUrl ? termin.meetUrl : null;
    const link = verwalten && /^https?:\/\//.test(verwalten) ? verwalten : video;
    const text = terminErinnerungSmsText({
      an,
      hi: anredeZeile(an, who.kontakt),
      hiKurz: anredeZeile(an, null),
      personDat: person.dat,
      startsAt: termin.startsAt,
      mode: termin.mode,
      ort: termin.ort,
      link,
      linkIstVideo: !!link && link === video,
    });
    const r = await sendSms(phone, text, { from: smsAbsenderFuer(who.vermittler.name ?? who.advisor) });
    await prisma.message.update({ where: { id: msg.id }, data: { smsStatus: r.status === "failed" ? `failed: ${r.error ?? ""}`.slice(0, 200) : r.status } });
    if (r.status === "sent") {
      const { logLeadHistory } = await import("@/lib/lead-history");
      await logLeadHistory(lead.id, "status", `Terminerinnerung per SMS (WhatsApp nicht zustellbar): ${terminSmsFuerVerlauf(text)}`, { customerId: conv.customerId, userId: null }).catch(() => null);
    }
    if (r.status === "failed") reportError(new Error(`Termin-SMS fehlgeschlagen: ${r.error}`), "sms-termin-erinnerung", { message: msg.id });
    return r.status;
  } catch (err) {
    reportError(err, "sms-termin-erinnerung", { waMessageId });
    return "failed";
  }
}
