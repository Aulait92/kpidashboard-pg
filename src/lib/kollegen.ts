// „Kollegen empfehlen“: Kunden (Vermittler) empfehlen performancegrowth an
// Kollegen. Ablauf und Regeln: docs/hilfe.md („Kollegen empfehlen“).
//  - Kundenbereich /buyer/empfehlen: persönlicher Link /empfehlen/[code]
//  - Landingpage: Empfohlener trägt sich selbst ein (Einwilligung) → Vertriebskontakt
//    mit Quelle „Empfehlung“, Aufgabe „Empfehlung – heute anrufen“, Push an Admins
//  - Prämie: Neukunde hat angenommen UND erste Zahlung ist da (Stripe-Webhook)
//    → Gutschrift beim Empfehler (idempotent), sonst Admin-Aufgabe
//  - Hinweise im Kundenbereich nach positiven Momenten (je Anlass einmal)

import { NPS_PROMOTER } from "@/lib/nps";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { audit, type AuditActor } from "@/lib/audit";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { normalizeEmail, findContactIdByEmail } from "@/lib/vertrieb/contact-merge";
import {
  CONSENT_TEXT,
  CODE_RE,
  DEFAULT_SETTINGS,
  NUDGE_TEXT,
  MAX_SETUP_DISCOUNT,
  MAX_REWARD_MONTHS,
  DEFAULT_REWARD_MONTHS,
  DEFAULT_SETUP_DISCOUNT,
  normalizeRewardKind,
  rewardMonthsOf,
  benefitSentence,
  isSelfReferral,
  newReferralCode,
  normalizeBenefitKind,
  referralIncentiveSentence,
  setupDiscountAmount,
  setupDiscountDecision,
  setupDiscountLabel,
  nudgeCandidates,
  pickNudge,
  referralPath,
  referralStage,
  rewardAmount,
  rewardShort,
  type NudgeKey,
  type ReferralSettingsLike,
  type ReferralStage,
} from "@/lib/kollegen-shared";
import { applySetupDiscount, normalizeTerm, setupForChoice } from "@/lib/offer-pricing";

const DAY_MS = 24 * 60 * 60 * 1000;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** Missbrauchsbremse der öffentlichen Landingpage. */
export const MAX_PER_CODE_PER_HOUR = 5;
export const MAX_GLOBAL_PER_10_MIN = 30;
/** Löschfrist: Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen. */
export const RETENTION_DAYS = 365;
/** Hinweis so viele Tage vor Ende der Gratiszeit „Bestandskunden-Modul“ (Empfehlungsprämie). */
export const BESTAND_FREE_REMINDER_DAYS = 14;

// ─── Einstellungen ─────────────────────────────────────────────────────
export async function loadReferralSettings(): Promise<ReferralSettingsLike> {
  const row = await prisma.referralSettings.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    enabled: row.enabled,
    rewardKind: normalizeRewardKind(row.rewardKind),
    rewardFixed: row.rewardFixed != null ? Number(row.rewardFixed) : null,
    rewardMonths: row.rewardMonths,
    benefitKind: normalizeBenefitKind(row.benefitKind),
    benefitText: row.benefitText,
    benefitAmount: row.benefitAmount != null ? Number(row.benefitAmount) : null,
    nudgesEnabled: row.nudgesEnabled,
  };
}

export type SettingsInput = {
  enabled: boolean;
  rewardKind: string;
  rewardFixed: number | null;
  /** Monate Bestandskunden-Modul gratis bei „bestand“; leer = Standard 3. */
  rewardMonths?: number | null;
  benefitKind: string;
  benefitText: string | null;
  /** Rabatt auf die Einrichtung (netto) bei „setup_discount“; leer = Standard 300 €. */
  benefitAmount?: number | null;
  /** Hinweise „Kollegen empfehlen“ im Kundenbereich. */
  nudgesEnabled?: boolean;
};

export async function saveReferralSettings(input: SettingsInput, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const rewardKind = normalizeRewardKind(input.rewardKind);
  if (rewardKind === "fixed" && !(input.rewardFixed != null && input.rewardFixed > 0 && input.rewardFixed <= 10000)) {
    return { ok: false, error: "Bitte einen Betrag zwischen 1 und 10.000 € angeben." };
  }
  const rewardMonths = rewardKind === "bestand" ? (input.rewardMonths == null ? DEFAULT_REWARD_MONTHS : Math.round(input.rewardMonths)) : null;
  if (rewardMonths != null && !(rewardMonths >= 1 && rewardMonths <= MAX_REWARD_MONTHS)) {
    return { ok: false, error: `Bitte zwischen 1 und ${MAX_REWARD_MONTHS} Monaten angeben.` };
  }
  const benefitKind = normalizeBenefitKind(input.benefitKind);
  const benefitText = (input.benefitText ?? "").trim().slice(0, 300) || null;
  if (benefitKind === "custom" && !benefitText) return { ok: false, error: "Bitte den Vorteil für Neukunden kurz beschreiben." };
  let benefitAmount: number | null = null;
  if (benefitKind === "setup_discount") {
    benefitAmount = input.benefitAmount == null ? DEFAULT_SETUP_DISCOUNT : Math.round(input.benefitAmount * 100) / 100;
    if (!(benefitAmount > 0 && benefitAmount <= MAX_SETUP_DISCOUNT)) return { ok: false, error: "Bitte einen Rabatt zwischen 1 und 10.000 € angeben." };
  }
  const data = {
    enabled: input.enabled,
    rewardKind,
    rewardFixed: rewardKind === "fixed" ? input.rewardFixed : null,
    rewardMonths,
    benefitKind,
    benefitText,
    benefitAmount,
    nudgesEnabled: !!input.nudgesEnabled,
  };
  await prisma.referralSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await audit("referral.settings", { entity: "ReferralSettings", entityId: "default", details: data, actor });
  return { ok: true };
}

// ─── Code und Empfehler ────────────────────────────────────────────────
export async function ensureReferralCode(customerId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { customerId } });
  if (existing) return existing.code;
  for (let i = 0; i < 8; i++) {
    try {
      const row = await prisma.referralCode.create({ data: { customerId, code: newReferralCode() } });
      return row.code;
    } catch {
      // Code-Kollision oder parallel angelegt → erneut lesen/versuchen
      const again = await prisma.referralCode.findUnique({ where: { customerId } });
      if (again) return again.code;
    }
  }
  throw new Error("Empfehlungscode konnte nicht angelegt werden.");
}

