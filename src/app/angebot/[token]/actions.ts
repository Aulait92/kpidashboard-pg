"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptOffer, getOfferByToken } from "@/lib/offers";
import { billingEnabled, createCheckoutForOffer } from "@/lib/billing";
import { checkLimit, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { parseZahlart } from "@/lib/zahlart";
import { setzeErinnerungPerToken } from "@/lib/angebot-zahlungserinnerung-server";
import { richteUeberweisungEin, ueberweisungMoeglich } from "@/lib/ueberweisung";

export type AcceptState = { ok?: boolean; error?: string; checkoutUrl?: string };

/** Formularwert „rhythmus“: jahr bzw. voraus → im Voraus (jährlich bzw. 6 Monate), monat → monatlich, sonst keine Angabe. */
const parseRhythmus = (v: FormDataEntryValue | null): boolean | null => (v === "jahr" || v === "voraus" ? true : v === "monat" ? false : null);

export async function acceptOfferAction(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const h = await headers();
  const ip = clientIp(h);
  if (!checkLimit("offerAccept", ip).ok) return { error: RATE_LIMIT_MESSAGE };
  const res = await acceptOffer(token, {
    name: String(formData.get("name") ?? ""),
    termsAccepted: formData.get("terms") === "on",
    business: {
      company: String(formData.get("company") ?? ""),
      vatId: String(formData.get("vatId") ?? ""),
      confirmed: formData.get("business") === "on",
    },
    priceStepAck: formData.get("priceStep") === "on",
    // Wahl auf der Angebotsseite (nur wirksam, wenn im Angebot freigegeben; serverseitig geprüft)
    term: typeof formData.get("term") === "string" ? String(formData.get("term")) : null,
    startDate: typeof formData.get("startDate") === "string" ? String(formData.get("startDate")) : null,
    // Zahlweise (nur mit „Jahreszahlung anbieten“ und 12 Monaten; fehlt = Vorauswahl bzw. vereinbart)
    annual: parseRhythmus(formData.get("rhythmus")),
    ip: ip === "unknown" ? null : ip,
    agent: h.get("user-agent"),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/angebot/${token}`);
  // Direkt weiter zur Zahlung (gewählte Zahlart, Standard Lastschrift). Serverseitige
  // Weiterleitung: Die Seite wechselt nach der Annahme in die Zahlungsansicht,
  // ein clientseitiger Redirect im Formular käme deshalb nicht mehr zum Zug.
  if (billingEnabled()) {
    const offer = await getOfferByToken(token);
    // Testangebot: keine Zahlung, das Onboarding startet schon mit der Annahme.
    // „Später zahlen erlaubt“: nicht direkt weiterleiten, die Seite zeigt „Zahlung einrichten“ und „Ich zahle später“.
    if (offer && !offer.isTest && !offer.allowPayLater) {
      const zahlart = parseZahlart(formData.get("zahlart"), { ueberweisung: ueberweisungMoeglich(offer) });
      // Überweisung (nur auf Anfrage freigegeben): Rechnung statt Bezahlseite, die Seite zeigt danach die Bankdaten
      if (zahlart === "ueberweisung") {
        const res = await richteUeberweisungEin(offer.id);
        revalidatePath(`/angebot/${token}`);
        return res.ok ? { ok: true } : { error: res.error };
      }
      const checkout = await createCheckoutForOffer(offer.id, zahlart);
      if ("url" in checkout) redirect(checkout.url);
    }
  }
  return { ok: true };
}

/** Zahlung (erneut) starten – z. B. nach Abbruch auf der Bezahlseite. */
export async function startPaymentAction(token: string, zahlart?: string): Promise<{ url?: string; ok?: boolean; error?: string }> {
  if (!checkLimit("offerAccept", clientIp(await headers())).ok) return { error: RATE_LIMIT_MESSAGE };
  const offer = await getOfferByToken(token);
  if (!offer) return { error: "Angebot nicht gefunden." };
  const gewaehlt = parseZahlart(zahlart, { ueberweisung: ueberweisungMoeglich(offer) });
  if (gewaehlt === "ueberweisung") {
    const r = await richteUeberweisungEin(offer.id);
    revalidatePath(`/angebot/${token}`);
    return r.ok ? { ok: true } : { error: r.error };
  }
  const res = await createCheckoutForOffer(offer.id, gewaehlt);
  return "url" in res ? { url: res.url } : { error: res.error };
}

/**
 * „Ich zahle später, erinnern Sie mich am …“ (Ole, 16.11.2026). Nur wenn Ole „Später zahlen erlauben“ am Angebot
 * gesetzt hat; frühestens morgen, spätestens 14 Tage vor dem Start (serverseitig geprüft).
 */
export async function setPayLaterAction(token: string, date: string): Promise<{ ok?: boolean; error?: string }> {
  if (!checkLimit("offerAccept", clientIp(await headers())).ok) return { error: RATE_LIMIT_MESSAGE };
  const res = await setzeErinnerungPerToken(token, String(date ?? ""));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/angebot/${token}`);
  return { ok: true };
}
