// Zahlungserinnerung (Ole, 16.11.2026): Datum setzen (Kunde auf der Angebotsseite, nur wenn Ole „Später zahlen
// erlauben“ am Angebot gesetzt hat; Admin immer), Versand im WhatsApp-Cron (E-Mail und WhatsApp über die
// Support-Nummer), Aufgabe „Zahlung offen“ für Ole, Push nach 7 Tagen und Startverschiebung bei Zahlung nach dem
// Start. Plan und Texte: lib/angebot-zahlungserinnerung.ts.

import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { customerGreeting, logOfferActivity, offerAdminHref } from "@/lib/offer-links";
import { berlinTodayIso } from "@/lib/offer-pricing";
import { decryptSecret } from "@/lib/encryption";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { renderTemplate } from "@/lib/whatsapp/templates";
import {
  erinnerungsMail,
  fmtTag,
  jetztSenden,
  naechsteErinnerung,
  pruefeErinnerungsDatum,
  pushFaellig,
  startVerschobenMail,
  tagDatum,
  tagIso,
  verschobenerStart,
  zahlungEingerichtet,
  ZAHLUNG_TEMPLATE_BODY_DU,
  ZAHLUNG_TEMPLATE_BODY_SIE,
  ZAHLUNG_TEMPLATE_DU,
  ZAHLUNG_TEMPLATE_SIE,
} from "@/lib/angebot-zahlungserinnerung";

export type SetResult = { ok: true } | { ok: false; error: string };

/** Link in Mail und WhatsApp: öffnet direkt die Stripe-Bezahlseite (sonst die Angebotsseite). */
export function zahlungsLink(token: string): string {
  return `${getAppUrl()}/angebot/${token}/zahlen`;
}

/**
 * Erinnerungsdatum setzen bzw. löschen (iso = null → Standardplan). Ein neues Datum startet die Erinnerungen
 * von vorn (Zähler, Aufgabe und Push zurückgesetzt).
 */
async function speichereDatum(offerId: string, iso: string | null, by: "kunde" | "admin"): Promise<SetResult> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, number: true, paymentReminderAt: true, salesContactId: true, dealId: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (tagIso(offer.paymentReminderAt) === iso) return { ok: true };
  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      paymentReminderAt: iso ? tagDatum(iso) : null,
      paymentReminderCount: 0,
      paymentReminderTaskAt: null,
      paymentReminderPushAt: null,
    },
  });
  await logOfferActivity(
    offer,
    iso
      ? `Zahlung erinnern am ${fmtTag(iso)} (${by === "kunde" ? "vom Kunden gewählt" : "im Admin gesetzt"})`
      : `Zahlungserinnerung ohne Datum (Standard: 3 Tage nach Annahme, dann wöchentlich)`,
  );
  return { ok: true };
}

