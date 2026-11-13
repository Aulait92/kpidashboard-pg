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
  isSelfReferral,
  newReferralCode,
  nudgeCandidates,
  pickNudge,
  referralPath,
  referralStage,
  rewardAmount,
  type NudgeKey,
  type ReferralSettingsLike,
  type ReferralStage,
} from "@/lib/kollegen-shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

/** Missbrauchsbremse der öffentlichen Landingpage. */
export const MAX_PER_CODE_PER_HOUR = 5;
export const MAX_GLOBAL_PER_10_MIN = 30;
/** Löschfrist: Angaben von Empfohlenen ohne Abschluss nach 12 Monaten entfernen. */
export const RETENTION_DAYS = 365;

// ─── Einstellungen ─────────────────────────────────────────────────────
export async function loadReferralSettings(): Promise<ReferralSettingsLike> {
  const row = await prisma.referralSettings.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_SETTINGS;
  return {
    enabled: row.enabled,
    rewardKind: row.rewardKind === "fixed" ? "fixed" : "month",
    rewardFixed: row.rewardFixed != null ? Number(row.rewardFixed) : null,
    benefitKind: ["setup_free", "custom"].includes(row.benefitKind) ? row.benefitKind : "none",
    benefitText: row.benefitText,
  };
}

export type SettingsInput = { enabled: boolean; rewardKind: string; rewardFixed: number | null; benefitKind: string; benefitText: string | null };

export async function saveReferralSettings(input: SettingsInput, actor?: AuditActor): Promise<{ ok: true } | { ok: false; error: string }> {
  const rewardKind = input.rewardKind === "fixed" ? "fixed" : "month";
  if (rewardKind === "fixed" && !(input.rewardFixed != null && input.rewardFixed > 0 && input.rewardFixed <= 10000)) {
    return { ok: false, error: "Bitte einen Betrag zwischen 1 und 10.000 € angeben." };
  }
  const benefitKind = ["setup_free", "custom"].includes(input.benefitKind) ? input.benefitKind : "none";
  const benefitText = (input.benefitText ?? "").trim().slice(0, 300) || null;
  if (benefitKind === "custom" && !benefitText) return { ok: false, error: "Bitte den Vorteil für Neukunden kurz beschreiben." };
  const data = { enabled: input.enabled, rewardKind, rewardFixed: rewardKind === "fixed" ? input.rewardFixed : null, benefitKind, benefitText };
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

  try {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `🤝 Empfehlung von ${ref.person}`,
      body: `${name}${company ? ` · ${company}` : ""} – bitte heute anrufen`,
      url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/empfehlungen",
      tag: `referral:${referral.id}`,
    });
  } catch (err) {
    reportError(err, "referral-push");
  }
  return { ok: true, contactId };
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

