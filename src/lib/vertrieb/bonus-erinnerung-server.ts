// Erinnerung vor Ablauf des Abschlussbonus (Ole, 18.11.2026): Versand im WhatsApp-Cron (Mails über den
// Angebots-Mailweg, Push an Ole, WhatsApp über die Support-Nummer) und „WhatsApp erlaubt“ am Vertriebskontakt.
// Plan, Stopp-Regeln und Texte: lib/vertrieb/bonus-erinnerung.ts.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail, type CustomerMailOpts } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { customerGreeting, logOfferActivity } from "@/lib/offer-links";
import { abschlussBonusJetzt, berlinTodayIso, eur } from "@/lib/offer-pricing";
import { ersetzt, sendeVorlageAnKontakt } from "@/lib/angebot-zahlungserinnerung-server";
import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import {
  bonusErinnerungStopp,
  bonusMail,
  bonusVorlage,
  faelligeBonusSchritte,
  whatsappErlaubtAus,
  type BonusSchritt,
  type WhatsappErlaubtQuelle,
} from "@/lib/vertrieb/bonus-erinnerung";

// ─── „WhatsApp erlaubt“ ───────────────────────────────────────────────

/** Stand „WhatsApp erlaubt“ eines Vertriebskontakts (von Hand gesetzt oder automatisch abgeleitet). */
export async function whatsappErlaubtStand(contactId: string): Promise<{ erlaubt: boolean; quelle: WhatsappErlaubtQuelle }> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { whatsappErlaubt: true } });
  if (!c) return { erlaubt: false, quelle: null };
  if (c.whatsappErlaubt != null) return whatsappErlaubtAus({ manuell: c.whatsappErlaubt, terminWhatsApp: false, eingehend: false });
  // Terminbestätigung bzw. -erinnerung per WhatsApp bekommen (lib/vertrieb/termin-whatsapp.ts)
  const termin = await prisma.salesMeeting.findFirst({
    where: { contactId, OR: [{ waConfirmStatus: "sent" }, { waReminderStatus: "sent" }, { waSoonStatus: "sent" }] },
    select: { id: true },
  });
  if (termin) return whatsappErlaubtAus({ manuell: null, terminWhatsApp: true, eingehend: false });
  // Selbst auf der Support-Nummer geschrieben
  const eingehend = await prisma.message.findFirst({
    where: { direction: "inbound", conversation: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: contactId } },
    select: { id: true },
  });
  return whatsappErlaubtAus({ manuell: null, terminWhatsApp: false, eingehend: !!eingehend });
}

/** Häkchen in der Kontaktakte: von Hand setzen bzw. entfernen (gilt dann statt der Automatik). */
export async function setzeWhatsappErlaubt(contactId: string, erlaubt: boolean, now = new Date()): Promise<void> {
  await prisma.salesContact.update({ where: { id: contactId }, data: { whatsappErlaubt: erlaubt, whatsappErlaubtAt: now } });
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: erlaubt ? "WhatsApp erlaubt (von Hand gesetzt)" : "WhatsApp nicht erlaubt (von Hand entfernt)" } });
}

// ─── Cron ──────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Antwort des Kontakts seit dem Versand: Mail (Instantly bzw. erfasst) oder WhatsApp auf der Support-Nummer. */
async function hatGeantwortet(o: { salesContactId: string | null; sentAt: Date | null; createdAt: Date }): Promise<boolean> {
  if (!o.salesContactId) return false;
  const seit = o.sentAt ?? o.createdAt;
  const mail = await prisma.salesEmail.findFirst({ where: { contactId: o.salesContactId, direction: "IN", isAutoReply: false, sentAt: { gt: seit } }, select: { id: true } });
  if (mail) return true;
  const wa = await prisma.message.findFirst({
    where: { direction: "inbound", createdAt: { gt: seit }, conversation: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: o.salesContactId } },
    select: { id: true },
  });
  return !!wa;
}

export function angebotsLink(token: string): string {
  return `${getAppUrl()}/angebot/${token}`;
}

const FELD: Record<BonusSchritt, "bonusMailVorabAt" | "bonusMailLetzterAt" | "bonusPushAt" | "bonusWhatsAppAt"> = {
  vorab: "bonusMailVorabAt",
  letzter: "bonusMailLetzterAt",
  push: "bonusPushAt",
  whatsapp: "bonusWhatsAppAt",
};

type OfferRow = NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>>;

/** Verschickte, offene Angebote mit Bonusfrist zwischen `von` und `bis` (Versand und „Geplante Nachrichten“). */
export function bonusOffenWhere(von: Date, bis: Date) {
  return {
    status: "sent",
    isTest: false,
    acceptedAt: null,
    declinedAt: null,
    abschlussBonus: { gt: 0 },
    abschlussBonusBis: { gte: von, lte: bis },
  } satisfies Prisma.OfferWhereInput;
}

export type BonusCronErgebnis = { geprueft: number; mails: number; pushes: number; whatsapp: number; uebersprungen: number };

