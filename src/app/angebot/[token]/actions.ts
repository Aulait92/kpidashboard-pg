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
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { annahmeImBrowser, direktLink, direktZugang, merkeAnnahme } from "@/lib/annahme-direktzugang-server";

export type AcceptState = { ok?: boolean; error?: string; checkoutUrl?: string };

/** Formularwert „rhythmus“: jahr bzw. voraus → im Voraus (jährlich bzw. 6 Monate), monat → monatlich, sonst keine Angabe. */
const parseRhythmus = (v: FormDataEntryValue | null): boolean | null => (v === "jahr" || v === "voraus" ? true : v === "monat" ? false : null);

/** Formularwert „produkte“ (JSON, nur mit Produktwahl): fehlt = wie im Angebot; Prüfung in lib/offer-pricing.ts resolveProduktWahl. */
function parseProdukte(v: FormDataEntryValue | null): unknown {
  if (typeof v !== "string" || !v.trim() || v.length > 4000) return null;
  try {
    return JSON.parse(v);
  } catch {
    return "ungueltig";
  }
}

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
    // Produkte und Tagesbudget (nur mit Freigabe am Angebot; Preis rechnet der Server neu)
    products: parseProdukte(formData.get("produkte")),
    // Erste Woche (nur Pay-per-Lead + Software mit Lead-Produkt): Anzahl, Wiederholung, Registernummer
    ersteWoche:
      formData.get("ersteWocheMenge") != null
        ? { quantity: formData.get("ersteWocheMenge"), autoRenew: formData.get("ersteWocheWiederholen") === "on", registerNr: String(formData.get("registerNr") ?? "") }
        : null,
    ip: ip === "unknown" ? null : ip,
    agent: h.get("user-agent"),
  });
  if (!res.ok) return { error: res.error };
  // Diesen Browser merken: danach „Passwort jetzt festlegen“ statt nur Warten auf die Mail (lib/annahme-direktzugang.ts)
  const angenommen = await getOfferByToken(token);
  if (angenommen) await merkeAnnahme(angenommen.id).catch((err) => reportError(err, "angebot-direktzugang-cookie"));
  revalidatePath(`/angebot/${token}`);
  // Direkt weiter zur Zahlung (gewählte Zahlart, Standard Lastschrift). Serverseitige
  // Weiterleitung: Die Seite wechselt nach der Annahme in die Zahlungsansicht,
  // ein clientseitiger Redirect im Formular käme deshalb nicht mehr zum Zug.
  if (billingEnabled()) {
    const offer = angenommen;
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
      // Zahlungsseite nicht erstellt (Ole, 19.11.2026): nie „Auftrag bestätigt, Zugang kommt per Mail“ zeigen, obwohl
      // nichts bezahlt ist. Fehler melden und auf die Zahlungsansicht mit „Zahlung erneut starten“ leiten.
      reportError(new Error(`Checkout nach Annahme fehlgeschlagen: ${checkout.error}`), "angebot-checkout", { offer: offer.id });
      await sendToAdmins({ title: "Zahlung nach Annahme hängt", body: `${offer.number}: Zahlungsseite konnte nicht erstellt werden (${checkout.error})`, url: offer.salesContactId ? `/admin/neu/vertrieb/kontakte/${offer.salesContactId}` : "/admin/neu" }).catch(() => {});
      redirect(`/angebot/${token}?zahlung=fehler#zahlung`);
    }
  }
  return { ok: true };
}

/**
 * „Passwort jetzt festlegen“ (Ole, 20.11.2026): nur in dem Browser, in dem das Angebot angenommen wurde, und nur,
 * solange sich der Kunde noch nie angemeldet hat. Erzeugt erst beim Tippen einen frischen, kurz gültigen Link; der Link
 * aus der Willkommens-Mail bleibt gültig. Legt die Zahlung das Login gerade erst an (Stripe-Webhook), kurz warten.
 */
export async function passwortJetztAction(token: string): Promise<{ url?: string; error?: string; angemeldet?: boolean }> {
  if (!checkLimit("offerAccept", clientIp(await headers())).ok) return { error: RATE_LIMIT_MESSAGE };
  const offer = await getOfferByToken(token);
  if (!offer || !(await annahmeImBrowser(offer.id))) return { error: "Bitte nutzen Sie den Link aus der E-Mail mit Ihrem Zugang." };
  let zugang = await direktZugang(offer.id);
  for (let i = 0; zugang.stand === "wartet" && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    zugang = await direktZugang(offer.id);
  }
  if (zugang.stand === "angemeldet") return { angemeldet: true };
  if (zugang.stand === "wartet") return { error: "Ihr Zugang wird gerade angelegt. Bitte tippen Sie in ein paar Sekunden noch einmal." };
  const url = await direktLink(offer.id, zugang);
  return url ? { url } : { error: "Das hat gerade nicht geklappt. Bitte nutzen Sie den Link aus der E-Mail." };
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
