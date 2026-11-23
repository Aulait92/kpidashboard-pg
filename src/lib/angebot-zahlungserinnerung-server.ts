// Zahlungserinnerung (Ole, 16.11.2026): Datum setzen (Kunde auf der Angebotsseite, nur wenn Ole „Später zahlen
// erlauben“ am Angebot gesetzt hat; Admin immer), Versand im WhatsApp-Cron (E-Mail und WhatsApp über die
// Support-Nummer), Aufgabe „Zahlung offen“ für Ole, Push nach 7 Tagen und Startverschiebung bei Zahlung nach dem
// Start. Plan und Texte: lib/angebot-zahlungserinnerung.ts.

import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail, type CustomerMailOpts } from "@/lib/email";
import { AB_ANGEBOT } from "@/lib/vertrieb/ab-tests";
import { fassung } from "@/lib/vertrieb/ab-tests-server";
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
  istErsetzt,
  jetztSenden,
  naechsteErinnerung,
  pruefeErinnerungsDatum,
  pushFaellig,
  startVerschobenMail,
  tagDatum,
  tagIso,
  verschobenerStart,
  zahlungEingerichtet,
  zahlungVorlage,
} from "@/lib/angebot-zahlungserinnerung";
import { anredeName } from "@/lib/ansprache";
import { entscheidungsCallStand } from "@/lib/vertrieb/entscheidungs-call-server";
import { entscheidungsCallMailText } from "@/lib/vertrieb/entscheidungs-call";

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
    if (data.mailDu !== undefined) {
      // Schon ein Kundenkonto zu diesem Angebot: Du/Sie gegenüber dem Vermittler mitziehen (lib/vermittler-ansprache.ts)
      const ob = await prisma.onboarding.findUnique({ where: { offerId: offer.id }, select: { customerId: true } });
      if (ob) {
        const { setzeVermittlerDu } = await import("@/lib/vermittler-ansprache-server");
        await setzeVermittlerDu(ob.customerId, data.mailDu);
      }
    }
    if (data.allowPayLater !== undefined) {
      await logOfferActivity(offer, data.allowPayLater ? `Später zahlen erlaubt (${offer.number})` : `Später zahlen nicht mehr erlaubt (${offer.number})`);
    }
  }
  return { ok: true };
}

// ─── Cron ──────────────────────────────────────────────────────────────

export const OFFEN_WHERE = {
  status: "accepted",
  isTest: false,
  acceptedAt: { not: null },
  paymentStatus: { notIn: ["paid", "processing"] },
  stripeSubscriptionId: null,
  stripeScheduleId: null,
  // Überweisung gewählt: Rechnung läuft, das Mahnwesen übernimmt (keine Doppelnachrichten)
  zahlweise: null,
} satisfies Prisma.OfferWhereInput;

/** Kontakt auf der Sperrliste (Cold-Mail abgemeldet)? */
async function gesperrt(contactId: string | null): Promise<boolean> {
  return kontaktGesperrt(contactId);
}

/** Gibt es eine neuere Version des Angebots (gleicher Kontakt bzw. Deal)? */
export async function ersetzt(o: { id: string; createdAt: Date; salesContactId: string | null; dealId: string | null }): Promise<boolean> {
  const owner = o.salesContactId ? { salesContactId: o.salesContactId } : o.dealId ? { dealId: o.dealId } : null;
  if (!owner) return false;
  // Regel: istErsetzt (lib/angebot-zahlungserinnerung.ts), hier schon in der Abfrage vorgefiltert
  const kandidaten = await prisma.offer.findMany({
    where: { ...owner, id: { not: o.id }, createdAt: { gt: o.createdAt }, status: { not: "superseded" } },
    select: { id: true, createdAt: true, status: true, salesContactId: true, dealId: true },
    take: 1,
  });
  return istErsetzt(o, kandidaten);
}

export type CronErgebnis = { geprueft: number; gesendet: number; whatsapp: number; aufgaben: number; pushes: number };