/** Kunde auf der Angebotsseite: „Ich zahle später, erinnern Sie mich am …“ (nur mit allowPayLater). */
export async function setzeErinnerungPerToken(token: string, value: string, now = new Date()): Promise<SetResult> {
  if (!token || token.length < 20) return { ok: false, error: "Angebot nicht gefunden." };
  const offer = await prisma.offer.findUnique({ where: { token } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (!offer.allowPayLater) return { ok: false, error: "Für dieses Angebot ist eine spätere Zahlung nicht vorgesehen. Bitte richten Sie die Zahlung jetzt ein." };
  if (offer.isTest || offer.status !== "accepted") return { ok: false, error: "Dieses Angebot ist nicht angenommen." };
  if (zahlungEingerichtet(offer)) return { ok: false, error: "Die Zahlung ist bereits eingerichtet." };
  const check = pruefeErinnerungsDatum(value, berlinTodayIso(now), tagIso(offer.startDate));
  if (!check.ok) return check;
  return speichereDatum(offer.id, check.iso, "kunde");
}

/** Admin am Angebot: „Zahlung erinnern am“ (immer setzbar, schon ab heute), Anrede und „Später zahlen erlauben“. */
export async function setzeErinnerungAdmin(
  offerId: string,
  input: { date?: string | null; du?: boolean; allowPayLater?: boolean },
  now = new Date(),
): Promise<SetResult> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (input.date !== undefined) {
    if (input.date) {
      const check = pruefeErinnerungsDatum(input.date, berlinTodayIso(now), tagIso(offer.startDate), { admin: true });
      if (!check.ok) return check;
      const res = await speichereDatum(offer.id, check.iso, "admin");
      if (!res.ok) return res;
    } else {
      const res = await speichereDatum(offer.id, null, "admin");
      if (!res.ok) return res;
    }
  }
  const data: { mailDu?: boolean; allowPayLater?: boolean } = {};
  if (typeof input.du === "boolean" && input.du !== offer.mailDu) data.mailDu = input.du;
  if (typeof input.allowPayLater === "boolean" && input.allowPayLater !== offer.allowPayLater) data.allowPayLater = input.allowPayLater;
  if (Object.keys(data).length) {
    await prisma.offer.update({ where: { id: offer.id }, data });
    if (data.allowPayLater !== undefined) {
      await logOfferActivity(offer, data.allowPayLater ? `Später zahlen erlaubt (${offer.number})` : `Später zahlen nicht mehr erlaubt (${offer.number})`);
    }
  }
  return { ok: true };
}

// ─── Cron ──────────────────────────────────────────────────────────────

const OFFEN_WHERE = {
  status: "accepted",
  isTest: false,
  acceptedAt: { not: null },
  paymentStatus: { notIn: ["paid", "processing"] },
  stripeSubscriptionId: null,
  stripeScheduleId: null,
} satisfies Prisma.OfferWhereInput;

/** Kontakt auf der Sperrliste (Cold-Mail abgemeldet)? */
async function gesperrt(contactId: string | null): Promise<boolean> {
  return kontaktGesperrt(contactId);
}

/** Gibt es eine neuere Version des Angebots (gleicher Kontakt bzw. Deal)? */
async function ersetzt(o: { id: string; createdAt: Date; salesContactId: string | null; dealId: string | null }): Promise<boolean> {
  const owner = o.salesContactId ? { salesContactId: o.salesContactId } : o.dealId ? { dealId: o.dealId } : null;
  if (!owner) return false;
  return !!(await prisma.offer.findFirst({
    where: { ...owner, id: { not: o.id }, createdAt: { gt: o.createdAt }, status: { not: "superseded" } },
    select: { id: true },
  }));
}

export type CronErgebnis = { geprueft: number; gesendet: number; whatsapp: number; aufgaben: number; pushes: number };

export async function runZahlungserinnerungen(now = new Date(), opts: { limit?: number } = {}): Promise<CronErgebnis> {
  const out: CronErgebnis = { geprueft: 0, gesendet: 0, whatsapp: 0, aufgaben: 0, pushes: 0 };
  const offers = await prisma.offer.findMany({ where: OFFEN_WHERE, orderBy: { acceptedAt: "asc" }, take: opts.limit ?? 200 });
  for (const o of offers) {
    out.geprueft++;
    try {
      const istErsetzt = await ersetzt(o);
      const e = naechsteErinnerung(o, now, { ersetzt: istErsetzt });
      if (jetztSenden(e, now) && e) {
        // Stufe beanspruchen (zwei Läufe gleichzeitig senden nicht doppelt)
        const claimed = await prisma.offer.updateMany({
          where: { id: o.id, paymentReminderCount: e.stufe - 1, ...OFFEN_WHERE },
          data: { paymentReminderCount: e.stufe, paymentReminderLastAt: now },
        });
        if (claimed.count === 1) {
          const r = await sendeErinnerung(o, e.stufe, now);
          if (r.mail) out.gesendet++;
          if (r.whatsapp) out.whatsapp++;
          if (await aufgabeAnlegen(o, now)) out.aufgaben++;
        }
      }
      const fresh = await prisma.offer.findUnique({ where: { id: o.id } });
      if (fresh && pushFaellig(fresh, now, { ersetzt: istErsetzt })) {
        const claimed = await prisma.offer.updateMany({ where: { id: o.id, paymentReminderPushAt: null }, data: { paymentReminderPushAt: now } });
        if (claimed.count === 1) {
          await sendToAdmins({
            title: `💶 Zahlung weiter offen: ${o.company ?? o.contactName}`,
            body: `${o.number} · seit ${fmtTag(berlinTodayIso(fresh.paymentReminderTaskAt!))} erinnert, noch keine Zahlung`,
            url: offerAdminHref(o),
            tag: `zahlung-offen:${o.id}`,
          }).catch((err) => reportError(err, "zahlungserinnerung-push"));
          out.pushes++;
        }
      }
    } catch (err) {
      reportError(err, "zahlungserinnerung", { offer: o.number });
    }
  }
  return out;
}

type OfferRow = NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>>;

/** Aufgabe „Zahlung offen: {Name}“ im Vertriebskontakt (einmal je Erinnerungsrunde). */
async function aufgabeAnlegen(o: OfferRow, now: Date): Promise<boolean> {
  if (!o.salesContactId) return false;
  const claimed = await prisma.offer.updateMany({ where: { id: o.id, paymentReminderTaskAt: null }, data: { paymentReminderTaskAt: now } });
  if (claimed.count !== 1) return false;
  await prisma.salesTask.create({
    data: {
      contactId: o.salesContactId,
      title: `Zahlung offen: ${o.company?.trim() || o.contactName}`,
      type: "NACHFASSEN",
      note: `Angebot ${o.number} angenommen${o.acceptedAt ? ` am ${fmtTag(berlinTodayIso(o.acceptedAt))}` : ""}, Zahlung noch nicht eingerichtet. Der Kunde wurde per E-Mail erinnert.${o.startDate ? ` Start: ${fmtTag(tagIso(o.startDate)!)}.` : ""}`,
      dueAt: now,
    },
  });
  return true;
}

async function sendeErinnerung(o: OfferRow, stufe: number, now: Date): Promise<{ mail: boolean; whatsapp: boolean }> {
  const res = { mail: false, whatsapp: false };
  if (await gesperrt(o.salesContactId)) {
    await logOfferActivity(o, `Zahlungserinnerung ${stufe} nicht gesendet: Kontakt ist abgemeldet (Sperrliste)`);
    return res;
  }
  let link: string;
  try {
    link = zahlungsLink(o.token);
  } catch (err) {
    reportError(err, "zahlungserinnerung-link");
    return res;
  }
  if (o.email) {
    const text = erinnerungsMail({ number: o.number, startIso: tagIso(o.startDate), stufe, du: o.mailDu });
    const sent = await sendCustomerMail({
      to: o.email,
      subject: text.subject,
      greeting: await customerGreeting(o, o.mailDu),
      paragraphs: text.paragraphs,
      button: { label: text.button, url: link },
    });
    res.mail = sent.ok;
    await logOfferActivity(
      o,
      sent.ok ? `Zahlungserinnerung ${stufe} per E-Mail an ${o.email} gesendet` : `Zahlungserinnerung ${stufe} per E-Mail fehlgeschlagen`,
      sent.ok ? `Betreff: ${text.subject}` : sent.error,
      null,
      "EMAIL",
    );
  }
  const wa = await sendeZahlungWhatsApp(o, link, now);
  res.whatsapp = wa === "sent";
  return res;
}

/** WhatsApp über die Support-Nummer (nur verbunden und mit freigegebener Vorlage). Wirft nie. */
export async function sendeZahlungWhatsApp(o: OfferRow, link: string, now = new Date()): Promise<string> {
  try {
    if (!o.salesContactId) return "no_contact";
    const contact = await prisma.salesContact.findUnique({ where: { id: o.salesContactId }, select: { phone: true, firstName: true, lastName: true } });
    const phone = contact?.phone ? normalizePhone(contact.phone) : null;
    if (!phone) return "no_phone";
    const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { id: true, status: true, apiKeyEnc: true } });
    if (acc?.status !== "connected" || !acc.apiKeyEnc) return "no_account";
    const name = o.mailDu ? ZAHLUNG_TEMPLATE_DU : ZAHLUNG_TEMPLATE_SIE;
    const body = o.mailDu ? ZAHLUNG_TEMPLATE_BODY_DU : ZAHLUNG_TEMPLATE_BODY_SIE;
    const tpl = await prisma.messageTemplate.findUnique({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name, language: "de" } },
      select: { status: true },
    });
    if (tpl?.status !== "approved") return "no_template";
    const prior = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } }, select: { optedOutAt: true } });
    if (prior?.optedOutAt) return "opted_out";

    const clean = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-";
    const anrede = o.mailDu
      ? contact?.firstName?.trim() || o.contactName.trim().replace(/^(herr|frau)\s+/i, "").split(/\s+/)[0]
      : [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() || o.contactName.trim();
    const params = [clean(anrede), clean(o.number), clean(link)].map((v) => v.slice(0, 300));
    const { sendTemplate } = await import("@/lib/whatsapp/dialog360");
    const r = await sendTemplate(decryptSecret(acc.apiKeyEnc), phone, name, "de", [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]);
    const conv = await prisma.conversation.upsert({
      where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } },
      create: {
        customerId: SUPPORT_CUSTOMER_ID,
        whatsAppAccountId: acc.id,
        contactPhone: phone,
        contactName: anrede,
        botActive: false,
        status: "open",
        lastMessageAt: now,
        salesContactId: o.salesContactId,
        contactMatchedAt: now,
      },
      update: { lastMessageAt: now },
      select: { id: true },
    });
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: "outbound",
        kind: "template",
        body: renderTemplate(body, params),
        waMessageId: r.messageId,
        status: "sent",
        sentBy: "system",
        pricingCategory: "utility",
      },
    });
    await logOfferActivity(o, `Zahlungserinnerung per WhatsApp gesendet`);
    return "sent";
  } catch (err) {
    reportError(err, "zahlungserinnerung-whatsapp", { offer: o.number });
    return "failed";
  }
}

