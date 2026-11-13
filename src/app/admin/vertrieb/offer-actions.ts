"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl, sendOfferEmail } from "@/lib/email";
import { createOffer, type OfferFormInput } from "@/lib/offers";
import { prisma } from "@/lib/prisma";
import { customerGreeting, logOfferActivity, offerAdminHref, type OfferTarget } from "@/lib/offer-links";
import { AUDIENCE_LABEL, getPresentation, isAudience, rechnerUrl, type Audience } from "@/lib/vertrieb/praesentationen";

/** Extras der Angebotsmail: Rechner-Link und/oder Präsentation (PDF) der gewählten Zielgruppe. */
export type OfferMailExtras = { rechner?: boolean; praesentation?: boolean; audience?: Audience; du?: boolean };

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN")
    throw new Error("Nicht berechtigt.");
  return session;
}

export type OfferActionResult =
  | { ok: true; offerId?: string }
  | { ok: false; error: string };

export async function createOfferAction(
  target: OfferTarget,
  input: OfferFormInput,
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  try {
    const offer = await createOffer(target, input, session.userId);
    await logOfferActivity(
      offer,
      `Angebot ${offer.number} erstellt`,
      `${Number(offer.setupFee).toLocaleString("de-DE")} € Setup · ${Number(offer.monthlyFee).toLocaleString("de-DE")} € / Monat (netto)`,
      session.userId,
    );
    revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
    return { ok: true, offerId: offer.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Angebot konnte nicht erstellt werden.",
    };
  }
}

export async function markOfferSentAction(
  offerId: string,
): Promise<OfferActionResult> {
  await requireAdmin();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, dealId: true, salesContactId: true, number: true, status: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "draft") {
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "sent", sentAt: new Date() },
    });
  }
  if (offer.salesContactId) await logOfferActivity(offer, `Angebot ${offer.number} als verschickt markiert`);
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  return { ok: true };
}

export async function sendOfferEmailAction(
  offerId: string,
  extras: OfferMailExtras = {},
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (!offer.email)
    return {
      ok: false,
      error: "Im Angebot ist keine E-Mail-Adresse hinterlegt.",
    };
  if (offer.status === "superseded" || offer.status === "accepted") {
    return { ok: false, error: "Dieses Angebot ist nicht mehr offen." };
  }
  const audience: Audience = isAudience(extras.audience) ? extras.audience : "vertreter";
  let attachment: { filename: string; content: Buffer } | null = null;
  if (extras.praesentation) {
    const file = await getPresentation(audience, "pdf");
    if (!file) return { ok: false, error: `Für ${AUDIENCE_LABEL[audience]} ist noch keine PDF-Präsentation hinterlegt (Vertrieb → Unterlagen).` };
    attachment = { filename: file.fileName.toLowerCase().endsWith(".pdf") ? file.fileName : `${file.fileName}.pdf`, content: Buffer.from(file.data) };
  }
  const rechner = extras.rechner ? rechnerUrl(getAppUrl(), audience, offer.products) : null;
  const res = await sendOfferEmail({
    rechnerUrl: rechner,
    attachment,
    to: offer.email,
    du: !!extras.du,
    greeting: await customerGreeting(offer, !!extras.du),
    number: offer.number,
    offerUrl: `${getAppUrl()}/angebot/${offer.token}`,
    validUntil: offer.validUntil,
    replyTo: process.env.OFFER_REPLY_TO ?? session.email ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "sent", sentAt: offer.sentAt ?? new Date() },
  });
  await logOfferActivity(
    offer,
    `Angebot ${offer.number} per E-Mail an ${offer.email} gesendet${
      rechner || attachment
        ? ` (mit ${[rechner ? "Rechner-Link" : null, attachment ? `${AUDIENCE_LABEL[audience]}-Präsentation` : null].filter(Boolean).join(" und ")})`
        : ""
    }`,
    // Vollständige Mail im Verlauf (Empfänger, Betreff, Anhang, Text)
    [
      `An: ${offer.email}`,
      res.subject ? `Betreff: ${res.subject}` : null,
      attachment ? `Anhang: ${attachment.filename}` : null,
      "",
      res.text ?? "",
    ]
      .filter((l) => l !== null)
      .join("\n")
      .trim(),
    session.userId,
    "EMAIL",
  );
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  return { ok: true };
}

/**
 * Angebot löschen (z. B. Entwurf mit Fehler). Nur, solange es nicht angenommen bzw.
 * bezahlt ist und kein Onboarding daran hängt. Die vorherige Version wird wieder aktuell.
 */
export async function deleteOfferAction(offerId: string): Promise<OfferActionResult> {
  await requireAdmin();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, dealId: true, salesContactId: true, number: true, status: true, paymentStatus: true, acceptedAt: true, stripeCustomerId: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "accepted" || offer.acceptedAt) return { ok: false, error: "Angenommene Angebote lassen sich nicht löschen." };
  if (offer.paymentStatus && offer.paymentStatus !== "none") return { ok: false, error: "Zu diesem Angebot gibt es schon eine Zahlung – bitte nicht löschen." };
  if (await prisma.onboarding.findFirst({ where: { offerId: offer.id }, select: { id: true } })) {
    return { ok: false, error: "An diesem Angebot hängt bereits ein Onboarding." };
  }
  const owner = offer.salesContactId ? { salesContactId: offer.salesContactId } : offer.dealId ? { dealId: offer.dealId } : null;
  await prisma.$transaction(async (tx) => {
    await tx.offer.delete({ where: { id: offer.id } });
    if (!owner || offer.status === "superseded") return;
    // Vorherige Version wieder aktuell machen (sie wurde beim Erstellen dieser Version ersetzt)
    const prev = await tx.offer.findFirst({ where: { ...owner, status: "superseded" }, orderBy: { version: "desc" }, select: { id: true, sentAt: true } });
    if (prev) await tx.offer.update({ where: { id: prev.id }, data: { status: prev.sentAt ? "sent" : "draft" } });
  });
  if (offer.salesContactId) await logOfferActivity(offer, `Angebot ${offer.number} gelöscht`);
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  return { ok: true };
}
