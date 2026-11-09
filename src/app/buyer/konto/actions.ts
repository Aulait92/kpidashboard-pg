"use server";

import { redirect } from "next/navigation";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { createPortalUrl } from "@/lib/billing";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";

/** Öffnet das Stripe-Kundenportal (nur der Kunde selbst, nicht in der Admin-Vorschau). */
export async function openPortalAction() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) redirect("/buyer/konto?portal=vorschau");
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { stripeCustomerId: true } });
  if (!customer?.stripeCustomerId) redirect("/buyer/konto?portal=fehlt");
  let url: string;
  try {
    url = await createPortalUrl(customer.stripeCustomerId, `${getAppUrl()}/buyer/konto`);
  } catch (err) {
    reportError(err, "billing-portal", { customer: ctx.customerId });
    redirect("/buyer/konto?portal=fehler");
  }
  redirect(url);
}
