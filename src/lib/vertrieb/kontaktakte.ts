import { prisma } from "@/lib/prisma";
import { detectedDataOf } from "@/lib/vertrieb/kontaktdaten-server";
import { KIND_LABEL, sourceLabel } from "@/lib/vertrieb/kontaktdaten";
import type { PhoneKind } from "@/lib/vertrieb/dubletten";
import { formatPhone } from "@/lib/format";
import { likelyDuplicates } from "@/lib/vertrieb/contact-merge";
import { taskInclude } from "@/lib/vertrieb/queries";
import { guessSource } from "@/lib/vertrieb/source";
import { getAppUrl } from "@/lib/email";
import { loadOnboarding } from "@/lib/onboarding";
import { loadReferralSettings, referralForContact, referralSetupDiscount } from "@/lib/kollegen";
import { benefitSentence } from "@/lib/kollegen-shared";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { aktuellesAngebot, audienceFuer } from "@/lib/vertrieb/verkaufspraesentation";
import { aktiverVerkaufsLink, verkaufsAufrufe } from "@/lib/vertrieb/verkaufspraesentation-server";
import { DECISION_BOOKING_TYPE, DEFAULT_BOOKING_TYPE, decisionBookingLink } from "@/lib/vertrieb/buchung";

// Kontaktakte eines Vertriebskontakts: alle Daten an einer Stelle, gemeinsam für
// /admin/vertrieb/kontakte/[id] (alt) und /admin/neu/vertrieb/kontakte/[id] (neu).

/** Kontakt mit Verlauf, Aufgaben, Cold Mails, Mails, Terminen, Angeboten, Follow-ups und Telefonnummern. */
export function ladeKontakt(id: string) {
  return prisma.salesContact.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { occurredAt: "desc" } },
      tasks: { include: taskInclude, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }] },
      campaigns: { include: { campaign: true }, orderBy: { sentAt: "desc" } },
      emails: { orderBy: { sentAt: "desc" } },
      meetings: { orderBy: { startAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
      followups: { orderBy: { createdAt: "desc" }, take: 5 },
      phones: { orderBy: { detectedAt: "desc" } },
    },
  });
}

export type Kontakt = NonNullable<Awaited<ReturnType<typeof ladeKontakt>>>;