export const referralUrl = (code: string) => `${getAppUrl()}${referralPath(code)}`;

export type Referrer = { customerId: string; person: string; agency: string; emails: string[]; salesContactId: string | null };

/** Empfehler zu einem Code (nur aktive, nicht interne Kunden). */
export async function referrerByCode(code: string): Promise<Referrer | null> {
  const c = String(code ?? "").trim().toLowerCase();
  if (!CODE_RE.test(c)) return null;
  const row = await prisma.referralCode.findUnique({
    where: { code: c },
    select: {
      customer: {
        select: {
          id: true,
          name: true,
          plan: true,
          archived: true,
          users: { where: { role: "BUYER" }, select: { email: true, displayName: true, teamRole: true } },
          salesContact: { select: { id: true, email: true, altEmails: true, firstName: true, lastName: true } },
          onboarding: { select: { offerId: true } },
        },
      },
    },
  });
  const cust = row?.customer;
  if (!cust || cust.archived || cust.plan === "internal") return null;
  const offer = cust.onboarding?.offerId ? await prisma.offer.findUnique({ where: { id: cust.onboarding.offerId }, select: { contactName: true } }) : null;
  const owner = cust.users.find((u) => u.teamRole === "owner");
  const contactName = [cust.salesContact?.firstName, cust.salesContact?.lastName].filter(Boolean).join(" ");
  const person = (offer?.contactName || owner?.displayName || contactName || "").trim();
  const agency = cust.name.replace(/^Allianz\s+(Versicherung\s+)?/i, "").trim();
  const emails = [...cust.users.map((u) => u.email), ...(cust.salesContact ? [cust.salesContact.email, ...cust.salesContact.altEmails] : [])];
  return { customerId: cust.id, person: person || agency, agency, emails, salesContactId: cust.salesContact?.id ?? null };
}

/** Einwilligungstext auf der Landingpage (mit Namen des Empfehlers, wird gespeichert). */
export function consentTextFor(referrerPerson: string): string {
  return `${CONSENT_TEXT} Außerdem bin ich einverstanden, dass ${referrerPerson} als Empfehlende/r sieht, ob ich mich gemeldet habe und ob ich Kunde werde.`;
}

// ─── Empfehlung eintragen (Landingpage) ────────────────────────────────
export type SubmitInput = { code: string; name: string; company: string; email: string; phone: string; consent: boolean };
export type SubmitResult = { ok: true; contactId: string | null } | { ok: false; error: string; code: "invalid" | "fields" | "consent" | "self" | "busy" | "paused" };

export async function submitReferral(input: SubmitInput, now = new Date()): Promise<SubmitResult> {
  const settings = await loadReferralSettings();
  if (!settings.enabled) return { ok: false, code: "paused", error: "Das Empfehlungsprogramm ist gerade pausiert. Bitte melden Sie sich direkt bei uns." };
  const ref = await referrerByCode(input.code);
  if (!ref) return { ok: false, code: "invalid", error: "Dieser Empfehlungslink ist nicht (mehr) gültig." };

  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 100);
  const company = input.company.trim().replace(/\s+/g, " ").slice(0, 150);
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim().replace(/[^\d+()/ -]/g, "").slice(0, 40);
  if (name.length < 2 || !email || phone.replace(/\D/g, "").length < 6) {
    return { ok: false, code: "fields", error: "Bitte Name, E-Mail-Adresse und Telefonnummer vollständig angeben." };
  }
  if (!input.consent) return { ok: false, code: "consent", error: "Bitte bestätigen Sie die Einwilligung." };
  if (isSelfReferral(email, ref.emails)) {
    return { ok: false, code: "self", error: "Eine Empfehlung an sich selbst oder die eigene Agentur können wir leider nicht annehmen." };
  }

  const [perCode, global] = await Promise.all([
    prisma.colleagueReferral.count({ where: { referrerId: ref.customerId, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    prisma.colleagueReferral.count({ where: { createdAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) } } }),
  ]);
  if (perCode >= MAX_PER_CODE_PER_HOUR || global >= MAX_GLOBAL_PER_10_MIN) {
    return { ok: false, code: "busy", error: "Gerade gehen sehr viele Anfragen ein. Bitte versuchen Sie es in ein paar Minuten erneut." };
  }

  const consentText = consentTextFor(ref.person);
  const existingId = await findContactIdByEmail(email);
  const existing = existingId ? await prisma.salesContact.findUnique({ where: { id: existingId }, select: { id: true, customerId: true } }) : null;
  // Eigene Kundenakte des Empfehlers (z. B. über eine weitere Adresse) → Selbstempfehlung
  if (existing && (existing.id === ref.salesContactId || existing.customerId === ref.customerId)) {
    return { ok: false, code: "self", error: "Eine Empfehlung an sich selbst oder die eigene Agentur können wir leider nicht annehmen." };
  }
  const label = `Empfehlung von ${ref.person}${ref.agency && ref.agency !== ref.person ? ` (${ref.agency})` : ""}`;

  // Schon Kunde: Empfehlung festhalten, aber ohne Prämie und ohne neue Aufgabe.
  // Dem Besucher wird dasselbe angezeigt (keine Auskunft, wer Kunde ist).
  if (existing?.customerId) {
    await prisma.colleagueReferral.create({
      data: { referrerId: ref.customerId, contactId: existing.id, name, company: company || null, email, phone, consentAt: now, consentText, existingContact: true, status: "blocked", blockedReason: "bereits Kunde", rewardStatus: "skipped" },
    });
    return { ok: true, contactId: existing.id };
  }

  const contactId = await upsertReferralContact({ existingId: existing?.id ?? null, name, company, email, phone, label });

  const referral = await prisma.colleagueReferral.create({
    data: { referrerId: ref.customerId, contactId, name, company: company || null, email, phone, consentAt: now, consentText, existingContact: !!existing },
  });
  await sendReferralConfirmation({ to: email, name, referrerPerson: ref.person, settings, withBenefit: !existing });

  try {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `🤝 Empfehlung von ${ref.person}`,
      body: `${name}${company ? ` · ${company}` : ""} – bitte heute anrufen`,
      url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/marketing/empfehlungen",
      tag: `referral:${referral.id}`,
    });
  } catch (err) {
    reportError(err, "referral-push");
  }
  return { ok: true, contactId };
}

