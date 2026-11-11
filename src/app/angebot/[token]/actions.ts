"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptOffer, getOfferByToken } from "@/lib/offers";
import { billingEnabled, createCheckoutForOffer } from "@/lib/billing";

export type AcceptState = { ok?: boolean; error?: string; checkoutUrl?: string };

export async function acceptOfferAction(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const res = await acceptOffer(token, {
    name: String(formData.get("name") ?? ""),
    termsAccepted: formData.get("terms") === "on",
    // Wahl auf der Angebotsseite (nur wirksam, wenn im Angebot freigegeben; serverseitig geprüft)
    term: typeof formData.get("term") === "string" ? String(formData.get("term")) : null,
    startDate: typeof formData.get("startDate") === "string" ? String(formData.get("startDate")) : null,
    ip,
    agent: h.get("user-agent"),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/angebot/${token}`);
  // Direkt weiter zur Zahlung (SEPA-Lastschrift oder Karte). Serverseitige
  // Weiterleitung: Die Seite wechselt nach der Annahme in die Zahlungsansicht,
  // ein clientseitiger Redirect im Formular käme deshalb nicht mehr zum Zug.
  if (billingEnabled()) {
    const offer = await getOfferByToken(token);
    if (offer) {
      const checkout = await createCheckoutForOffer(offer.id);
      if ("url" in checkout) redirect(checkout.url);
    }
  }
  return { ok: true };
}

/** Zahlung (erneut) starten – z. B. nach Abbruch auf der Bezahlseite. */
export async function startPaymentAction(token: string): Promise<{ url?: string; error?: string }> {
  const offer = await getOfferByToken(token);
  if (!offer) return { error: "Angebot nicht gefunden." };
  const res = await createCheckoutForOffer(offer.id);
  return "url" in res ? { url: res.url } : { error: res.error };
}