async function thankReferrer(customerId: string, referredLabel: string, amount: number | null) {
  const owners = await ownersOf(customerId);
  const gift = amount != null ? `${eur(amount)} netto als Gutschrift auf Ihrer nächsten Rechnung` : "Ihre Prämie";
  try {
    const { sendToUser } = await import("@/lib/push");
    for (const o of owners) {
      await sendToUser(o.id, { title: "Danke für Ihre Empfehlung! 🎁", body: `${referredLabel} ist jetzt Kunde – ${gift}.`, url: "/buyer/empfehlen", tag: "referral-reward" }).catch(() => {});
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
      amount != null ? `Als Dankeschön schreiben wir Ihnen ${eur(amount)} netto gut. Die Gutschrift wird mit Ihrer nächsten Rechnung verrechnet.` : "Als Dankeschön schreiben wir Ihnen Ihre Prämie gut.",
      "Kennen Sie noch weitere Kollegen? Ihr persönlicher Link bleibt gültig.",
    ],
    button: { label: "Zu „Kollegen empfehlen“", url: `${getAppUrl()}/buyer/empfehlen` },
  }).catch((err) => reportError(err, "referral-thanks-mail"));
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
  const amount = rewardAmount(settings, referrer.retainerMonthly != null ? Number(referrer.retainerMonthly) : null);
  const { billingEnabled, addGarantieGutschrift } = await import("@/lib/billing");

  let outcome: "credited" | "manual" = "manual";
  let note: string | null = null;
  let ref: string | null = null;
  if (amount == null) note = "Betrag nicht bestimmbar (kein Monatspreis hinterlegt)";
  else if (!referrer.stripeCustomerId || !billingEnabled()) note = "Empfehler hat kein Stripe-Konto";
  else {
    try {
      // Negativer Rechnungsposten wie bei Garantie-Gutschriften (netto zzgl. USt., mit nächster Rechnung verrechnet)
      ref = await addGarantieGutschrift({
        stripeCustomerId: referrer.stripeCustomerId,
        amountEur: amount,
        description: `Empfehlungsprämie: ${referredLabel} ist Kunde geworden – danke!`,
        fallId: `empfehlung-${referral.id}`,
        metadata: { pg_kind: "empfehlung", empfehlung: referral.id },
      });
      outcome = "credited";
    } catch (err) {
      reportError(err, "referral-credit", { referral: referral.id });
      note = `Stripe-Gutschrift fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    }
  }

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
    details: { outcome, amount, offer: offer.id, note },
    actor: { role: "system" },
  });
  const { sendToAdmins } = await import("@/lib/push");
  if (outcome === "credited") {
    await thankReferrer(referrer.id, referredLabel, amount);
    await sendToAdmins({ title: `🎁 Empfehlungsprämie gutgeschrieben: ${referrer.name}`, body: `${referredLabel} ist Kunde · ${eur(amount!)} netto`, url: "/admin/vertrieb/empfehlungen" }).catch(() => {});
  } else {
    await prisma.salesTask
      .create({
        data: {
          contactId: referrer.salesContact?.id ?? null,
          type: "SONSTIGES",
          title: `Prämie manuell gutschreiben: ${referrer.name}${amount != null ? ` (${eur(amount)} netto)` : ""}`,
          note: `Empfehlung: ${referredLabel} ist Kunde geworden. ${note ?? ""}\nDanach in Vertrieb → Empfehlungen auf „Gutgeschrieben“ setzen (Empfehler wird benachrichtigt).`,
          dueAt: now,
        },
      })
      .catch((err) => reportError(err, "referral-task"));
    await sendToAdmins({ title: `🎁 Empfehlungsprämie von Hand: ${referrer.name}`, body: `${referredLabel} ist Kunde – ${note ?? "bitte gutschreiben"}`, url: "/admin/vertrieb/empfehlungen" }).catch(() => {});
  }
  return outcome;
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
  };
  return { list, top, totals };
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

// ─── Hinweise im Kundenbereich ─────────────────────────────────────────
export type NudgeView = { key: NudgeKey; title: string; text: string };

/** Hinweis „Kollegen empfehlen“ für den Inhaber (oder null). Merkt sich das erste Zeigen. */
export async function loadReferralNudge(customerId: string, now = new Date()): Promise<NudgeView | null> {
  const settings = await loadReferralSettings();
  if (!settings.enabled) return null;
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true, archived: true } });
  if (!customer || customer.plan === "internal" || customer.archived) return null;
  const states = await prisma.referralNudge.findMany({ where: { customerId }, select: { key: true, firstShownAt: true, closedAt: true } });

  const [closedDeals, feedback] = await Promise.all([
    prisma.lead.count({ where: { customerId, status: "Abschluss" } }),
    prisma.customerFeedback.findMany({ where: { customerId, kind: { in: ["day30", "day90"] }, score: { gte: NPS_PROMOTER } }, select: { kind: true } }),
  ]);
  const goodFeedback = feedback.map((f) => f.kind as "day30" | "day90");
  let picked = pickNudge(nudgeCandidates({ closedDeals, guaranteeMet: false, goodFeedback }), states, now);
  // Garantie nur prüfen, wenn sonst nichts ansteht und der Anlass noch nie gezeigt wurde (teurer)
  if (!picked.show && pickNudge(["garantie"], states, now).show === "garantie") {
    const { garantieStatus } = await import("@/lib/garantien-server");
    const g = await garantieStatus(customerId, now).catch(() => null);
    if (g?.ergebnisse.some((e) => e.status === "erfuellt")) picked = pickNudge(["garantie"], states, now);
  }
  if (picked.expire.length) {
    await prisma.referralNudge.updateMany({ where: { customerId, key: { in: picked.expire }, closedAt: null }, data: { closedAt: now } });
  }
  if (!picked.show) return null;
  if (!states.some((s) => s.key === picked.show)) {
    await prisma.referralNudge.create({ data: { customerId, key: picked.show, firstShownAt: now } }).catch(() => {});
  }
  return { key: picked.show, ...NUDGE_TEXT[picked.show] };
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
  if (!settings.enabled) return null;
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