/** Link in die App für Mails (null, wenn APP_URL fehlt: Mail geht dann ohne Knopf). */
function appLink(path: string): string | null {
  try {
    return `${getAppUrl()}${path}`;
  } catch {
    return null;
  }
}

/** Bestätigungsmail an den Empfohlenen (Sie-Form). Vorteil nur, wenn er ihn auch bekommt (neuer Kontakt). */
async function sendReferralConfirmation(o: { to: string; name: string; referrerPerson: string; settings: ReferralSettingsLike; withBenefit: boolean }) {
  const benefit = o.withBenefit ? benefitSentence(o.settings, o.referrerPerson) : null;
  const rechner = appLink("/rechner");
  await sendCustomerMail({
    to: o.to,
    subject: "Ihre Anfrage bei performancegrowth",
    greeting: `Guten Tag ${o.name},`,
    paragraphs: [
      `vielen Dank für Ihre Anfrage über die Empfehlung von ${o.referrerPerson}. Ole Kannapinn meldet sich in der Regel noch am selben oder am nächsten Werktag telefonisch bei Ihnen.`,
      ...(benefit ? [`${benefit} Der Rabatt steht dann direkt in Ihrem Angebot.`] : []),
      "Bis dahin können Sie im Rechner schon ausprobieren, wie viele Verträge Sie für Ihr Werbebudget brauchen.",
    ],
    ...(rechner ? { button: { label: "Zum Rechner", url: rechner } } : {}),
  }).catch((err) => reportError(err, "referral-confirmation-mail"));
}

/**
 * Vertriebskontakt für den Empfohlenen: Dublette nur über die E-Mail
 * (findContactIdByEmail, Haupt- und weitere Adressen), kein Abgleich über den
 * Namen – zwei verschiedene „Max Müller“ bleiben zwei Kontakte. Dazu
 * Eingangsprotokoll, Aktivität und Aufgabe „Empfehlung – heute anrufen“.
 */
async function upsertReferralContact(r: { existingId: string | null; name: string; company: string; email: string; phone: string; label: string }): Promise<string> {
  const [firstName, ...rest] = r.name.split(" ");
  const lastName = rest.join(" ") || null;
  let contactId = r.existingId;
  if (contactId) {
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true, phone: true, customerSource: true } });
    await prisma.salesContact.update({
      where: { id: contactId },
      data: {
        phone: c.phone ?? r.phone,
        // hat sich selbst gemeldet → mindestens „Interesse“
        stage: ["NEU", "NICHT_ERREICHT", "WIEDERVORLAGE", "SPAETER", "VERLOREN", "UNGUELTIG"].includes(c.stage) ? "INTERESSE" : undefined,
        lossReason: ["VERLOREN", "UNGUELTIG"].includes(c.stage) ? null : undefined,
        customerSource: c.customerSource ?? "EMPFEHLUNG",
        customerSourceNote: c.customerSource ? undefined : r.label,
      },
    });
  } else {
    const c = await prisma.salesContact.create({
      data: {
        email: r.email,
        name: r.company || r.name,
        firstName,
        lastName,
        phone: r.phone,
        stage: "INTERESSE",
        customerSource: "EMPFEHLUNG",
        customerSourceNote: r.label,
        description: `${r.label} („Kollegen empfehlen“)`,
      },
    });
    contactId = c.id;
    const { scheduleAddressEnrichment } = await import("@/lib/vertrieb/address-enrich");
    await scheduleAddressEnrichment(c.id).catch(() => {});
  }
  const info = [`Name: ${r.name}`, r.company && `Agentur: ${r.company}`, `E-Mail: ${r.email}`, `Telefon: ${r.phone}`].filter(Boolean).join("\n");
  await prisma.salesInboundLead.create({
    data: { contactId, source: "EMPFEHLUNG", name: r.name, email: r.email, phone: r.phone, campaign: r.label, form: "Kollegen empfehlen", created: !r.existingId, payload: { form: "kollegen-empfehlen" } },
  });
  await prisma.salesActivity.create({
    data: { contactId, type: "NOTIZ", outcome: `${r.label} über „Kollegen empfehlen“ eingetragen${r.existingId ? "" : " (neuer Kontakt)"}`, note: info },
  });
  await prisma.salesTask.create({ data: { contactId, title: "Empfehlung – heute anrufen", type: "ANRUF", dueAt: new Date(), note: `${r.label}\n${info}` } });
  return contactId;
}

// ─── Übersicht für den Empfehler ───────────────────────────────────────
export type ReferralRow = { id: string; name: string; company: string | null; createdAt: Date; stage: ReferralStage; rewardAmount: number | null; rewardedAt: Date | null };