export async function runBonusErinnerungen(now = new Date(), opts: { limit?: number } = {}): Promise<BonusCronErgebnis> {
  const out: BonusCronErgebnis = { geprueft: 0, mails: 0, pushes: 0, whatsapp: 0, uebersprungen: 0 };
  // Frist höchstens 2 Tage entfernt (Tag vor Ablauf und letzter Tag); ohne gesetzte Frist endet der Bonus am Versandtag
  const where = bonusOffenWhere(now, new Date(now.getTime() + 2 * DAY + 3_600_000));
  const offers = await prisma.offer.findMany({ where, orderBy: { abschlussBonusBis: "asc" }, take: opts.limit ?? 200 });
  for (const o of offers) {
    out.geprueft++;
    try {
      const schritte = faelligeBonusSchritte(o, now);
      if (!schritte.length) continue;
      if (bonusErinnerungStopp(o, now, { ersetzt: await ersetzt(o) })) continue;
      // Abmeldung (Sperrliste, Cold-Mail abgemeldet): gar nichts, auch kein Push
      if (await kontaktGesperrt(o.salesContactId)) continue;
      const antwort = await hatGeantwortet(o);
      for (const s of schritte) {
        // Schritt beanspruchen (zwei Läufe gleichzeitig senden nicht doppelt), nur solange das Angebot offen ist
        const claimed = await prisma.offer.updateMany({ where: { id: o.id, [FELD[s]]: null, ...where }, data: { [FELD[s]]: now } });
        if (claimed.count !== 1) continue;
        if (s === "push") {
          if (await bonusPush(o, now, antwort)) out.pushes++;
        } else if (s === "whatsapp") {
          const status = await bonusWhatsApp(o, now, antwort);
          if (status === "sent") out.whatsapp++;
          else out.uebersprungen++;
        } else if (await bonusMailSenden(o, s, now, antwort)) out.mails++;
        else out.uebersprungen++;
      }
    } catch (err) {
      reportError(err, "bonus-erinnerung", { offer: o.number });
    }
  }
  return out;
}

/** Mail der Bonus-Erinnerung (gemeinsam für Versand und Vorschau). null: keine Mail-Adresse oder kein Bonus mehr. */
export async function bonusMailOpts(o: OfferRow, art: "vorab" | "letzter", now = new Date()): Promise<CustomerMailOpts | null> {
  const bonus = abschlussBonusJetzt(o, now);
  if (!o.email || !bonus) return null;
  const text = bonusMail(art, { betrag: bonus.betrag, fristIso: berlinTodayIso(bonus.bis), number: o.number, du: o.mailDu, spaeterZahlen: o.allowPayLater });
  return {
    to: o.email,
    subject: text.subject,
    greeting: await customerGreeting(o, o.mailDu),
    paragraphs: text.paragraphs,
    button: { label: text.button, url: angebotsLink(o.token) },
  };
}

async function bonusMailSenden(o: OfferRow, art: "vorab" | "letzter", now: Date, antwort: boolean): Promise<boolean> {
  const label = art === "vorab" ? "Bonus-Erinnerung (Tag vor Ablauf)" : "Bonus-Erinnerung (letzter Tag)";
  if (antwort) {
    await logOfferActivity(o, `${label} nicht gesendet: Kontakt hat geantwortet`);
    return false;
  }
  const mail = await bonusMailOpts(o, art, now);
  if (!mail) return false;
  const sent = await sendCustomerMail(mail);
  await logOfferActivity(
    o,
    sent.ok ? `${label} per E-Mail an ${o.email} gesendet` : `${label} per E-Mail fehlgeschlagen`,
    sent.ok ? `Betreff: ${mail.subject}` : sent.error,
    null,
    "EMAIL",
  );
  return sent.ok;
}

async function bonusPush(o: OfferRow, now: Date, antwort: boolean): Promise<boolean> {
  const bonus = abschlussBonusJetzt(o, now);
  if (!bonus) return false;
  const name = o.contactName.trim() || o.company?.trim() || o.number;
  await sendToAdmins({
    title: `⏰ Bonus läuft heute ab: ${name}`,
    body: [o.company?.trim() && o.company.trim() !== name ? o.company.trim() : null, `${eur(bonus.betrag)} bis 23:59 Uhr`, antwort ? "hat geantwortet" : "jetzt anrufen?"]
      .filter(Boolean)
      .join(" · "),
    // Kontaktakte mit „Anrufen“ oben (die Middleware führt auf die neue Oberfläche)
    url: o.salesContactId ? `/admin/neu/vertrieb/kontakte/${o.salesContactId}` : "/admin/neu/vertrieb/angebote",
    tag: `bonus-heute:${o.id}`,
  }).catch((err) => reportError(err, "bonus-erinnerung-push"));
  return true;
}

/** WhatsApp am letzten Tag (13 Uhr). Ergebnis steht in bonusWhatsAppStatus. */
async function bonusWhatsApp(o: OfferRow, now: Date, antwort: boolean): Promise<string> {
  const status = await (async () => {
    if (antwort) return "geantwortet";
    if (!o.salesContactId) return "no_contact";
    const erlaubt = await whatsappErlaubtStand(o.salesContactId);
    if (!erlaubt.erlaubt) return "nicht_erlaubt";
    const bonus = abschlussBonusJetzt(o, now);
    if (!bonus) return "kein_bonus";
    const link = angebotsLink(o.token);
    return sendeVorlageAnKontakt({
      salesContactId: o.salesContactId,
      contactName: o.contactName,
      du: o.mailDu,
      vorlage: async () => {
        const { supportVorlagenNutzbar } = await import("@/lib/vertrieb/termin-whatsapp");
        return bonusVorlage(o.mailDu, o.allowPayLater, await supportVorlagenNutzbar());
      },
      params: (anrede) => [anrede, eur(bonus.betrag), link],
      activity: "Bonus-Erinnerung (letzter Tag) per WhatsApp gesendet",
      logRef: o,
      errorLabel: "bonus-erinnerung-whatsapp",
      now,
    });
  })();
  await prisma.offer.update({ where: { id: o.id }, data: { bonusWhatsAppStatus: status } }).catch(() => {});
  // Bis zur Freigabe der Vorlage bei Meta nur protokollieren
  if (status === "no_template") await logOfferActivity(o, "Bonus-Erinnerung per WhatsApp nicht gesendet: Vorlage bei Meta noch nicht freigegeben");
  return status;
}
