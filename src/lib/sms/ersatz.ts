// SMS-Ersatz für WhatsApp-Terminnachrichten im Vertrieb (Ole, 17.11.2026).
// Anlass: Die Terminbestätigung an einen Vertriebskontakt kam mit Meta 131026 zurück (Nummer nicht per WhatsApp
// erreichbar). Jetzt: Meldet der Status-Webhook „failed“ für eine Bestätigung oder Erinnerung von der Support-Nummer
// (Message.purpose vertrieb_termin, vertrieb_erinnerung, vertrieb_gleich), geht derselbe Text einmal per SMS raus
// (lib/sms/seven.ts). Nicht bei Abmeldung (131050, „STOPP“) oder gesperrtem Kontakt. Einmal je Nachricht (smsAt).

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { isWhatsAppOptOutCode } from "@/lib/whatsapp/zustellfehler";
import { sendSms, smsAktiv } from "@/lib/sms/seven";

const LABEL: Record<string, string> = {
  vertrieb_termin: "Terminbestätigung",
  vertrieb_erinnerung: "Terminerinnerung",
  vertrieb_gleich: "Erinnerung kurz vor dem Termin",
};

export function smsErsatzZweck(purpose: string | null | undefined): boolean {
  return !!purpose && purpose in LABEL;
}

/** WhatsApp-Text für die SMS anpassen: Hinweise aufs Antworten in WhatsApp entfallen (rein). */
export function smsText(body: string): string {
  return body
    .replace(/\s*Bei Fragen antworten Sie einfach auf diese Nachricht\.?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type SmsErsatzErgebnis = "sent" | "failed" | "skipped" | "already" | "no_key" | "blocked";

/** Nach „failed“ im Status-Webhook. Wirft nie. */
export async function smsErsatz(waMessageId: string, code: number | null, now = new Date()): Promise<SmsErsatzErgebnis> {
  try {
    if (isWhatsAppOptOutCode(code)) return "skipped";
    const msg = await prisma.message.findUnique({
      where: { waMessageId },
      select: {
        id: true,
        direction: true,
        purpose: true,
        body: true,
        smsAt: true,
        conversation: { select: { customerId: true, contactPhone: true, optedOutAt: true, salesContactId: true } },
      },
    });
    if (!msg || msg.direction !== "outbound" || !smsErsatzZweck(msg.purpose) || !msg.body) return "skipped";
    const conv = msg.conversation;
    if (conv.customerId !== SUPPORT_CUSTOMER_ID || conv.optedOutAt) return "skipped";
    if (msg.smsAt) return "already";
    if (conv.salesContactId) {
      const { kontaktGesperrt } = await import("@/lib/vertrieb/sperrliste");
      if (await kontaktGesperrt(conv.salesContactId)) return "skipped";
    }
    if (!smsAktiv()) return "no_key";
    // Einmal je Nachricht, auch wenn der Webhook „failed“ wiederholt
    const claim = await prisma.message.updateMany({ where: { id: msg.id, smsAt: null }, data: { smsAt: now } });
    if (claim.count === 0) return "already";
    const r = await sendSms(conv.contactPhone, smsText(msg.body));
    await prisma.message.update({ where: { id: msg.id }, data: { smsStatus: r.status === "failed" ? `failed: ${r.error ?? ""}`.slice(0, 200) : r.status } });
    if (r.status === "sent" && conv.salesContactId) {
      await prisma.salesActivity
        .create({ data: { contactId: conv.salesContactId, type: "TERMIN", outcome: `${LABEL[msg.purpose!]} per SMS gesendet (WhatsApp nicht zustellbar)`, note: null } })
        .catch(() => {});
    }
    if (r.status === "failed") reportError(new Error(`SMS-Ersatz fehlgeschlagen: ${r.error}`), "sms-ersatz", { message: msg.id });
    return r.status;
  } catch (err) {
    reportError(err, "sms-ersatz", { waMessageId });
    return "failed";
  }
}