export async function referralsForCustomer(customerId: string): Promise<ReferralRow[]> {
  const rows = await prisma.colleagueReferral.findMany({
    where: { referrerId: customerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      company: true,
      createdAt: true,
      status: true,
      rewardStatus: true,
      rewardAmount: true,
      rewardedAt: true,
      wonAt: true,
      contact: { select: { _count: { select: { meetings: true } }, offers: { where: { status: "accepted" }, select: { id: true }, take: 1 } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "(gelöscht)",
    company: r.company,
    createdAt: r.createdAt,
    stage: referralStage({ status: r.status, rewardStatus: r.rewardStatus, wonAt: r.wonAt, hasMeeting: (r.contact?._count.meetings ?? 0) > 0, hasAcceptedOffer: (r.contact?.offers.length ?? 0) > 0 }),
    rewardAmount: r.rewardAmount != null ? Number(r.rewardAmount) : null,
    rewardedAt: r.rewardedAt,
  }));
}

// ─── Prämie ────────────────────────────────────────────────────────────
export type RewardOutcome = "credited" | "manual" | "skipped" | null;

async function ownersOf(customerId: string) {
  return prisma.user.findMany({ where: { customerId, role: "BUYER", teamRole: "owner" }, select: { id: true, email: true } });
}

async function thankReferrer(customerId: string, referredLabel: string, amount: number | null, gift: string | null = null) {
  const owners = await ownersOf(customerId);
  const short = gift ?? (amount != null ? `${eur(amount)} netto als Gutschrift auf Ihrer nächsten Rechnung` : "Ihre Prämie");
  try {
    const { sendToUser } = await import("@/lib/push");
    for (const o of owners) {
      await sendToUser(o.id, { title: "Danke für Ihre Empfehlung! 🎁", body: `${referredLabel} ist jetzt Kunde: ${short}.`, url: "/buyer/empfehlen", tag: "referral-reward" }).catch(() => {});
    }
  } catch (err) {
    reportError(err, "referral-thanks-push");
  }
  if (!owners.length) return;
  await sendCustomerMail({
    to: owners.map((o) => o.email),
    subject: `Danke! Ihre Empfehlung ${referredLabel} ist jetzt Kunde`,
    greeting: "Guten Tag,",
    paragraphs: [
      `vielen Dank für Ihre Empfehlung: ${referredLabel} ist jetzt Kunde bei uns.`,
      gift
        ? `Als Dankeschön bekommen Sie ${gift}.`
        : amount != null
          ? `Als Dankeschön schreiben wir Ihnen ${eur(amount)} netto gut. Die Gutschrift wird mit Ihrer nächsten Rechnung verrechnet.`
          : "Als Dankeschön schreiben wir Ihnen Ihre Prämie gut.",
      "Kennen Sie noch weitere Kollegen? Ihr persönlicher Link bleibt gültig.",
    ],
    ...(appLink("/buyer/empfehlen") ? { button: { label: "Zu „Kollegen empfehlen“", url: appLink("/buyer/empfehlen")! } } : {}),
  }).catch((err) => reportError(err, "referral-thanks-mail"));
}

/** Monate addieren (kalendarisch, UTC). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

type RewardResult = { outcome: "credited" | "manual"; amount: number | null; ref: string | null; note: string | null; gift: string | null; task: string | null };

/**
 * Prämie „Bestandskunden-Modul N Monate gratis“:
 *  - Modul nicht gebucht: Modul buchen (setBestandModule) und N Monatsbeiträge gutschreiben,
 *    gratis bis heute + N Monate (Hinweis 2 Wochen vorher, abbestellen jederzeit)
 *  - Modul gebucht: N Monatsbeiträge gutschreiben; läuft noch eine Gratiszeit, verlängert sie sich
 *  - Modul kostenlos (Bestandsschutz bzw. inklusive): Admin-Aufgabe, Ole entscheidet
 * Mehrere Empfehlungen addieren sich (je N Monate).
 */
async function grantBestandReward(customerId: string, settings: ReferralSettingsLike, referralId: string, referredLabel: string, now: Date): Promise<RewardResult> {
  const n = rewardMonthsOf(settings);
  const nText = n === 1 ? "1 Monat" : `${n} Monate`;
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { stripeCustomerId: true, bestandMonthly: true, bestandGrandfathered: true, existingCustomersEnabled: true, bestandFreeUntil: true },
  });
  const manual = (note: string, task: string): RewardResult => ({ outcome: "manual", amount: null, ref: null, note, gift: null, task });
  if (!c) return manual("Empfehler nicht gefunden", `Prämie prüfen: ${nText} Bestandskunden-Modul gratis`);
  const booked = c.bestandMonthly != null && Number(c.bestandMonthly) > 0;
  if (!booked && (c.bestandGrandfathered || (c.bestandMonthly != null && Number(c.bestandMonthly) === 0) || (c.existingCustomersEnabled && c.bestandMonthly == null))) {
    return manual(
      "Bestandskunden-Modul ist schon kostenlos (Bestandsschutz bzw. inklusive). Bitte entscheiden, welche Prämie es stattdessen gibt.",
      `Prämie entscheiden (Bestandskunden-Modul schon kostenlos)`,
    );
  }
  const { billingEnabled, addGarantieGutschrift, setBestandModule } = await import("@/lib/billing");
  if (!c.stripeCustomerId || !billingEnabled()) {
    return manual(`Empfehler hat kein Stripe-Konto: Bestandskunden-Modul ${nText} gratis von Hand einrichten`, `Prämie von Hand: ${nText} Bestandskunden-Modul gratis`);
  }
  let price = booked ? Number(c.bestandMonthly) : 0;
  if (!booked) {
    const r = await setBestandModule(customerId, "book", { actor: { role: "system" } });
    if (!r.ok) return manual(`Modul konnte nicht gebucht werden: ${r.error}`, `Prämie von Hand: ${nText} Bestandskunden-Modul gratis`);
    const after = await prisma.customer.findUnique({ where: { id: customerId }, select: { bestandMonthly: true } });
    price = after?.bestandMonthly != null ? Number(after.bestandMonthly) : 0;
  }
  const amount = rewardAmount(settings, null, price);
  if (amount == null) return manual("Monatspreis des Moduls nicht bestimmbar", `Prämie von Hand: ${nText} Bestandskunden-Modul gratis`);
  let ref: string;
  try {
    // N Monatsbeiträge als Gutschrift (negativer Rechnungsposten, mit den nächsten Rechnungen verrechnet)
    ref = await addGarantieGutschrift({
      stripeCustomerId: c.stripeCustomerId,
      amountEur: amount,
      description: `Empfehlungsprämie: ${nText} Bestandskunden-Modul gratis (${referredLabel} ist Kunde geworden). Danke!`,
      fallId: `empfehlung-${referralId}`,
      metadata: { pg_kind: "empfehlung", empfehlung: referralId, bestand_monate: String(n) },
    });
  } catch (err) {
    reportError(err, "referral-credit", { referral: referralId });
    return {
      ...manual(
        `${booked ? "" : "Modul gebucht, aber "}Stripe-Gutschrift fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
        `Prämie manuell gutschreiben: ${nText} Bestandskunden-Modul (${eur(amount)} netto)`,
      ),
      amount,
    };
  }
  // Gratiszeit: neu gebucht oder noch laufend → (weiter) bis +N Monate, Hinweis 2 Wochen vorher
  const running = c.bestandFreeUntil != null && c.bestandFreeUntil > now;
  let until: Date | null = null;
  if (!booked || running) {
    until = addMonths(running ? c.bestandFreeUntil! : now, n);
    await prisma.customer.update({ where: { id: customerId }, data: { bestandFreeUntil: until, bestandFreeReminded: null } });
  }
  const gift = until
    ? `${nText} das Bestandskunden-Modul gratis (bis ${fmtDay(until)}, als Gutschrift über ${eur(amount)} netto mit Ihren nächsten Rechnungen verrechnet)`
    : `${nText} das Bestandskunden-Modul gratis: Wir schreiben Ihnen ${eur(amount)} netto gut, verrechnet mit Ihrer nächsten Rechnung`;
  return { outcome: "credited", amount, ref, note: until ? `Modul gratis bis ${fmtDay(until)}` : null, gift, task: null };
}

const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Geld-Prämie (1 Monat Betreuung bzw. fester Betrag) als Gutschrift. */
async function grantCreditReward(
  referrer: { retainerMonthly: unknown; stripeCustomerId: string | null },
  settings: ReferralSettingsLike,
  referralId: string,
  referredLabel: string,
): Promise<RewardResult> {
  const amount = rewardAmount(settings, referrer.retainerMonthly != null ? Number(referrer.retainerMonthly) : null);
  const { billingEnabled, addGarantieGutschrift } = await import("@/lib/billing");
  const task = `Prämie manuell gutschreiben${amount != null ? ` (${eur(amount)} netto)` : ""}`;
  if (amount == null) return { outcome: "manual", amount, ref: null, note: "Betrag nicht bestimmbar (kein Monatspreis hinterlegt)", gift: null, task };
  if (!referrer.stripeCustomerId || !billingEnabled()) return { outcome: "manual", amount, ref: null, note: "Empfehler hat kein Stripe-Konto", gift: null, task };
  try {
    // Negativer Rechnungsposten wie bei Garantie-Gutschriften (netto zzgl. USt., mit nächster Rechnung verrechnet)
    const ref = await addGarantieGutschrift({
      stripeCustomerId: referrer.stripeCustomerId,
      amountEur: amount,
      description: `Empfehlungsprämie: ${referredLabel} ist Kunde geworden. Danke!`,
      fallId: `empfehlung-${referralId}`,
      metadata: { pg_kind: "empfehlung", empfehlung: referralId },
    });
    return { outcome: "credited", amount, ref, note: null, gift: null, task: null };
  } catch (err) {
    reportError(err, "referral-credit", { referral: referralId });
    return { outcome: "manual", amount, ref: null, note: `Stripe-Gutschrift fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300), gift: null, task };
  }
}