// ─── Start verschieben, wenn erst nach dem Start gezahlt wird ─────────────

/**
 * Im Stripe-Webhook vor dem Anlegen des Abo-Zeitplans: Liegt der Start vor dem Zahlungstag, beginnt das Abo am
 * nächsten Monatsersten (nichts rückwirkend). Kunde bekommt eine Mail, Ole einen Eintrag im Verlauf und den
 * Hinweis am Angebot (startShiftedFrom). Gibt den neuen Start (YYYY-MM-DD) zurück oder null.
 */
export async function startNachZahlungVerschieben(offerId: string, now = new Date()): Promise<string | null> {
  const o = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!o || o.isTest || o.stripeScheduleId || o.stripeSubscriptionId) return null;
  const altIso = tagIso(o.startDate);
  const neuIso = verschobenerStart(altIso, berlinTodayIso(now));
  if (!altIso || !neuIso) return null;
  const done = await prisma.offer.updateMany({
    where: { id: o.id, startDate: o.startDate, stripeScheduleId: null },
    data: { startDate: tagDatum(neuIso), startShiftedFrom: o.startShiftedFrom ?? o.startDate },
  });
  if (done.count !== 1) return null;
  if (o.salesContactId) {
    await prisma.salesContact.update({ where: { id: o.salesContactId }, data: { contractStart: tagDatum(neuIso) } }).catch((err) => reportError(err, "start-verschieben-kontakt"));
  }
  await logOfferActivity(o, `Start verschoben: ${fmtTag(altIso)} → ${fmtTag(neuIso)}`, "Zahlung erst nach dem Startdatum eingerichtet, das Abo beginnt am nächsten Monatsersten (nichts rückwirkend).");
  if (o.email) {
    const text = startVerschobenMail({ number: o.number, altIso, neuIso, du: o.mailDu });
    const res = await sendCustomerMail({ to: o.email, subject: text.subject, greeting: await customerGreeting(o, o.mailDu), paragraphs: text.paragraphs }).catch((err) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }));
    if (!res.ok) reportError(new Error(res.error), "start-verschieben-mail", { offer: o.number });
  }
  return neuIso;
}
