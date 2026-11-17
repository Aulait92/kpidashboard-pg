import { getOfferByToken } from "@/lib/offers";
import { createCheckoutForOffer } from "@/lib/billing";
import { getAppUrl } from "@/lib/email";
import { checkLimit, clientIp } from "@/lib/rate-limit";
import { zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import { ueberweisungMoeglich } from "@/lib/ueberweisung";

// Direkter Zahlungslink aus der Zahlungserinnerung (Mail und WhatsApp, Ole 16.11.2026): öffnet die
// Stripe-Bezahlseite (Lastschrift oder Karte). Bereits bezahlt, Testangebot oder Fehler → Angebotsseite.
// Eine noch offene Bezahlseite wird wiederverwendet (createCheckoutForOffer), Vorschau-Abrufe von
// Mailprogrammen erzeugen also keine Doppelzahlung.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const offer = await getOfferByToken(token);
  if (!offer) return new Response("Nicht gefunden", { status: 404 });
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    base = new URL(req.url).origin;
  }
  const page = `${base}/angebot/${encodeURIComponent(token)}`;
  if (offer.status !== "accepted" || offer.isTest || zahlungEingerichtet(offer) || !checkLimit("offerAccept", clientIp(req.headers)).ok) {
    return Response.redirect(page, 303);
  }
  // Überweisung freigegeben: Angebotsseite mit Auswahl (Lastschrift, Karte, Überweisung) statt direkt Stripe
  if (ueberweisungMoeglich(offer)) return Response.redirect(`${page}#zahlung`, 303);
  const res = await createCheckoutForOffer(offer.id);
  return Response.redirect("url" in res ? res.url : page, 303);
}