/**
 * Nach einer Zahlung des Neukunden (Stripe-Webhook): Gehört das Angebot zu einem
 * empfohlenen Kontakt, ist es angenommen und lag die Empfehlung vor der Annahme,
 * bekommt der Empfehler genau einmal seine Prämie.
 */
export async function rewardReferralForOffer(offerId: string, now = new Date()): Promise<RewardOutcome> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true, status: true, acceptedAt: true, salesContactId: true, company: true, contactName: true } });
  if (!offer?.salesContactId || offer.status !== "accepted" || !offer.acceptedAt) return null;
  const referral = await prisma.colleagueReferral.findFirst({
    where: { contactId: offer.salesContactId, status: "open", createdAt: { lt: offer.acceptedAt } },
    orderBy: { createdAt: "asc" },
  });
  if (!referral) return null;
  // Idempotenz: nur wer den Datensatz von „none“ auf „processing“ setzt, bucht.
  const claimed = await prisma.colleagueReferral.updateMany({
    where: { id: referral.id, rewardStatus: "none" },
    data: { rewardStatus: "processing", wonAt: offer.acceptedAt, offerId: offer.id },
  });
  if (claimed.count === 0) return "skipped";

  const referredLabel = offer.company || referral.company || offer.contactName || referral.name || "Ihre Empfehlung";
  const [settings, referrer] = await Promise.all([
    loadReferralSettings(),
    prisma.customer.findUnique({ where: { id: referral.referrerId }, select: { id: true, name: true, retainerMonthly: true, stripeCustomerId: true, salesContact: { select: { id: true } } } }),
  ]);
  // Neukunde = Empfehler selbst (z. B. nachträglich verknüpft) → keine Prämie
  const newCustomer = await prisma.salesContact.findUnique({ where: { id: offer.salesContactId }, select: { customerId: true } });
  if (!referrer || newCustomer?.customerId === referrer.id) {
    await prisma.colleagueReferral.update({ where: { id: referral.id }, data: { rewardStatus: "skipped", rewardNote: "Empfehler nicht gefunden oder identisch" } });
    return "skipped";
  }
  const res =
    settings.rewardKind === "bestand"
      ? await grantBestandReward(referrer.id, settings, referral.id, referredLabel, now)
      : await grantCreditReward(referrer, settings, referral.id, referredLabel);
  const { outcome, amount, ref, note } = res;

  await prisma.colleagueReferral.update({
    where: { id: referral.id },
    data: {
      rewardStatus: outcome,
      rewardAmount: amount,
      rewardRef: ref,
      rewardNote: note,
      rewardedAt: outcome === "credited" ? now : null,
    },
  });
  await audit("referral.reward", {
    entity: "ColleagueReferral",
    entityId: referral.id,
    customerId: referrer.id,
    details: { outcome, amount, kind: settings.rewardKind, offer: offer.id, note },
    actor: { role: "system" },
  });
  const { sendToAdmins } = await import("@/lib/push");
  if (outcome === "credited") {
    await thankReferrer(referrer.id, referredLabel, amount, res.gift);
    await sendToAdmins({ title: `🎁 Empfehlungsprämie gutgeschrieben: ${referrer.name}`, body: `${referredLabel} ist Kunde · ${res.gift ? rewardShort(settings) : eur(amount!) + " netto"}`, url: "/admin/marketing/empfehlungen" }).catch(() => {});
  } else {
    await prisma.salesTask
      .create({
        data: {
          contactId: referrer.salesContact?.id ?? null,
          type: "SONSTIGES",
          title: `${res.task ?? "Prämie manuell gutschreiben"}: ${referrer.name}`,
          note: `Empfehlung: ${referredLabel} ist Kunde geworden. ${note ?? ""}\nDanach in Vertrieb → Empfehlungen auf „Gutgeschrieben“ setzen (Empfehler wird benachrichtigt).`,
          dueAt: now,
        },
      })
      .catch((err) => reportError(err, "referral-task"));
    await sendToAdmins({ title: `🎁 Empfehlungsprämie von Hand: ${referrer.name}`, body: `${referredLabel} ist Kunde. ${note ?? "Bitte gutschreiben."}`, url: "/admin/marketing/empfehlungen" }).catch(() => {});
  }
  return outcome;
}