/** Alles Weitere zur Kontaktakte (Herkunft der Kontaktdaten, Onboarding, Dubletten, Termin, Empfehlung, Präsentation). */
export async function ladeKontaktakte(c: Kontakt) {
  // Weitere E-Mails und Telefonnummern mit Herkunft („aus Buchung 14.11.“), lib/vertrieb/kontaktdaten-server.ts
  const emailSources = Object.fromEntries(Object.entries(detectedDataOf(c.detectedData).emails ?? {}).map(([e, v]) => [e, sourceLabel("email", v.source, v.at)]));
  const extraPhones = c.phones.map((p) => ({
    id: p.id,
    phone: p.phone,
    display: formatPhone(p.phone),
    kind: KIND_LABEL[p.kind as PhoneKind] ?? p.kind,
    source: sourceLabel("phone", p.source, p.detectedAt),
  }));
  const extrasSummary = [
    extraPhones.length ? `${extraPhones.length} weitere Nummer${extraPhones.length === 1 ? "" : "n"}` : null,
    c.altEmails.length ? `${c.altEmails.length} weitere E-Mail${c.altEmails.length === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const open = c.tasks.filter((t) => !t.doneAt);
  // Später-Follow-up: nur mit einer Mail aus Instantly (Antwort im selben Thread, gleiches Postfach)
  const activeFollowup = c.followups.find((f) => f.activeFor) ?? null;
  const threadMail = c.emails.find((e) => e.direction === "IN" && (e.instantlyId || (e.campaign && e.campaign !== "manuell")));
  const followupMail = (activeFollowup?.replyEmailId && c.emails.find((e) => e.id === activeFollowup.replyEmailId)) || threadMail;
  const suggested = c.customerSource ? null : await guessSource(c.id);
  const done = c.tasks.filter((t) => t.doneAt).slice(0, 10);
  const onboarding = c.customerId ? await loadOnboarding({ customerId: c.customerId }) : null;
  const obOffer = onboarding?.offerId ? (c.offers.find((o) => o.id === onboarding.offerId) ?? null) : null;
  const acceptedOffer = c.offers.find((o) => o.status === "accepted") ?? null;
  const freeCustomers =
    !onboarding && acceptedOffer
      ? await prisma.customer.findMany({ where: { onboarding: null, plan: { not: "internal" }, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
  // Kundenakten für „Mit Kundenakte verknüpfen“: noch mit keinem Kontakt verknüpft (+ die eigene)
  const linkable = await prisma.customer.findMany({
    where: { archived: false, plan: { not: "internal" }, OR: [{ salesContact: null }, { id: c.customerId ?? "-" }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const duplicates = await likelyDuplicates(c.id);
  // Entscheidungs-Call: persönlicher Buchungslink (signiert, Buchung hängt direkt an diesem Kontakt)
  const decisionLink = await decisionBookingLink(c.id).catch(() => null);
  // „Termin“: Admin bucht selbst (Termintyp, Datum, Uhrzeit frei); nach einem Angebot ist der Entscheidungs-Call vorgewählt
  const bookingTypes = await prisma.salesBookingType.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, title: true, durationMin: true } });
  const defaultTermin = c.offers.length && bookingTypes.some((t) => t.slug === DECISION_BOOKING_TYPE) ? DECISION_BOOKING_TYPE : DEFAULT_BOOKING_TYPE;
  // „Kollegen empfehlen“: von einem Kunden empfohlen → Hinweis mit Neukunden-Vorteil
  const referral = await referralForContact(c.id);
  const referralBenefit = referral ? benefitSentence(await loadReferralSettings()) : null;
  const referralDiscount = referral ? await referralSetupDiscount(c.id) : null;
  // Präsentationen (PDF) für die Angebotsmail
  const pdfs = new Set((await listPresentations()).filter((p) => p.format === "pdf").map((p) => p.audience));
  let appUrl = "";
  try {
    appUrl = getAppUrl();
  } catch {
    appUrl = "";
  }
  // Vertriebspräsentation: Link für den Interessenten und Aufrufe
  const [praesLink, praesAufrufe] = await Promise.all([aktiverVerkaufsLink(c.id), verkaufsAufrufe(c.id)]);
  const praesFassung = audienceFuer(c, aktuellesAngebot(c.offers));
  return {
    emailSources, extraPhones, extrasSummary, open, done, activeFollowup, threadMail, followupMail, suggested,
    onboarding, obOffer, acceptedOffer, freeCustomers, linkable, duplicates, decisionLink, bookingTypes, defaultTermin,
    referral, referralBenefit, referralDiscount, pdfs, appUrl, praesLink, praesAufrufe, praesFassung,
  };
}

/** „Zuletzt ergänzt am … (Quelle)“ aus SalesContact.enrichment. */
export function enrichedLine(raw: unknown, fmtDate: (d: Date) => string): string | null {
  const e = (raw ?? {}) as { website?: { at?: string }; google?: { at?: string; status?: string } };
  const parts: string[] = [];
  if (e.website?.at) parts.push(`Website ${fmtDate(new Date(e.website.at))}`);
  if (e.google?.at) parts.push(`Google ${fmtDate(new Date(e.google.at))}${e.google.status && e.google.status !== "gefunden" ? ` (${e.google.status})` : ""}`);
  return parts.length ? `Zuletzt ergänzt: ${parts.join(" · ")}` : null;
}

/** Status der WhatsApp-Terminbestätigung (lib/vertrieb/termin-whatsapp.ts). */
export function waConfirmLabel(status: string): string {
  const labels: Record<string, string> = {
    sent: "gesendet",
    no_phone: "nicht gesendet, keine Handynummer",
    no_account: "nicht gesendet, Support-Nummer nicht verbunden",
    no_template: "nicht gesendet, Vorlage noch nicht freigegeben",
    failed: "fehlgeschlagen",
    past: "nicht gesendet, Termin schon vorbei",
    opted_out: "nicht gesendet, Kontakt hat STOPP geschrieben",
  };
  return labels[status] ?? status;
}
