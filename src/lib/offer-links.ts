// Ein Angebot hängt entweder an einem (alten) Airtable-Deal oder an einem
// Vertriebskontakt. Diese Helfer kapseln Link, Historie und Pipeline-Status,
// damit Angebot und Abrechnung beide Fälle gleich behandeln.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import type { SalesCustomerStage } from "@/generated/prisma/enums";
import type { Offer } from "@/generated/prisma/client";
import type { DealOfferRow } from "@/components/deal-offers-card";

type OfferRef = { dealId: string | null; salesContactId: string | null };

export type OfferTarget = { dealId: string } | { salesContactId: string };

export function offerAdminHref(o: OfferRef): string {
  if (o.salesContactId) return `/admin/vertrieb/kontakte/${o.salesContactId}`;
  if (o.dealId) return `/admin/crm/${o.dealId}`;
  return "/admin/vertrieb";
}

/** Eintrag in der Historie des Deals bzw. Kontakts. */
export async function logOfferActivity(o: OfferRef, title: string, body?: string | null, createdById?: string | null) {
  try {
    if (o.salesContactId) {
      await prisma.salesActivity.create({
        data: { contactId: o.salesContactId, type: "NOTIZ", outcome: title, note: body ?? null },
      });
    } else if (o.dealId) {
      await prisma.dealActivity.create({
        data: { dealId: o.dealId, kind: "note", title, body: body ?? null, createdById: createdById ?? null },
      });
    }
  } catch (err) {
    reportError(err, "offer-activity");
  }
}

/** Kunden-Pipeline des Vertriebskontakts weiterschalten (nur vorwärts, außer Pause/Kündigung). */
export async function setContactCustomerStage(o: OfferRef, stage: SalesCustomerStage) {
  if (!o.salesContactId) return;
  const order: SalesCustomerStage[] = ["VERTRAG", "ONBOARDING", "TEST", "AKTIV", "PAUSIERT", "GEKUENDIGT"];
  try {
    const c = await prisma.salesContact.findUnique({
      where: { id: o.salesContactId },
      select: { customerStage: true, customerSince: true },
    });
    if (!c) return;
    const forwardOnly = stage === "VERTRAG" || stage === "ONBOARDING" || stage === "TEST";
    if (forwardOnly && c.customerStage && order.indexOf(c.customerStage) >= order.indexOf(stage)) return;
    await prisma.salesContact.update({
      where: { id: o.salesContactId },
      data: {
        customerStage: stage,
        ...(stage === "VERTRAG" || stage === "ONBOARDING" ? { stage: "GEWONNEN", customerSince: c.customerSince ?? new Date() } : {}),
      },
    });
  } catch (err) {
    reportError(err, "offer-customer-stage");
  }
}

/** Angebot → Zeile für die Angebotskarte (serialisierbar für Client-Komponenten). */
export function toOfferRow(o: Offer): DealOfferRow {
  return {
    id: o.id,
    number: o.number,
    version: o.version,
    status: o.status,
    token: o.token,
    email: o.email,
    setupFee: Number(o.setupFee),
    monthlyFee: Number(o.monthlyFee),
    createdAt: o.createdAt.toISOString(),
    sentAt: o.sentAt?.toISOString() ?? null,
    viewedAt: o.viewedAt?.toISOString() ?? null,
    acceptedAt: o.acceptedAt?.toISOString() ?? null,
    acceptedName: o.acceptedName,
    validUntil: o.validUntil.toISOString(),
    paymentStatus: o.paymentStatus,
    subscriptionStatus: o.subscriptionStatus,
  };
}