/**
 * Gratiszeit „Bestandskunden-Modul“ (Empfehlungsprämie) endet in 2 Wochen: einmal Hinweis
 * per Push und E-Mail an den Inhaber, mit Weg zum Abbestellen (täglicher Cron).
 */
export async function remindBestandFreeEnd(now = new Date()): Promise<number> {
  const due = await prisma.customer.findMany({
    where: {
      bestandFreeUntil: { gt: now, lte: new Date(now.getTime() + BESTAND_FREE_REMINDER_DAYS * DAY_MS) },
      bestandFreeReminded: null,
      bestandMonthly: { gt: 0 },
      bestandCancelAt: null,
      archived: false,
    },
    select: { id: true, bestandFreeUntil: true, bestandMonthly: true },
  });
  let sent = 0;
  for (const c of due) {
    const claimed = await prisma.customer.updateMany({ where: { id: c.id, bestandFreeReminded: null }, data: { bestandFreeReminded: now } });
    if (claimed.count === 0) continue;
    const until = fmtDay(c.bestandFreeUntil!);
    const price = eur(Number(c.bestandMonthly));
    try {
      const { sendToBuyersOfCustomer } = await import("@/lib/push");
      await sendToBuyersOfCustomer(c.id, {
        title: `Gratiszeit Bestandskunden-Modul endet am ${until}`,
        body: `Danach ${price} netto im Monat. Abbestellen geht jederzeit unter Konto & Rechnungen.`,
        url: "/buyer/konto",
        tag: `bestand-free:${c.id}`,
      });
    } catch (err) {
      reportError(err, "bestand-free-push");
    }
    const owners = await ownersOf(c.id);
    if (owners.length) {
      await sendCustomerMail({
        to: owners.map((o) => o.email),
        subject: `Ihr gratis Bestandskunden-Modul läuft am ${until} aus`,
        greeting: "Guten Tag,",
        paragraphs: [
          `als Dankeschön für Ihre Empfehlung nutzen Sie das Bestandskunden-Modul bis ${until} gratis. Danach läuft es automatisch weiter für ${price} netto im Monat, tagesgenau anteilig mit Ihrer Rechnung.`,
          "Wenn Sie das Modul nicht behalten möchten, bestellen Sie es einfach vorher unter „Konto & Rechnungen“ ab. Ihre Kundenliste bleibt gespeichert.",
        ],
        ...(appLink("/buyer/konto") ? { button: { label: "Zu Konto & Rechnungen", url: appLink("/buyer/konto")! } } : {}),
      }).catch((err) => reportError(err, "bestand-free-mail"));
    }
    sent++;
  }
  return sent;
}

/** Admin: von Hand gutgeschriebene Prämie bestätigen → Empfehler wird benachrichtigt. */
export async function markRewardDone(referralId: string, amountEur: number | null, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.colleagueReferral.findUnique({
    where: { id: referralId },
    select: { id: true, referrerId: true, rewardStatus: true, rewardAmount: true, company: true, name: true },
  });
  if (!row) return { ok: false, error: "Empfehlung nicht gefunden." };
  if (!["manual", "processing"].includes(row.rewardStatus)) return { ok: false, error: "Für diese Empfehlung ist keine Prämie offen." };
  const amount = amountEur != null && amountEur > 0 ? amountEur : row.rewardAmount != null ? Number(row.rewardAmount) : null;
  const done = await prisma.colleagueReferral.updateMany({
    where: { id: row.id, rewardStatus: { in: ["manual", "processing"] } },
    data: { rewardStatus: "done_manual", rewardAmount: amount, rewardedAt: new Date() },
  });
  if (done.count === 0) return { ok: false, error: "Schon erledigt." };
  await audit("referral.reward", { entity: "ColleagueReferral", entityId: row.id, customerId: row.referrerId, details: { outcome: "done_manual", amount }, actor });
  await thankReferrer(row.referrerId, row.company || row.name || "Ihre Empfehlung", amount);
  return { ok: true };
}

// ─── Admin-Übersicht ───────────────────────────────────────────────────
export async function adminReferralOverview() {
  const rows = await prisma.colleagueReferral.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      company: true,
      createdAt: true,
      status: true,
      blockedReason: true,
      existingContact: true,
      rewardStatus: true,
      rewardAmount: true,
      rewardNote: true,
      rewardedAt: true,
      wonAt: true,
      contactId: true,
      referrer: { select: { id: true, name: true } },
      contact: {
        select: {
          monthlyValue: true,
          customerId: true,
          _count: { select: { meetings: true } },
          offers: { where: { status: "accepted" }, select: { monthlyFee: true }, orderBy: { acceptedAt: "desc" }, take: 1 },
        },
      },
    },
  });
  const list = rows.map((r) => {
    const accepted = r.contact?.offers[0];
    const stage = referralStage({ status: r.status, rewardStatus: r.rewardStatus, wonAt: r.wonAt, hasMeeting: (r.contact?._count.meetings ?? 0) > 0, hasAcceptedOffer: !!accepted });
    const monthly = accepted ? Number(accepted.monthlyFee) : r.contact?.monthlyValue ?? null;
    return { ...r, stage, rewardAmount: r.rewardAmount != null ? Number(r.rewardAmount) : null, newMonthly: stage === "kunde" || stage === "praemie" ? monthly : null };
  });
  const byReferrer = new Map<string, { id: string; name: string; total: number; won: number; rewards: number; newMrr: number }>();
  for (const r of list) {
    const e = byReferrer.get(r.referrer.id) ?? { id: r.referrer.id, name: r.referrer.name, total: 0, won: 0, rewards: 0, newMrr: 0 };
    if (r.status !== "blocked") e.total++;
    if (r.stage === "kunde" || r.stage === "praemie") {
      e.won++;
      e.newMrr += r.newMonthly ?? 0;
    }
    if (r.rewardStatus === "credited" || r.rewardStatus === "done_manual") e.rewards += r.rewardAmount ?? 0;
    byReferrer.set(r.referrer.id, e);
  }
  const top = [...byReferrer.values()].sort((a, b) => b.won - a.won || b.total - a.total);
  const totals = {
    referrals: list.filter((r) => r.status !== "blocked").length,
    won: list.filter((r) => r.stage === "kunde" || r.stage === "praemie").length,
    rewards: top.reduce((s, t) => s + t.rewards, 0),
    newMrr: top.reduce((s, t) => s + t.newMrr, 0),
    openManual: list.filter((r) => r.rewardStatus === "manual").length,
    // Empfehlungsrabatte auf die Einrichtung angenommener Angebote (Umsatzminderung, steckt schon in setupFee)
    setupDiscounts: await acceptedSetupDiscounts(),
  };
  return { list, top, totals };
}