export async function runZahlungserinnerungen(now = new Date(), opts: { limit?: number } = {}): Promise<CronErgebnis> {
  const out: CronErgebnis = { geprueft: 0, gesendet: 0, whatsapp: 0, aufgaben: 0, pushes: 0 };
  const offers = await prisma.offer.findMany({ where: OFFEN_WHERE, orderBy: { acceptedAt: "asc" }, take: opts.limit ?? 200 });
  for (const o of offers) {
    out.geprueft++;
    try {
      const neuere = await ersetzt(o);
      const e = naechsteErinnerung(o, now, { ersetzt: neuere });
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
      if (fresh && pushFaellig(fresh, now, { ersetzt: neuere })) {
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

/** Mail der Zahlungserinnerung (gemeinsam für Versand und Vorschau). */
export async function zahlungMailOpts(
  o: Pick<OfferRow, "id" | "email" | "number" | "startDate" | "mailDu" | "salesContactId" | "contactName" | "ohneEntscheidungsCall">,
  stufe: number,
  link: string,
  now = new Date(),
): Promise<CustomerMailOpts> {
  // Entscheidungs-Call schon gebucht (auch erst nach dem Angebot): Termin nennen, geprüft bei jedem Versand.
  // Ohne Buchung wie bisher kein Buchungslink (das Angebot ist schon angenommen).
  const call = o.ohneEntscheidungsCall ? null : await entscheidungsCallStand(o.salesContactId, now).catch(() => null);
  const callText = call?.art === "gebucht" ? entscheidungsCallMailText(call, o.mailDu) : null;
  // A/B-Test der Angebots-Strecke (lib/vertrieb/ab-tests.ts): Fassung des Angebots, ohne neue Zuteilung (gezählt werden
  // Angebote ab Angebotsmail bzw. Bonus-Erinnerung; schon angenommene Angebote kämen sonst verzerrt dazu)
  const naechsteSchritte = (await fassung(AB_ANGEBOT, o.id)) === "b";
  const text = erinnerungsMail({ number: o.number, startIso: tagIso(o.startDate), stufe, du: o.mailDu, entscheidungsCall: callText, naechsteSchritte });
  return {
    to: o.email ?? "",
    subject: text.subject,
    greeting: await customerGreeting(o, o.mailDu),
    paragraphs: text.paragraphs,
    button: { label: text.button, url: link },
  };
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
    const mail = await zahlungMailOpts(o, stufe, link, now);
    const sent = await sendCustomerMail(mail);
    res.mail = sent.ok;
    await logOfferActivity(
      o,
      sent.ok ? `Zahlungserinnerung ${stufe} per E-Mail an ${o.email} gesendet` : `Zahlungserinnerung ${stufe} per E-Mail fehlgeschlagen`,
      sent.ok ? `Betreff: ${mail.subject}` : sent.error,
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
  // Fassung 2 (Ole Kannapinn), sobald bei Meta freigegeben, sonst Fassung 1 (Team)
  return sendeVorlageAnKontakt({
    salesContactId: o.salesContactId,
    contactName: o.contactName,
    du: o.mailDu,
    vorlage: async () => {
      const { supportVorlagenNutzbar } = await import("@/lib/vertrieb/termin-whatsapp");
      return zahlungVorlage(o.mailDu, await supportVorlagenNutzbar());
    },
    params: (anrede) => [anrede, o.number, link],
    activity: "Zahlungserinnerung per WhatsApp gesendet",
    logRef: o,
    errorLabel: "zahlungserinnerung-whatsapp",
    now,
  });
}

const waClean = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim() || "-";

/** Anrede für {{1}} einer Vorlage an einen Vertriebskontakt (gemeinsam für Versand und Vorschau). */
export function vorlagenAnrede(
  contact: { firstName?: string | null; lastName?: string | null; salutation?: string | null } | null | undefined,
  du: boolean,
  contactName: string,
): string {
  return du
    ? contact?.firstName?.trim() || contactName.trim().replace(/^(herr|frau)\s+/i, "").split(/\s+/)[0]
    : // Sie: „Herr Mustermann“ nur bei bekannter Anrede, sonst Vor- und Nachname (nie geraten)
      anredeName("sie", { salutation: contact?.salutation, firstName: contact?.firstName, lastName: contact?.lastName, fullName: contactName }) ||
        [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() ||
        contactName.trim();
}

/** Parameter einer Vorlage (ohne Zeilenumbrüche, je höchstens 300 Zeichen, wie Meta es verlangt). */
export function vorlagenParams(params: (anrede: string) => string[], anrede: string): string[] {
  return params(waClean(anrede)).map((v) => waClean(v).slice(0, 300));
}

/**
 * Vorlage über die Support-Nummer an einen Vertriebskontakt (Zahlungserinnerung zum Angebot, Mahnwesen
 * lib/mahnwesen-server.ts): nur verbunden, mit freigegebener Vorlage und ohne Abmeldung. Legt die Nachricht im
 * Support-Chat ab und vermerkt sie im Verlauf. Wirft nie; Ergebnis „sent“ oder der Grund.
 */
export async function sendeVorlageAnKontakt(opts: {
  salesContactId: string | null;
  contactName: string;
  du: boolean;
  vorlage: () => Promise<{ name: string; body: string } | null>;
  params: (anrede: string) => string[];
  activity: string;
  /** Zusatz im Verlaufseintrag (z. B. die Fassung eines A/B-Tests) */
  activityNote?: string;
  logRef: { dealId: string | null; salesContactId: string | null };
  errorLabel: string;
  now?: Date;
}): Promise<string> {
  const now = opts.now ?? new Date();
  try {
    if (!opts.salesContactId) return "no_contact";
    const contact = await prisma.salesContact.findUnique({ where: { id: opts.salesContactId }, select: { phone: true, firstName: true, lastName: true, salutation: true } });
    const phone = contact?.phone ? normalizePhone(contact.phone) : null;
    if (!phone) return "no_phone";
    // Festnetz: WhatsApp kommt dort nicht an (wie termin-whatsapp); Mail-Weg bleibt
    const { istFestnetz } = await import("@/lib/telefon-typ");
    if (await istFestnetz(phone)) return "festnetz";
    const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { id: true, status: true, apiKeyEnc: true } });
    if (acc?.status !== "connected" || !acc.apiKeyEnc) return "no_account";
    const tpl = await opts.vorlage();
    if (!tpl) return "no_template";
    const { name, body } = tpl;
    const prior = await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } }, select: { optedOutAt: true } });
    if (prior?.optedOutAt) return "opted_out";

    const anrede = vorlagenAnrede(contact, opts.du, opts.contactName);
    const params = vorlagenParams(opts.params, anrede);
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
        salesContactId: opts.salesContactId,
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
    await logOfferActivity(opts.logRef, opts.activity, opts.activityNote ?? null);
    return "sent";
  } catch (err) {
    reportError(err, opts.errorLabel, { contact: opts.salesContactId ?? "" });
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