/** Summe der Empfehlungsrabatte (netto) auf angenommene Angebote. */
export async function acceptedSetupDiscounts(): Promise<number> {
  const rows = await prisma.offer.findMany({ where: { status: "accepted", setupListFee: { not: null }, setupDiscount: { not: null } }, select: { setupFee: true, setupListFee: true } });
  return Math.round(rows.reduce((s, o) => s + Math.max(0, Number(o.setupListFee) - Number(o.setupFee)), 0) * 100) / 100;
}

/** Kundenakte: „hat X Kunden geworben“. */
export async function wonReferralCount(customerId: string): Promise<number> {
  const rows = await prisma.colleagueReferral.findMany({
    where: { referrerId: customerId, status: "open" },
    select: { wonAt: true, contact: { select: { offers: { where: { status: "accepted" }, select: { id: true }, take: 1 } } } },
  });
  return rows.filter((r) => r.wonAt || (r.contact?.offers.length ?? 0) > 0).length;
}

/** Vertriebskontakt wurde empfohlen → Hinweis in Kontakt und Angebot. */
export async function referralForContact(contactId: string) {
  const r = await prisma.colleagueReferral.findFirst({
    where: { contactId, status: "open" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, rewardStatus: true, referrer: { select: { id: true, name: true } } },
  });
  return r;
}

// ─── Empfehlungsrabatt auf die Einrichtung ─────────────────────────────
export type ReferralSetupDiscount = {
  referralId: string;
  referrerCustomerId: string;
  referrerCustomerName: string;
  /** Name des Empfehlers für das Angebot (null = nicht zeigen, Einwilligung deckt ihn nicht). */
  referrerName: string | null;
  label: string;
  /** Rabatt laut Einstellung (auch wenn nicht automatisch berechtigt; für die Übersteuerung im Angebot). */
  settingAmount: number | null;
} & ({ eligible: true; amount: number } | { eligible: false; reason: string });

/**
 * Empfehlungsrabatt für einen Vertriebskontakt: älteste offene Kollegen-Empfehlung,
 * geprüft gegen Missbrauch (Selbstempfehlung, schon Kunde, Kontakt oder Angebot schon
 * vorher da, älter als 12 Monate). null = Kontakt wurde nicht (gültig) empfohlen.
 */
export async function referralSetupDiscount(contactId: string, now = new Date()): Promise<ReferralSetupDiscount | null> {
  const referral = await prisma.colleagueReferral.findFirst({
    where: { contactId, status: "open" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, existingContact: true, createdAt: true, consentText: true, email: true, referrerId: true, referrer: { select: { id: true, name: true } } },
  });
  if (!referral) return null;
  const [settings, contact, code, offerBefore] = await Promise.all([
    loadReferralSettings(),
    prisma.salesContact.findUnique({ where: { id: contactId }, select: { id: true, email: true, customerId: true } }),
    prisma.referralCode.findUnique({ where: { customerId: referral.referrerId }, select: { code: true } }),
    prisma.offer.count({ where: { salesContactId: contactId, createdAt: { lt: referral.createdAt } } }),
  ]);
  if (!contact) return null;
  const ref = code ? await referrerByCode(code.code) : null;
  const emails = ref?.emails ?? [];
  const selfReferral =
    contact.customerId === referral.referrerId ||
    (ref?.salesContactId != null && ref.salesContactId === contact.id) ||
    [contact.email, referral.email].some((e) => !!e && isSelfReferral(e, emails));
  // Name nur, wenn der Empfohlene ihn auf der Landingpage gesehen und eingewilligt hat
  const referrerName = ref?.person && referral.consentText.includes(ref.person) ? ref.person : null;
  const settingAmount = setupDiscountAmount(settings);
  const decision = setupDiscountDecision({
    amount: settingAmount,
    referral,
    contactIsCustomer: contact.customerId != null,
    selfReferral,
    offerBefore: offerBefore > 0,
    now,
  });
  const base = {
    referralId: referral.id,
    referrerCustomerId: referral.referrer.id,
    referrerCustomerName: referral.referrer.name,
    referrerName,
    label: setupDiscountLabel(referrerName),
    settingAmount,
  };
  return decision.ok ? { ...base, eligible: true, amount: decision.amount } : { ...base, eligible: false, reason: decision.reason };
}

export type DiscountBackfillRow = {
  offerId: string;
  number: string;
  company: string;
  status: string;
  contactId: string;
  term: string;
  oldSetup: number;
  newSetup: number | null;
  discount: number | null;
  label: string | null;
  /** Grund, warum nicht nachgezogen wird (null = wird nachgezogen). */
  skip: string | null;
};

/**
 * Offene Angebote (Entwurf/verschickt) an empfohlene Kontakte ohne Rabatt einmalig nachziehen.
 * apply=false: nur Liste (Trockenlauf). Idempotent: Angebote mit Rabatt werden übersprungen.
 */
export async function backfillReferralDiscounts(opts: { apply: boolean; actor?: AuditActor; now?: Date }): Promise<DiscountBackfillRow[]> {
  const now = opts.now ?? new Date();
  const offers = await prisma.offer.findMany({
    where: {
      status: { in: ["draft", "sent"] },
      setupDiscount: null,
      salesContact: { colleagueReferrals: { some: { status: "open" } } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, company: true, contactName: true, status: true, salesContactId: true, term: true, products: true, setupFee: true, validUntil: true },
  });
  const rows: DiscountBackfillRow[] = [];
  for (const o of offers) {
    const d = await referralSetupDiscount(o.salesContactId!, now);
    const count = Array.isArray(o.products) ? o.products.length || 1 : 1;
    const term = normalizeTerm(o.term);
    const list = setupForChoice(term, count);
    const oldSetup = Number(o.setupFee);
    const row: DiscountBackfillRow = {
      offerId: o.id,
      number: o.number,
      company: o.company || o.contactName,
      status: o.status,
      contactId: o.salesContactId!,
      term,
      oldSetup,
      newSetup: null,
      discount: null,
      label: d?.label ?? null,
      skip: null,
    };
    rows.push(row);
    if (!d) {
      row.skip = "Keine offene Empfehlung";
      continue;
    }
    if (!d.eligible) {
      row.skip = d.reason;
      continue;
    }
    if (o.validUntil < now) {
      row.skip = "Angebot abgelaufen";
      continue;
    }
    // Sonderkondition (Setup abweichend) nicht addieren: es gilt der günstigere Betrag
    const res = applySetupDiscount(list, Math.abs(oldSetup - list) < 0.005 ? null : oldSetup, d.amount);
    if (res.discount <= 0) {
      row.skip = "Sonderkondition ist günstiger";
      continue;
    }
    row.newSetup = res.fee;
    row.discount = res.discount;
    if (!opts.apply) continue;
    const done = await prisma.offer.updateMany({
      where: { id: o.id, status: { in: ["draft", "sent"] }, setupDiscount: null },
      data: { setupFee: res.fee, setupListFee: list, setupDiscount: d.amount, setupDiscountLabel: d.label, referralId: d.referralId },
    });
    if (done.count === 0) {
      row.skip = "Inzwischen geändert";
      continue;
    }
    await prisma.salesActivity
      .create({ data: { contactId: o.salesContactId!, type: "NOTIZ", outcome: `Empfehlungsrabatt nachträglich in Angebot ${o.number} übernommen: Einrichtung ${eur(res.fee)} statt ${eur(list)} netto` } })
      .catch((err) => reportError(err, "referral-discount-backfill-activity"));
    await audit("offer.referral_discount", { entity: "Offer", entityId: o.id, details: { number: o.number, oldSetup, newSetup: res.fee, discount: res.discount, referral: d.referralId }, actor: opts.actor });
  }
  return rows;
}

// ─── Hinweise im Kundenbereich ─────────────────────────────────────────
export type NudgeView = { key: NudgeKey; title: string; text: string };

/** Hinweis „Kollegen empfehlen“ für den Inhaber (oder null). Merkt sich das erste Zeigen. */
export async function loadReferralNudge(customerId: string, now = new Date()): Promise<NudgeView | null> {
  const settings = await loadReferralSettings();
  // Programm wird vorerst nicht aktiv beworben: Hinweise nur mit Schalter (Standard aus)
  if (!settings.enabled || !settings.nudgesEnabled) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true, archived: true } });
  if (!customer || customer.plan === "internal" || customer.archived) return null;
  const states = await prisma.referralNudge.findMany({ where: { customerId }, select: { key: true, firstShownAt: true, closedAt: true } });

  const [closedDeals, feedback] = await Promise.all([
    prisma.lead.count({ where: { customerId, status: "Abschluss" } }),
    prisma.customerFeedback.findMany({ where: { customerId, kind: { in: ["day30", "day90"] }, score: { gte: NPS_PROMOTER } }, select: { kind: true } }),
  ]);
  const goodFeedback = feedback.map((f) => f.kind as "day30" | "day90");
  const picked = pickNudge(nudgeCandidates({ closedDeals, goodFeedback }), states, now);
  if (picked.expire.length) {
    await prisma.referralNudge.updateMany({ where: { customerId, key: { in: picked.expire }, closedAt: null }, data: { closedAt: now } });
  }
  if (!picked.show) return null;
  if (!states.some((s) => s.key === picked.show)) {
    await prisma.referralNudge.create({ data: { customerId, key: picked.show, firstShownAt: now } }).catch(() => {});
  }
  const t = NUDGE_TEXT[picked.show];
  // Konkreter Vorteil für beide Seiten (aus den Einstellungen)
  return { key: picked.show, title: t.title, text: `${t.text} ${referralIncentiveSentence(settings)}` };
}

export async function closeReferralNudge(customerId: string, key: string, now = new Date()): Promise<void> {
  if (!(key in NUDGE_TEXT)) return;
  const done = await prisma.referralNudge.updateMany({ where: { customerId, key, closedAt: null }, data: { closedAt: now } });
  if (done.count === 0) await prisma.referralNudge.create({ data: { customerId, key, firstShownAt: now, closedAt: now } }).catch(() => {});
}

/** Feedback-Danke-Bildschirm: Link nur bei guter Bewertung nach 30/90 Tagen. */
export async function referralLinkAfterFeedback(customerId: string, kind: string, score: number): Promise<string | null> {
  // Ab Tag 30 wird 0–10 gefragt (NPS): nur Promotoren (9–10) bekommen den Empfehlungs-Link
  if (score < NPS_PROMOTER || !["day30", "day90"].includes(kind)) return null;
  const settings = await loadReferralSettings();
  if (!settings.enabled || !settings.nudgesEnabled) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true, archived: true } });
  if (!customer || customer.plan === "internal" || customer.archived) return null;
  // Der Hinweis zum Feedback gilt damit als gezeigt (nicht noch einmal in „Heute“)
  await closeReferralNudge(customerId, `feedback-${kind}`);
  return referralUrl(await ensureReferralCode(customerId));
}

// ─── Löschfrist ────────────────────────────────────────────────────────
/** Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen (täglicher Cron). */
export async function pruneReferrals(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const r = await prisma.colleagueReferral.updateMany({
    where: { createdAt: { lt: cutoff }, wonAt: null, OR: [{ name: { not: null } }, { email: { not: null } }, { phone: { not: null } }] },
    data: { name: null, email: null, phone: null, company: null },
  });
  return r.count;
}
